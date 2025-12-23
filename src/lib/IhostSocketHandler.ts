import { Observable } from "rxjs";
import { WebSocket as NodeWebSocket } from "ws";
import { IncomingMessage } from "http";
import { RxjsBridgeMessage } from "./rxjsbridge";
export abstract class IHostSocketHandler {
  public abstract readonly clientConnection$: Observable<ClientConnection>;
  public abstract registeredServices: string[];
  public abstract hasAccessTo(
    req: IncomingMessage,
    api: ApiAccessParams
  ): Observable<boolean>;
}

export interface ClientConnection {
  socket: NodeWebSocket;
  req: IncomingMessage;
  onClose$: Observable<void>;
  onMessage$: Observable<RxjsBridgeMessage>;
}

export interface ApiAccessParams {
  serviceName: string;
  method?: string;
  property?: string;
}
