# rxjs-bridge

**rxjs-bridge** lets you use RxJS Observables across execution boundaries as if they were local.

It transparently bridges Observables between:

- **Web Workers ↔ UI thread**

- **Node.js servers ↔ clients (via WebSockets)**

You can create Observables in a worker or on a server and subscribe to them from the UI thread or a remote client without changing how you write RxJS code.

### What it solves

RxJS works great inside a single runtime, but breaks down when you need to:

- Move heavy logic into a Web Worker

- Stream reactive data from a Node.js backend

- Share reactive state across threads or processes

Normally this requires:

- Manual message passing

- Custom protocols

- Boilerplate serialization logic

- Re-implementing unsubscribe, errors, and completion

**rxjs-bridge removes all of that.**

### How it works

- Observables are proxied across boundaries

- next, error, complete, and unsubscribe are forwarded automatically

- Subscriptions stay synchronized on both sides

- Transport-agnostic (postMessage, WebSocket, etc.)

From the consumer’s perspective, it’s just an RxJS Observable.

### Key features

- Seamless Observable usage across threads and processes

- Full RxJS semantics preserved (next, error, complete, teardown)

- Works with Web Workers and Node.js over WebSockets

- **Zero dependencies** (besides RxJS itself)

- No RxJS API changes required

- Minimal boilerplate

- Designed for high-frequency streams

### Example use cases

- Heavy data processing in a Web Worker, streamed reactively to the UI

- Real-time server state exposed as Observables to clients

- Shared reactive models between frontend and backend

- Offloading sensor, video, or telemetry processing without breaking reactivity

### Philosophy

> If it’s an Observable there, it should behave like an Observable here.

rxjs-bridge treats execution boundaries as an implementation detail, not an architectural limitation.

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
