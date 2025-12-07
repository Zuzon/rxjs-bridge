# rxjs-bridge

seamless observables between browser, server, worker.

## Installation

`npm i --save rxjs-bridge`

## Usage

You can build a bridge between UI, worker or server. Here are examples with different scenarios:

### workers
[sample demo](https://github.com/Zuzon/rxjs-bridge-worker-demo)

Define Interface first:
```js
import { Observable } from "rxjs";
import { RxjsBridge } from "rxjs-bridge";

export abstract class ServiceBase extends RxjsBridge { // extends RxjsBridge - mandatory
  abstract Hello(msg: string): Observable<string>;
  abstract Counter(): Observable<number>;
  abstract info$: Observable<string>;
}
```
In your worker:
```js
import { interval, map, Observable, of, pairwise } from "rxjs";
import { ServiceBase } from "./service.base";
import { WorkerHost } from "rxjs-bridge";

@WorkerHost("my-service") // you may have multiple services, each should have unique name
class Service extends ServiceBase {
  info$: Observable<string> = interval(16).pipe(
    map(() => new Date().toISOString())
  );
  Counter(): Observable<number> {
    return interval(1000);
  }
  Hello(msg: string): Observable<string> {
    return of("worker received: " + msg);
  }
}

new Service();
```
In UI thread:
```js
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
}); // there are several different ways how to instantiate a worker...

@WorkerBridge(worker, "my-service") // pass worker instance and service name
class MyService extends ServiceBase {
  @WorkerObservable(share()) // properties should have a @WorkerObservable decorator. you can also pass extra rxjs operators
  override info$!: Observable<string>;
  @WorkerMethod() // mandatory decorator here
  Counter(): Observable<number> {
    // no implementation required here
    // normally this code will never be executed
    throw new Error("Bridge init failed");
  }
  @WorkerMethod() // mandatory decorator here
  Hello(msg: string): Observable<string> {
    // no implementation required here
    // normally this code will never be executed
    throw new Error("Bridge init failed");
  }
}

const service = new MyService(); // keep single service instance

// ready to use
service.info$.subscribe((result) => {
  console.log(result);
});
```

### web sockets
WIP

## Demos
Webworkers: Minimalistic Vite+React project https://github.com/Zuzon/rxjs-bridge-worker-demo
