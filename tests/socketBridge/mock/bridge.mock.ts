import { Observable, share } from "rxjs";
import { FirstTestServiceBase } from "./api.interface";
import {
  RxjsBridge,
  SocketMethod,
  SocketObservable,
  WebSocketBridge,
} from "../../../src";
import { wsHandler } from "./clientSocket";

@WebSocketBridge(wsHandler, "first")
export class FirstTestServiceBridge extends FirstTestServiceBase {
  @SocketMethod()
  longRunningOne(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @SocketMethod()
  sharedOne(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @SocketObservable()
  counter$: Observable<number>;
  @SocketMethod()
  brokenMethod(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @SocketMethod()
  internalBrokenMethod(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @SocketObservable()
  brokenProp$: Observable<any>;
  @SocketObservable(share())
  multiValuesShared$: Observable<number>;
  @SocketMethod()
  alreadyCompleted(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @SocketMethod()
  justComplete(): Observable<void> {
    throw new Error("Method not implemented.");
  }
  @SocketMethod()
  limitedWork(): Observable<number> {
    throw new Error("Method not implemented.");
  }
}

@WebSocketBridge(wsHandler, "second")
export class SocketBridgeSecondServiceMock extends RxjsBridge {
  @SocketMethod()
  public subject(): Observable<any> {
    throw new Error("Method not overriden by SocketMehod decorator.");
  }
  @SocketMethod()
  public nonExistent(): Observable<any> {
    throw new Error("Method not overriden by SocketMehod decorator.");
  }
}

@WebSocketBridge(wsHandler, "third")
export class SocketBridgeThirdServiceMock extends RxjsBridge {
  @SocketObservable()
  public nonExistentSubject$!: Observable<void>;
}

@WebSocketBridge(wsHandler, "non-existent")
export class SocketBridgeNonExistentServiceMock extends RxjsBridge {
  @SocketMethod()
  public subject(): Observable<any> {
    throw new Error("Method not overriden by SocketMehod decorator.");
  }
}
