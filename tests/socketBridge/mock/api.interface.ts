import { Observable } from "rxjs";
import { RxjsBridge } from "../../../src";

export abstract class FirstTestServiceBase extends RxjsBridge {
  abstract justComplete(): Observable<any>;
  abstract alreadyCompleted(): Observable<any>;
  abstract longRunningOne(): Observable<any>;
  abstract sharedOne(): Observable<any>;
  abstract readonly counter$: Observable<number>;
  abstract brokenMethod(): Observable<any>;
  abstract internalBrokenMethod(): Observable<any>;
  abstract brokenProp$: Observable<any>;
  abstract multiValuesShared$: Observable<number>;
}
