import { WorkerBridge, RxjsBridge, WorkerMethod } from "../../../src";
import { Observable } from "rxjs";
import { worker } from "./worker.mock";
import { ServiceBase } from "./service.base";

@WorkerBridge(worker as Worker, 'first')
export class WorkerBridgeFirstServiceMock extends ServiceBase {
  @WorkerMethod
  override sharedOne(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @WorkerMethod
  override longRunningOne(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @WorkerMethod
  public justComplete(): Observable<any> {
    throw new Error('Method not implemented.');
  }
  @WorkerMethod
  public alreadyCompleted(): Observable<any> {
    throw new Error('Method not implemented.');
  }
}

@WorkerBridge(worker as Worker, 'second')
export class WorkerBridgeSecondServiceMock extends RxjsBridge {
  @WorkerMethod
  public subject(): Observable<any> {
    throw new Error('Method not implemented.');
  }
}