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
} from 'rxjs';
import { RxjsBridge, RxjsBridgeMessage } from './rxjsbridge';
import { rxBridgeHealthMonitor } from './health.monitor';
const registeredServices: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WorkerMethod<Args extends any[]>(
  target: RxjsBridge,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: TypedPropertyDescriptor<any>
) {
  descriptor.value = function (...args: Args) {
    return new Observable((observer) => {
      const packetId = target._packetId++;
      target._worker.postMessage({
        id: packetId,
        data: args,
        method,
        service: target._serviceName,
      } as RxjsBridgeMessage);
      target._output
        .pipe(
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
        target._worker.postMessage({
          id: packetId,
          method,
          complete: true,
          service: target._serviceName,
        } as RxjsBridgeMessage);
      };
    });
  };
  return descriptor;
}

export function WorkerBridge(worker: Worker, serviceName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function <This, Args extends any[]>(
    target: new (...args: Args) => This
  ) {
    target.prototype._serviceName = serviceName;
    target.prototype._worker = worker;
    const _output = new Subject<RxjsBridgeMessage>();
    target.prototype._output = _output.pipe(
      share({ resetOnRefCountZero: true })
    );
    if (addEventListener == undefined) {
      console.warn('worker host is being used in non-worker environment');
      return;
    }
    worker.addEventListener('message', (ev) => {
      const msg = ev.data as RxjsBridgeMessage;
      if (msg.service !== serviceName) {
        return;
      }
      _output.next(msg);
    });
    target.prototype._packetId = 0;
    return target;
  };
}
export function WorkerHost(serviceName: string) {
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
        const _input$ = new Subject<RxjsBridgeMessage>();
        const input$ = _input$.pipe(share({ resetOnRefCountZero: true }));
        if (typeof addEventListener === 'undefined') {
          super(...args);
          console.warn('addEventListener is not available in this environment');
          return;
        }
        addEventListener('message', (event) => {
          const msg = event.data as RxjsBridgeMessage;
          if (msg.service !== serviceName) {
            return;
          }
          _input$.next(msg);
        });
        _input$
          .pipe(
            filter((msg) => !msg.complete),
            tap((msg) => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              if (!this[msg.method]) {
                throw new Error(
                  `method:"${msg.method}" does not exist in host service:"${serviceName}"`
                );
              }
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              const obs: Observable<any> = this[msg.method](
                ...msg.data
              ) as Observable<any>;
              if (obs === undefined) {
                throw new Error(`method ${msg.method} is not initialized`);
              }
              rxBridgeHealthMonitor.addJoint({
                id: msg.id,
                method: msg.method,
                service: serviceName,
                type: 'worker',
              });
              obs
                .pipe(
                  takeUntil(
                    input$.pipe(
                      filter((m) => m.id === msg.id && m.complete),
                      take(1),
                      tap(() => {
                        rxBridgeHealthMonitor.removeJoint(
                          msg.id,
                          'worker',
                          msg.method
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
                    postMessage({
                      id: msg.id,
                      method: msg.method,
                      data,
                      complete: false,
                      service: serviceName,
                    } as RxjsBridgeMessage);
                  },
                  complete: () => {
                    rxBridgeHealthMonitor.removeJoint(
                      msg.id,
                      'worker',
                      msg.method
                    );
                    postMessage({
                      id: msg.id,
                      method: msg.method,
                      complete: true,
                      service: serviceName,
                    } as RxjsBridgeMessage);
                  },
                });
            })
          )
          .subscribe({
            error: (err) => {
              console.error('worker host error', serviceName, err);
            },
            complete: () => {
              console.log('worker host complete', serviceName);
            },
          });
        super(...args);
      }
    };
  };
}
