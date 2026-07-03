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
  startWith,
  timeout,
  of,
  switchMap,
} from "rxjs";
import {
  BridgeConfig,
  bridgedProp,
  RxjsBridge,
  RxjsBridgeMessage,
} from "./rxjsbridge";
import { rxjsBridgeHealthMonitor } from "./health.monitor";
import { initRxBridgeProps } from "./utils";
import type { Worker } from "worker_threads";
import * as nodeWorkerThreads from "worker_threads";
const { parentPort } = nodeWorkerThreads;
const registeredServices: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WorkerThreadMethod() {
  return function <Args extends any[]>(
    target: RxjsBridge,
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor: TypedPropertyDescriptor<any>,
  ) {
    initRxBridgeProps(target);
    target._bridgedMethods.push(method);
    descriptor.value = function (...args: Args) {
      return new Observable((observer) => {
        const onDestroy$ = new Subject<void>();
        const packetId = target._packetId++;
        const res = target._bridgeConnected
          .pipe(
            filter((c) => c),
            take(1),
            switchMap(() => target._output),
            filter(
              (msg) =>
                msg.id === packetId &&
                msg.method === method &&
                msg.service === target._serviceName,
            ),
            map((msg) => msg.data),
            dematerialize(),
            takeUntil(onDestroy$),
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
            }),
            takeUntil(onDestroy$),
          )
          .subscribe();

        return () => {
          target._worker.postMessage({
            id: packetId,
            method,
            complete: true,
            service: target._serviceName,
          } as RxjsBridgeMessage);
          onDestroy$.next();
          onDestroy$.complete();
        };
      });
    };
    return descriptor;
  };
}

export function WorkerThreadObservable(...args: OperatorFunction<any, any>[]) {
  return function (target: RxjsBridge, propertyKey: string) {
    initRxBridgeProps(target);
    const prop: bridgedProp = {
      key: propertyKey,
      operators: args,
      observable: of(),
    };
    let obs = new Observable((observer) => {
      const onDestroy$ = new Subject<void>();
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
              msg.service === target._serviceName,
          ),
          map((msg) => {
            return msg.data;
          }),
          dematerialize(),
          takeUntil(onDestroy$),
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
          takeUntil(onDestroy$),
        )
        .subscribe(() => {
          target._worker.postMessage({
            id: packetId,
            property: propertyKey,
            service: target._serviceName,
          } as RxjsBridgeMessage);
        });

      return () => {
        target._worker.postMessage({
          id: packetId,
          property: propertyKey,
          complete: true,
          service: target._serviceName,
        } as RxjsBridgeMessage);
        onDestroy$.next();
        onDestroy$.complete();
      };
    });
    if (args && args.length > 0) {
      obs = obs.pipe(...(args as []));
    }
    prop.observable = obs;
    target._bridgedProperties.push(prop);
  };
}

export function WorkerThreadBridge(
  worker: Worker,
  serviceName: string,
  config: BridgeConfig = {
    syncTimeout: 15000,
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  return function <T extends { new (...args: any[]): RxjsBridge }>(
    constructor: T,
  ): T | void {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        constructor.prototype._serviceName = serviceName;
        constructor.prototype._worker = worker;
        initRxBridgeProps(constructor.prototype);
        const _output = new Subject<RxjsBridgeMessage>();
        constructor.prototype._output = _output.pipe(
          share({ resetOnRefCountZero: true }),
        );
        constructor.prototype._bridgedProperties.map((p: bridgedProp) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          this[p.key] = p.observable;
        });
        const listener = (msg: RxjsBridgeMessage) => {
          if (msg.service !== serviceName) {
            return;
          }
          if (msg.id === -1) {
            let hasErrors = false;
            constructor.prototype._bridgedMethods.map((m: string) => {
              if (!(msg.data.methods as string[]).includes(m)) {
                constructor.prototype._bridgeConnected.error(
                  new Error(
                    `Method ${m} is not supported by service: ${serviceName}`,
                  ),
                );
                hasErrors = true;
                return;
              }
            });
            constructor.prototype._bridgedProperties.map((p: bridgedProp) => {
              if (!(msg.data.properties as string[]).includes(p.key)) {
                constructor.prototype._bridgeConnected.error(
                  new Error(
                    `Property ${p.key} is not supported by service: ${serviceName}`,
                  ),
                );
                hasErrors = true;
                return;
              }
            });
            if (!hasErrors) {
              constructor.prototype._bridgeConnected.next(true);
            }
            return;
          }
          _output.next(msg);
        };
        worker.on("message", listener);
        interval(100)
          .pipe(
            startWith(0),
            takeUntil(
              (constructor.prototype as RxjsBridge)._bridgeConnected.pipe(
                filter((c) => c),
                take(1),
                timeout(config.syncTimeout),
              ),
            ),
          )
          .subscribe({
            next: () => {
              constructor.prototype._worker.postMessage({
                id: -1,
                complete: true,
                service: serviceName,
              } as RxjsBridgeMessage);
            },
          });
        constructor.prototype._packetId = 0;
      }
    };
  };
}
export function WorkerThreadHost(serviceName: string) {
  if (!parentPort) {
    throw new Error('Developer error: WorkerThreadHost have no parent port');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  return function <T extends { new (...args: any[]): {} }>(
    constructor: T,
  ): T | void {
    return class extends constructor {
      constructor(...args: any[]) {
        if (registeredServices.includes(serviceName)) {
          console.warn(`service ${serviceName} already registered`);
          super(...args);
          return;
        }
        registeredServices.push(serviceName);
        const _input$ = new Subject<RxjsBridgeMessage>();
        const input$ = _input$.pipe(share({ resetOnRefCountZero: true }));
        if (parentPort === null) {
          super(...args);
          console.warn(
            "parentPort is not available in this environment",
            serviceName,
          );
          return;
        }
        parentPort.on("message", (msg: RxjsBridgeMessage) => {
          if (msg.service !== serviceName) {
            return;
          }
          if (msg.id === -1) {
            parentPort?.postMessage({
              id: msg.id,
              data: {
                properties: Object.getOwnPropertyNames(this),
                methods: Object.getOwnPropertyNames(
                  constructor.prototype,
                ).filter(
                  (p) => !["constructor", "_bridgeConnected"].includes(p),
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
                parentPort?.postMessage({
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
              let obs: Observable<any>;
              if (msg.method) {
                try {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  obs = this[msg.method](...msg.data) as Observable<any>;
                } catch (err) {
                  const errJson = JSON.parse(
                    JSON.stringify(err, Object.getOwnPropertyNames(err)),
                  );
                  parentPort?.postMessage({
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
              } else {
                try {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  obs = this[msg.property];
                  if (!obs.pipe || typeof obs.pipe !== "function") {
                    throw new Error("property not found");
                  }
                } catch (err) {
                  const errJson = JSON.parse(
                    JSON.stringify(err, Object.getOwnPropertyNames(err)),
                  );
                  parentPort?.postMessage({
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
                      }),
                    ),
                  ),
                  materialize(),
                )
                .subscribe({
                  next: (data) => {
                    if (data.error) {
                      (data.error as any) = JSON.parse(
                        JSON.stringify(
                          data.error,
                          Object.getOwnPropertyNames(data.error),
                        ),
                      );
                    }
                    parentPort?.postMessage({
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
                    parentPort?.postMessage({
                      id: msg.id,
                      method: msg.method,
                      property: msg.property,
                      complete: true,
                      service: serviceName,
                    } as RxjsBridgeMessage);
                  },
                });
            }),
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
