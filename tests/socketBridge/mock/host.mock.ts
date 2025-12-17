import { interval, Observable, of, share, Subject, throwError, timer } from "rxjs";
import { FirstTestServiceBase } from "./api.interface";
import { RxjsBridge, WebSocketHost } from "../../../src";
import { wsServer } from "./hostSocket";

@WebSocketHost('first', wsServer)
export class FirstTestServiceHost extends FirstTestServiceBase {
  override multiValuesShared$: Observable<number> = of(1, 2);
  override internalBrokenMethod(): Observable<any> {
    return throwError(() => new Error('something internally wrong happened!'));
  }
  override brokenMethod(): Observable<any> {
    throw new Error('something wrong happened!');
  }
  override brokenProp$: Observable<any> = new Observable((observer) => {
    observer.error(new Error('I`m broken!'));
  })
  override counter$: Observable<number> = interval(1);
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

@WebSocketHost('second', wsServer)
export class SocketHostSecondServiceMock extends RxjsBridge {
  public subject(): Observable<any> {
    return of(true);
  }
}

@WebSocketHost('third', wsServer)
export class SocketHostThirdServiceMock extends RxjsBridge {

}
