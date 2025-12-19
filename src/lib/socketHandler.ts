import { Observable } from "rxjs";
import { RxjsBridgeMessage } from "./rxjsbridge";

export abstract class SocketHandler {
  public abstract output$: Observable<RxjsBridgeMessage>;
  public abstract connected$: Observable<boolean>;
  public abstract send(msg: RxjsBridgeMessage): void;
  public abstract start(): void;
}
