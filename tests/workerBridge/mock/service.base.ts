import { Observable } from "rxjs";
import { RxjsBridge } from "../../../src";

export abstract class ServiceBase extends RxjsBridge {
  abstract justComplete(): Observable<any>;
  abstract alreadyCompleted(): Observable<any>;
  abstract longRunningOne(): Observable<any>;
  abstract sharedOne(): Observable<any>;
}