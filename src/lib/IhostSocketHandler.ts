import { Observable } from "rxjs";
import { IncomingMessage } from "http";
import { RxjsBridgeMessage } from "./rxjsbridge";
export abstract class IHostSocketHandler {
  public abstract readonly clientConnection$: Observable<ClientConnection>;
  public abstract registeredServices: string[];
  public abstract hasAccessTo(
    req: IncomingMessage | undefined,
    api: ApiAccessParams
  ): Observable<boolean>;
}

/** Outgoing side of a client connection; a `ws` WebSocket satisfies it. */
export interface BridgeSocket {
  send(data: string): void;
}

export interface ClientConnection {
  socket: BridgeSocket;
  /** HTTP upgrade request; only set for WebSocket connections. */
  req?: IncomingMessage;
  /** Identifies the peer, e.g. its remote IP address. */
  address: string;
  onClose$: Observable<void>;
  onMessage$: Observable<RxjsBridgeMessage>;
}

export interface ApiAccessParams {
  serviceName: string;
  method?: string;
  property?: string;
}
