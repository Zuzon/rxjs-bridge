import { Observable } from "rxjs";
import { RxBridgeMessage } from "./rxbridge";

export abstract class SocketHandler {
  public abstract $output: Observable<RxBridgeMessage>;
  public abstract $disconnected: Observable<void>;
  public abstract $connected: Observable<boolean>;
  public abstract send(msg: RxBridgeMessage): void;
  public abstract start(): void;
}
