import './worker.mock';
import { WorkerHost, RxjsBridge } from "../../../src";
import { Observable, of, share, Subject, timer } from "rxjs";
import { ServiceBase } from './service.base';

@WorkerHost('first')
export class WorkerHostFirstServiceMock extends ServiceBase {
  public sharedSubject = new Subject();
  private _sharedSubject = this.sharedSubject.pipe(share());
  override sharedOne(): Observable<any> {
    return this._sharedSubject;
  }
  public longRunningSubject = timer(10000);
  public longRunningOne(): Observable<any> {
    return this.longRunningSubject;
  }
  public alreadyCompletedSubject = new Subject();

  constructor() {
    super();
    this.alreadyCompletedSubject.complete();
  }
  public justComplete(): Observable<any> {
    return of();
  }

  public alreadyCompleted(): Observable<any> {
    return this.alreadyCompletedSubject;
  }
}

@WorkerHost('second')
export class WorkerHostSecondServiceMock extends RxjsBridge {
  public subject(): Observable<any> {
    return of(true);
  }
}
