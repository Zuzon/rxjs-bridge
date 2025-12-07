import { WorkerBridge, RxjsBridge, WorkerMethod, WorkerObservable } from "../../../src";
import { Observable, share } from "rxjs";
import { worker } from "./worker.mock";
import { ServiceBase } from "./service.base";

@WorkerBridge(worker as Worker, 'first')
export class WorkerBridgeFirstServiceMock extends ServiceBase {
  @WorkerObservable(share())
  override multiValuesShared$!: Observable<number>;
  @WorkerMethod()
  override internalBrokenMethod(): Observable<any> {
    throw new Error("Method not implemented.");
  }
  @WorkerMethod()
  override brokenMethod(): Observable<any> {
    throw new Error("Method not overriden by WorkerMehod decorator.");
  }
  @WorkerObservable()
  override brokenProp$!: Observable<any>;
  @WorkerObservable()
  override counter$!: Observable<number>;
  @WorkerMethod()
  override sharedOne(): Observable<any> {
    throw new Error("Method not overriden by WorkerMehod decorator.");
  }
  @WorkerMethod()
  override longRunningOne(): Observable<any> {
    throw new Error("Method not overriden by WorkerMehod decorator.");
  }
  @WorkerMethod()
  public justComplete(): Observable<any> {
    throw new Error('Method not overriden by WorkerMehod decorator.');
  }
  @WorkerMethod()
  public alreadyCompleted(): Observable<any> {
    throw new Error('Method not overriden by WorkerMehod decorator.');
  }
}

@WorkerBridge(worker as Worker, 'second')
export class WorkerBridgeSecondServiceMock extends RxjsBridge {
  @WorkerMethod()
  public subject(): Observable<any> {
    throw new Error('Method not overriden by WorkerMehod decorator.');
  }
  @WorkerMethod()
  public nonExistent(): Observable<any> {
    throw new Error('Method not overriden by WorkerMehod decorator.');
  }
}

@WorkerBridge(worker as Worker, 'non-existent')
export class WorkerBridgeNonExistentServiceMock extends RxjsBridge {
  @WorkerMethod()
  public subject(): Observable<any> {
    throw new Error('Method not overriden by WorkerMehod decorator.');
  }
}

@WorkerBridge(worker as Worker, 'third')
export class WorkerBridgeThirdServiceMock extends RxjsBridge {
  @WorkerObservable()
  public nonExistentSubject$!: Observable<void>;
}
