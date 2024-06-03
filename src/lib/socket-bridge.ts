import {
  BehaviorSubject,
  Observable,
  Subject,
  dematerialize,
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
import { RxBridge, RxBridgeMessage, WsRxSignal } from './rxbridge';
import { SocketHandler } from './socketHandler';
import { IncomingMessage } from 'http';

export class WebSocketHandler extends SocketHandler {
  private _ws!: WebSocket;
  private _$input = new Subject<RxBridgeMessage>();
  private _$disconnect = new Subject<void>();
  private _$connected = new BehaviorSubject<boolean>(false);
  private _started = false;

  public $output = this._$input.pipe(share());
  public $disconnected = this._$disconnect.pipe(share());
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
  private _send(msg: RxBridgeMessage): void {
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

  public send(msg: RxBridgeMessage): void {
    this._send(msg);
  }
}

export function WebSocketHost(serviceName: string, wss: WebSocketServer) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  return function <T extends { new(...args: any[]): {} }>(
    constructor: T
  ): T | void {
    return class extends constructor {
      constructor(...args: any[]) {
        const _input$ = new Subject<WsRxSignal>();
        const input$ = _input$.pipe(share());
        wss.on('connection', (socket: NodeWebSocket, req: IncomingMessage) => {
          const onClose = new Subject<void>();
          socket.on('error', () => {
            onClose.next();
          });
          socket.on('close', () => {
            onClose.next();
          });
          socket.on('message', (data: RawData) => {
            const msg = JSON.parse(data.toString()) as RxBridgeMessage;
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
              takeUntil(onClose),
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
                obs
                  .pipe(
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
                        onClose,
                      ])
                    ),
                    materialize()
                  )
                  .subscribe({
                    next: (data) => {
                      sig.client.send(
                        JSON.stringify({
                          id: sig.msg.id,
                          method: sig.msg.method,
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
      share()
    );
    target.prototype._packetId = 0;
    return target;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SocketMethod<Args extends any[]>(
  target: RxBridge,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: TypedPropertyDescriptor<any>
) {
  descriptor.value = function (...args: Args) {
    const handle = new Observable((observer) => {
      const packetId = target._packetId++;
      target._sh.send({
        id: packetId,
        data: args,
        method,
        service: target._serviceName,
      } as RxBridgeMessage);
      target._output
        .pipe(
          takeUntil(
            race([
              target._sh.$disconnected,
              target._output.pipe(
                filter(
                  (msg) =>
                    msg.id === packetId && msg.method === method && msg.complete
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
        } as RxBridgeMessage);
      };
    });
    return target._sh.$connected.pipe(
      filter((c) => c),
      switchMap(() => {
        return handle;
      })
    );
  };
  return descriptor;
}
