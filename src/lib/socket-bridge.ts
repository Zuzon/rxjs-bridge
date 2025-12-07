import {
  BehaviorSubject,
  Observable,
  Subject,
  dematerialize,
  distinctUntilChanged,
  filter,
  map,
  materialize,
  race,
  share,
  shareReplay,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';
import { RawData, WebSocket as NodeWebSocket, WebSocketServer } from 'ws';
import {
  RxjsBridge,
  RxjsBridgeMessage,
  RxjsBridgeObservable,
  WsRxSignal,
} from './rxjsbridge';
import { SocketHandler } from './socketHandler';
import { IncomingMessage } from 'http';
import { rxjsBridgeHealthMonitor } from './health.monitor';

export class WebSocketHandler extends SocketHandler {
  private _ws!: WebSocket;
  private _$input = new Subject<RxjsBridgeMessage>();
  private _$disconnect = new Subject<void>();
  private _$connected = new BehaviorSubject<boolean>(false);
  private _started = false;

  public $output = this._$input.pipe(share({ resetOnRefCountZero: true}));
  public $disconnected = this._$disconnect.pipe(share({ resetOnRefCountZero: true}));
  public $connected = this._$connected.pipe(shareReplay(1));

  constructor(private address: string) {
    super();
  }

  private connect(): void {
    this._ws = new WebSocket(this.address);
    this._ws.onopen = () => {
      this._$connected.next(true);
    };
    this._ws.addEventListener('close', () => {
      this._$disconnect.next();
      setTimeout(() => {
        this.connect();
      }, 500);
    });
    this._ws.addEventListener('message', (msg) => {
      this._$input.next(JSON.parse(msg.data));
    });
  }
  private _send(msg: RxjsBridgeMessage): void {
    try {
      this._ws.send(JSON.stringify(msg));
    } catch (ex) {
      console.warn('failed to send message', msg, ex);
    }
  }

  public start() {
    if (this._started) {
      return;
    }
    this.connect();
    this._started = true;
  }

  public send(msg: RxjsBridgeMessage): void {
    this._send(msg);
  }
}

export function WebSocketHost(serviceName: string, wss: WebSocketServer) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  return function <T extends { new (...args: any[]): {} }>(
    constructor: T
  ): T | void {
    return class extends constructor {
      constructor(...args: any[]) {
        wss.on('connection', (socket: NodeWebSocket, req: IncomingMessage) => {
          const _input$ = new Subject<WsRxSignal>();
          const input$ = _input$.pipe(share({ resetOnRefCountZero: true}));
          const onClose = new Subject<void>();
          socket.on('error', () => {
            onClose.next();
          });
          socket.on('close', () => {
            console.log('socket close', serviceName);
            onClose.next();
          });
          socket.on('message', (data: RawData) => {
            const msg = JSON.parse(data.toString()) as RxjsBridgeMessage;
            if (msg.service !== serviceName) {
              return;
            }
            _input$.next({
              client: socket,
              msg,
              address: req.socket.remoteAddress ?? '',
            });
          });
          input$
            .pipe(
              takeUntil(onClose.pipe(take(1))),
              filter((sig) => !sig.msg.complete),
              tap((sig) => {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const obs = this[sig.msg.method](
                  ...sig.msg.data
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ) as Observable<any>;
                if (obs === undefined) {
                  throw new Error(
                    `method ${sig.msg.method} is not initialized`
                  );
                }
                rxjsBridgeHealthMonitor.addJoint({
                  id: sig.msg.id,
                  method: sig.msg.method,
                  property: sig.msg.property,
                  service: serviceName,
                  type: 'socket',
                });
                obs
                  .pipe(
                    tap({
                      complete: () => {
                        rxjsBridgeHealthMonitor.removeJoint(
                          sig.msg.id,
                          'socket',
                        );
                      },
                    }),
                    share({ resetOnRefCountZero: true}),
                    takeUntil(
                      race([
                        input$.pipe(
                          filter(
                            (s) =>
                              s.msg.id === sig.msg.id &&
                              s.msg.complete &&
                              sig.address === s.address
                          ),
                          take(1)
                        ),
                        onClose.pipe(take(1)),
                      ]).pipe(
                        take(1),
                        tap(() => {
                          rxjsBridgeHealthMonitor.removeJoint(
                            sig.msg.id,
                            'socket',
                          );
                        })
                      )
                    ),
                    materialize()
                  )
                  .subscribe({
                    next: (data) => {
                      if (data.error) {
                        (data.error as any) = JSON.parse(
                          JSON.stringify(
                            data.error,
                            Object.getOwnPropertyNames(data.error)
                          )
                        );
                      }
                      sig.client.send(
                        JSON.stringify({
                          id: sig.msg.id,
                          method: sig.msg.method,
                          property: sig.msg.property,
                          data,
                          complete: false,
                          service: serviceName,
                        })
                      );
                    },
                  });
              })
            )
            .subscribe();
        });
        super(...args);
      }
    };
  };
}

export function WebSocketBridge(wh: WebSocketHandler, serviceName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function <This, Args extends any[]>(
    target: new (...args: Args) => This
  ) {
    target.prototype._serviceName = serviceName;
    target.prototype._sh = wh;
    target.prototype._output = wh.$output.pipe(
      filter((msg) => msg.service === serviceName),
      share({ resetOnRefCountZero: true})
    );
    target.prototype._packetId = 0;
    return target;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SocketMethod<Args extends any[]>(
  target: RxjsBridge,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: TypedPropertyDescriptor<any>
) {
  const done = new Subject<void>();
  const activeObservables: RxjsBridgeObservable<unknown>[] = [];
  descriptor.value = function (...args: Args) {
    let activeObservable = activeObservables.find(
      (o) => o.argsJson === JSON.stringify(args)
    );
    if (!activeObservable) {
      activeObservable = {
        argsJson: JSON.stringify(args),
        observable: target._sh.$connected.pipe(
          distinctUntilChanged((c1, c2) => c1 === c2),
          filter((c) => c),
          switchMap(() =>
            new Observable((observer) => {
              const packetId = target._packetId++;
              target._sh.send({
                id: packetId,
                data: args,
                method,
                service: target._serviceName,
              } as RxjsBridgeMessage);
              target._output
                .pipe(
                  takeUntil(
                    race([
                      target._sh.$disconnected,
                      target._output.pipe(
                        filter(
                          (msg) =>
                            msg.id === packetId &&
                            msg.method === method &&
                            msg.complete
                        )
                      ),
                    ])
                  ),
                  filter(
                    (msg) =>
                      msg.id === packetId &&
                      msg.method === method &&
                      !msg.complete &&
                      msg.service === target._serviceName
                  ),
                  map((msg) => msg.data),
                  dematerialize()
                )
                .subscribe({
                  next: (data) => observer.next(data),
                  error: (err) => observer.error(err),
                  complete: () => observer.complete(),
                });
              return () => {
                target._sh.send({
                  id: packetId,
                  method,
                  complete: true,
                  service: target._serviceName,
                } as RxjsBridgeMessage);
              };
            }).pipe(
              tap({
                complete: () => {
                  if (activeObservable) {
                    activeObservables.splice(
                      activeObservables.indexOf(activeObservable),
                      1
                    );
                  }
                  done.next();
                  done.complete();
                },
              })
            )
          ),
          takeUntil(done),
          shareReplay({ bufferSize: 1, refCount: true })
        ),
      };
      activeObservables.push(activeObservable);
    }
    return activeObservable.observable;
  };
  return descriptor;
}
