import {
  Observable,
  filter,
  map,
  Subject,
  tap,
  takeUntil,
  take,
  share,
  materialize,
  dematerialize,
  OperatorFunction,
  interval,
  BehaviorSubject,
  startWith,
  switchMap,
  timeout,
  catchError,
} from "rxjs";
import { RxjsBridge, RxjsBridgeMessage } from "./rxjsbridge";
import { rxjsBridgeHealthMonitor } from "./health.monitor";
import { initRxBridgeProps } from "./utils";
const registeredServices: string[] = [];
export const BRIDGE_OBSERVABLE = new Observable<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WorkerMethod() {
  return function <Args extends any[]>(
    target: RxjsBridge,
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor: TypedPropertyDescriptor<any>
  ) {
    initRxBridgeProps(target);
    target._bridgedMethods.push(method);
    descriptor.value = function (...args: Args) {
      return new Observable((observer) => {
        const packetId = target._packetId++;
        const res = target._output
          .pipe(
            filter(
              (msg) =>
                msg.id === packetId &&
                msg.method === method &&
                msg.service === target._serviceName
            ),
            map((msg) => msg.data),
            dematerialize()
          )
          .subscribe({
            next: (data) => {
              observer.next(data);
            },
            error: (err) => observer.error(err),
            complete: () => {
              observer.complete();
            },
          });
        target._bridgeConnected
          .pipe(
            filter((c) => c),
            take(1),
            map(() => {
              target._worker.postMessage({
                id: packetId,
                data: args,
                method,
                service: target._serviceName,
              } as RxjsBridgeMessage);
              return res;
            })
          )
          .subscribe();

        return () => {
          target._worker.postMessage({
            id: packetId,
            method,
            complete: true,
            service: target._serviceName,
          } as RxjsBridgeMessage);
        };
      }).pipe();
    };
    return descriptor;
  };
}

export function WorkerObservable(...args: OperatorFunction<any, any>[]) {
  return function (target: RxjsBridge, propertyKey: string) {
    initRxBridgeProps(target);
    target._bridgedProperties.push(propertyKey);
    let obs = new Observable((observer) => {
      const packetId = target._packetId++;
      target._output
        .pipe(
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
          error: (err) => observer.error(err),
          complete: () => {
            observer.complete();
          },
        });
      target._bridgeConnected
        .pipe(
          filter((c) => c),
          take(1)
        )
        .subscribe(() => {
          target._worker.postMessage({
            id: packetId,
            data: args,
            property: propertyKey,
            service: target._serviceName,
          } as RxjsBridgeMessage);
        });

      return () => {
        target._worker.postMessage({
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
    Object.defineProperty(target, propertyKey, {
      get: () => {
        return obs;
      },
    });
  };
}

export function WorkerBridge(worker: Worker, serviceName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  return function <T extends { new (...args: any[]): RxjsBridge }>(
    constructor: T
  ): T | void {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        constructor.prototype._serviceName = serviceName;
        constructor.prototype._worker = worker;
        initRxBridgeProps(constructor.prototype);
        const _output = new Subject<RxjsBridgeMessage>();
        constructor.prototype._output = _output.pipe(
          share({ resetOnRefCountZero: true })
        );
        const listener = (ev: MessageEvent) => {
          const msg = ev.data as RxjsBridgeMessage;
          if (msg.service !== serviceName) {
            return;
          }
          if (msg.id === -1) {
            constructor.prototype._bridgedMethods.map((m: string) => {
              if (!(msg.data.methods as string[]).includes(m)) {
                constructor.prototype._bridgeConnected.error(new Error(`Method ${m} is not supported by service: ${serviceName}`));
                return;
              }
            });
            constructor.prototype._bridgedProperties.map((p: string) => {
              if (!(msg.data.properties as string[]).includes(p)) {
                constructor.prototype._bridgeConnected.error(new Error(`Property ${p} is not supported by service: ${serviceName}`));
                return;
              }
            });
            constructor.prototype._bridgeConnected.next(true);
            return;
          }
          _output.next(msg);
        };
        worker.addEventListener("message", listener);
        interval(100)
          .pipe(
            startWith(0),
            takeUntil(
              (constructor.prototype as RxjsBridge)._bridgeConnected.pipe(
                filter((c) => c),
                take(1),
                timeout(50),
                catchError((err) => {
                  if (err.message.includes("Timeout")) {
                    throw new Error(`service ${serviceName} is not connected`);
                  }
                  throw err;
                })
              )
            )
          )
          .subscribe(() => {
            constructor.prototype._worker.postMessage({
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
export function WorkerHost(serviceName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  return function <T extends { new (...args: any[]): {} }>(
    constructor: T
  ): T | void {
    return class extends constructor {
      constructor(...args: any[]) {
        constructor.prototype._bridgeConnected = new BehaviorSubject<boolean>(
          false
        );
        if (registeredServices.includes(serviceName)) {
          console.warn(`service ${serviceName} already registered`);
          super(...args);
          return;
        }
        registeredServices.push(serviceName);
        const _input$ = new Subject<RxjsBridgeMessage>();
        const input$ = _input$.pipe(share({ resetOnRefCountZero: true }));
        if (typeof addEventListener === "undefined") {
          super(...args);
          console.warn("addEventListener is not available in this environment", serviceName);
          return;
        }
        global.addEventListener("message", (event) => {
          const msg = event.data as RxjsBridgeMessage;

          if (msg.service !== serviceName) {
            return;
          }
          if (msg.id === -1) {
            constructor.prototype._bridgeConnected.next(true);
            global.postMessage({
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
            } as RxjsBridgeMessage);
            return;
          }
          _input$.next(msg);
        });
        _input$
          .pipe(
            filter((msg) => !msg.complete),
            tap((msg) => {
              if (msg.isCheck) {
                global.postMessage({
                  id: msg.id,
                  method: msg.method,
                  property: msg.property,
                  data: {
                    kind: "N",
                    value: "OK",
                  },
                  complete: true,
                  service: serviceName,
                } as RxjsBridgeMessage);
                return;
              }
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              if (!this[msg.method] && !this[msg.property]) {
                throw new Error(
                  `method:"${msg.method}" or property:"${msg.property}" does not exist in host service:"${serviceName}"`
                );
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
              let obs: Observable<any>;
              if (msg.method) {
                try {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  obs = this[msg.method](...msg.data) as Observable<any>;
                } catch (err) {
                  const errJson = JSON.parse(
                    JSON.stringify(err, Object.getOwnPropertyNames(err))
                  );
                  global.postMessage({
                    id: msg.id,
                    method: msg.method,
                    property: msg.property,
                    data: {
                      kind: "E",
                      error: errJson,
                    },
                    complete: true,
                    service: serviceName,
                  } as RxjsBridgeMessage);
                  return;
                }
              } else if (msg.property) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                obs = this[msg.property];
              } else {
                throw new Error(`non existing API`);
              }

              if (obs === undefined) {
                throw new Error(`method ${msg.method} is not initialized`);
              }

              rxjsBridgeHealthMonitor.addJoint({
                id: msg.id,
                method: msg.method,
                property: msg.property,
                service: serviceName,
                type: "worker",
              });
              obs
                .pipe(
                  takeUntil(
                    input$.pipe(
                      filter((m) => m.id === msg.id && m.complete),
                      take(1),
                      tap(() => {
                        rxjsBridgeHealthMonitor.removeJoint(msg.id, "worker");
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
                    global.postMessage({
                      id: msg.id,
                      method: msg.method,
                      property: msg.property,
                      data,
                      complete: false,
                      service: serviceName,
                    } as RxjsBridgeMessage);
                  },
                  complete: () => {
                    rxjsBridgeHealthMonitor.removeJoint(msg.id, "worker");
                    global.postMessage({
                      id: msg.id,
                      method: msg.method,
                      property: msg.property,
                      complete: true,
                      service: serviceName,
                    } as RxjsBridgeMessage);
                  },
                });
            })
          )
          .subscribe({
            error: (err) => {
              console.error("worker host error", serviceName, err);
            },
            complete: () => {
              console.log("worker host complete", serviceName);
            },
          });
        super(...args);
      }
    };
  };
}
