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
import { RxBridge, RxBridgeMessage } from './rxbridge';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WorkerMethod<Args extends any[]>(
  target: RxBridge,
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
      } as RxBridgeMessage);
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
        } as RxBridgeMessage);
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
    const _output = new Subject<RxBridgeMessage>();
    target.prototype._output = _output.pipe(share());
    worker.addEventListener('message', (ev) => {
      const msg = ev.data as RxBridgeMessage;
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
        const _input$ = new Subject<RxBridgeMessage>();
        const input$ = _input$.pipe(share());
        addEventListener('message', (event) => {
          const msg = event.data as RxBridgeMessage;
          if (msg.service !== serviceName) {
            return;
          }
          _input$.next(msg);
        });
        input$
          .pipe(
            filter((m) => !m.complete),
            tap((msg) => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              const obs = this[msg.method](
                ...msg.data
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ) as Observable<any>;
              if (obs === undefined) {
                throw new Error(`method ${msg.method} is not initialized`);
              }
              obs
                .pipe(
                  takeUntil(
                    input$.pipe(
                      filter((m) => m.id === msg.id && m.complete),
                      take(1)
                    )
                  ),
                  materialize()
                )
                .subscribe({
                  next: (data) => {
                    postMessage({
                      id: msg.id,
                      method: msg.method,
                      data,
                      complete: false,
                      service: serviceName,
                    } as RxBridgeMessage);
                  },
                });
            })
          )
          .subscribe();
        super(...args);
      }
    };
  };
}
