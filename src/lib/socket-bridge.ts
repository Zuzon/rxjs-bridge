import {
  BehaviorSubject,
  Observable,
  OperatorFunction,
  Subject,
  catchError,
  dematerialize,
  distinctUntilChanged,
  filter,
  interval,
  map,
  materialize,
  of,
  race,
  share,
  shareReplay,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
  timeout,
} from "rxjs";
import { RawData, WebSocket as NodeWebSocket, WebSocketServer } from "ws";
import {
  bridgedProp,
  RxjsBridge,
  RxjsBridgeMessage,
  WsRxSignal,
} from "./rxjsbridge";
import { SocketHandler } from "./socketHandler";
import { IncomingMessage } from "http";
import { rxjsBridgeHealthMonitor } from "./health.monitor";
import { initRxBridgeProps } from "./utils";

const registeredServices: string[] = [];
export class WebSocketHandler extends SocketHandler {
  private _ws!: WebSocket;
  private _input$ = new Subject<RxjsBridgeMessage>();
  private _disconnect$ = new Subject<void>();
  private _connected$ = new BehaviorSubject<boolean>(false);
  private _started = false;

  public output$ = this._input$.pipe(share({ resetOnRefCountZero: true }));
  public disconnected$ = this._disconnect$.pipe(
    share({ resetOnRefCountZero: true })
  );
  public connected$ = this._connected$.pipe(shareReplay(1));

  constructor(private address: string) {
    super();
  }

  private connect(): void {
    this._ws = new WebSocket(this.address);
    this._ws.onerror = (err) => {
      console.error("socket error", err);
    };
    this._ws.onopen = () => {
      this._connected$.next(true);
    };
    this._ws.addEventListener("close", () => {
      this._disconnect$.next();
      setTimeout(() => {
        this.connect();
      }, 500);
    });
    this._ws.addEventListener("message", (msg) => {
      this._input$.next(JSON.parse(msg.data));
    });
  }
  private _send(msg: RxjsBridgeMessage): void {
    try {
      this._ws.send(JSON.stringify(msg));
    } catch (ex) {
      console.warn("failed to send message", msg, ex);
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
        if (registeredServices.includes(serviceName)) {
          console.warn(`service ${serviceName} already registered`);
          super(...args);
          return;
        }
        registeredServices.push(serviceName);
        wss.on("connection", (socket: NodeWebSocket, req: IncomingMessage) => {
          const _input$ = new Subject<WsRxSignal>();
          const input$ = _input$.pipe(share({ resetOnRefCountZero: true }));
          const onClose = new Subject<void>();
          socket.on("error", () => {
            onClose.next();
          });
          socket.on("close", () => {
            onClose.next();
          });
          socket.on("message", (data: RawData) => {
            const msg = JSON.parse(data.toString()) as RxjsBridgeMessage;
            if (msg.service !== serviceName) {
              return;
            }
            if (msg.id === -1) {
              socket.send(
                JSON.stringify({
                  id: msg.id,
                  data: {
                    properties: Object.getOwnPropertyNames(this),
                    methods: Object.getOwnPropertyNames(
                      constructor.prototype
                    ).filter(
                      (p) => !["constructor", "_bridgeConnected"].includes(p)
                    ),
                  },
                  complete: true,
                  service: serviceName,
                })
              );
              return;
            }
            _input$.next({
              client: socket,
              msg,
              address: req.socket.remoteAddress ?? "",
            });
          });
          input$
            .pipe(
              takeUntil(onClose.pipe(take(1))),
              filter((sig) => !sig.msg.complete),
              tap((sig) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
                let obs: Observable<any>;
                if (sig.msg.method) {
                  try {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    obs = this[sig.msg.method](
                      ...sig.msg.data
                    ) as Observable<any>;
                  } catch (err) {
                    const errJson = JSON.parse(
                      JSON.stringify(err, Object.getOwnPropertyNames(err))
                    );
                    sig.client.send(
                      JSON.stringify({
                        id: sig.msg.id,
                        method: sig.msg.method,
                        property: sig.msg.property,
                        data: {
                          kind: "E",
                          error: errJson,
                        },
                        complete: false,
                        service: serviceName,
                      })
                    );
                    return;
                  }
                } else {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  obs = this[sig.msg.property];
                }
                rxjsBridgeHealthMonitor.addJoint({
                  id: sig.msg.id,
                  method: sig.msg.method,
                  property: sig.msg.property,
                  service: serviceName,
                  type: "socket",
                });
                obs
                  .pipe(
                    tap({
                      complete: () => {
                        rxjsBridgeHealthMonitor.removeJoint(
                          sig.msg.id,
                          "socket"
                        );
                      },
                    }),
                    share({ resetOnRefCountZero: true }),
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
                            "socket"
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

export function WebSocketBridge(wh: SocketHandler, serviceName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  return function <T extends { new (...args: any[]): RxjsBridge }>(
    constructor: T
  ): T | void {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        constructor.prototype._serviceName = serviceName;
        constructor.prototype._sh = wh;
        initRxBridgeProps(constructor.prototype);
        const _output = new Subject<RxjsBridgeMessage>();
        constructor.prototype._output = _output.pipe(
          share({ resetOnRefCountZero: true })
        );
        constructor.prototype._bridgedProperties.map((p: bridgedProp) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this[p.key] = p.observable;
        });
        wh.output$
          .pipe(filter((msg) => msg.service === serviceName))
          .subscribe({
            next: (msg: RxjsBridgeMessage) => {
              if (msg.id === -1) {
                constructor.prototype._bridgedMethods.map((m: string) => {
                  if (!(msg.data.methods as string[]).includes(m)) {
                    constructor.prototype._bridgeConnected.error(
                      new Error(
                        `Method ${m} is not supported by service: ${serviceName}`
                      )
                    );
                    return;
                  }
                });
                constructor.prototype._bridgedProperties.map(
                  (p: bridgedProp) => {
                    if (!(msg.data.properties as string[]).includes(p.key)) {
                      constructor.prototype._bridgeConnected.error(
                        new Error(
                          `Property ${p.key} is not supported by service: ${serviceName}`
                        )
                      );
                      return;
                    }
                  }
                );
                constructor.prototype._bridgeConnected.next(true);
                return;
              }
              _output.next(msg);
            },
            complete: () => {
              _output.complete();
            },
          });
        (constructor.prototype as RxjsBridge)._sh.connected$
          .pipe(
            distinctUntilChanged(),
            filter((c) => c),
            switchMap(() =>
              interval(100).pipe(
                startWith(0),
                takeUntil(
                  (constructor.prototype as RxjsBridge)._bridgeConnected.pipe(
                    filter((c) => c),
                    take(1),
                    timeout(5000),
                    catchError((err) => {
                      if (err.message.includes("Timeout")) {
                        throw new Error(
                          `service ${serviceName} is not connected`
                        );
                      }
                      throw err;
                    })
                  )
                )
              )
            )
          )
          .subscribe(() => {
            (constructor.prototype._sh as SocketHandler).send({
              id: -1,
              complete: true,
              service: serviceName,
            } as RxjsBridgeMessage);
          });
        constructor.prototype._packetId = 0;
      }
    };
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SocketMethod() {
  return function <Args extends any[]>(
    target: RxjsBridge,
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor: TypedPropertyDescriptor<any>
  ) {
    initRxBridgeProps(target);
    target._bridgedMethods.push(method);
    descriptor.value = function (...args: Args) {
      const done$ = new Subject<void>();
      return new Observable((observer) => {
        const packetId = target._packetId++;

        target._bridgeConnected
          .pipe(
            filter((c) => c),
            take(1),
            switchMap(() => target._output),
            takeUntil(
              race([
                new Observable((observer) => {
                  if (target._sh) {
                    target._sh.disconnected$.pipe(take(1)).subscribe({
                      next: observer.next,
                      error: observer.error,
                      complete: observer.complete
                    });
                    return;
                  }
                  throw new Error("SocketHandler not initialized");
                }),
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
            error: (err) => {
              observer.error(err);
              done$.next();
              done$.complete();
            },
            complete: () => {
              observer.complete();
              done$.next();
              done$.complete();
            },
          });
        target._sh.connected$
          .pipe(
            distinctUntilChanged((c1, c2) => c1 === c2),
            filter((c) => c),
            switchMap(() =>
              target._bridgeConnected.pipe(
                filter((c) => c),
                take(1)
              )
            ),
            takeUntil(done$),
            map(() => {
              target._sh.send({
                id: packetId,
                data: args,
                method,
                service: target._serviceName,
              } as RxjsBridgeMessage);
            })
          )
          .subscribe();
        return () => {
          done$.next();
          done$.complete();
          target._sh.send({
            id: packetId,
            method,
            complete: true,
            service: target._serviceName,
          } as RxjsBridgeMessage);
        };
      });
    };
    return descriptor;
  };
}

export function SocketObservable(...args: OperatorFunction<any, any>[]) {
  return function (target: RxjsBridge, propertyKey: string) {
    initRxBridgeProps(target);
    const prop: bridgedProp = {
      key: propertyKey,
      operators: args,
      observable: of(),
    };
    const done$ = new Subject<void>();
    let obs = new Observable((observer) => {
      const packetId = target._packetId++;
      target._bridgeConnected
        .pipe(
          filter((c) => c),
          take(1),
          switchMap(() => target._output),
          filter(
            (msg) =>
              msg.id === packetId &&
              msg.property === propertyKey &&
              msg.service === target._serviceName
          ),
          map((msg) => {
            return msg.data;
          }),
          dematerialize()
        )
        .subscribe({
          next: (data) => {
            observer.next(data);
          },
          error: (err) => {
            done$.next();
            done$.complete();
            observer.error(err);
          },
          complete: () => {
            done$.next();
            done$.complete();
            observer.complete();
          },
        });
      target._sh.connected$
        .pipe(
          distinctUntilChanged((c1, c2) => c1 === c2),
          filter((c) => c),
          switchMap(() =>
            target._bridgeConnected.pipe(
              filter((c) => c),
              take(1)
            )
          ),
          takeUntil(done$),
          map(() => {
            target._sh.send({
              id: packetId,
              property: propertyKey,
              service: target._serviceName,
            } as RxjsBridgeMessage);
          })
        )
        .subscribe();

      return () => {
        done$.next();
        done$.complete();
        target._sh.send({
          id: packetId,
          method: propertyKey,
          complete: true,
          service: target._serviceName,
        } as RxjsBridgeMessage);
      };
    });
    if (args && args.length > 0) {
      obs = obs.pipe(...(args as []));
    }
    prop.observable = obs;
    target._bridgedProperties.push(prop);
  };
}
