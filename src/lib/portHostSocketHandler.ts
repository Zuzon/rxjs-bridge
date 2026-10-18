import { IncomingMessage } from "http";
import {
  Observable,
  of,
  ReplaySubject,
  share,
  Subject,
  take,
  takeUntil,
} from "rxjs";
import {
  ApiAccessParams,
  ClientConnection,
  IHostSocketHandler,
} from "./IhostSocketHandler";
import { RxjsBridgeMessage } from "./rxjsbridge";

/**
 * One client of a message-port style transport (Electron `MessagePortMain`,
 * a nodejs-mobile channel, ...), adapted by the hosting app.
 */
export interface PortConnection {
  /** Delivers one serialized bridge message to the client. */
  send(data: string): void;
  /** Serialized (or already structured-cloned) bridge messages from the client. */
  message$: Observable<unknown>;
  /** Emits once the client is gone. */
  close$: Observable<unknown>;
  /** Identifies the client, e.g. `renderer:3`. */
  address: string;
}

/**
 * Host side of message-port transports: pass it to `WebSocketHost` like a
 * `HostSocketHandler`, then hand every new client to `connect()`.
 */
export class PortHostSocketHandler implements IHostSocketHandler {
  private _clientConnection$ = new Subject<ClientConnection>();
  public readonly clientConnection$ = this._clientConnection$.pipe(share());
  public registeredServices: string[] = [];

  public hasAccessTo(
    req: IncomingMessage | undefined,
    api: ApiAccessParams
  ): Observable<boolean> {
    return of(true);
  }

  public connect(conn: PortConnection): void {
    const onClose$ = new ReplaySubject<void>(1);
    const onMessage$ = new Subject<RxjsBridgeMessage>();
    let closed = false;
    // Announce first so the hosts listen before any message is forwarded.
    this._clientConnection$.next({
      // Hosts still report completions while tearing down; the port is gone by then.
      socket: { send: (data) => !closed && conn.send(data) },
      address: conn.address,
      onClose$: onClose$.asObservable(),
      onMessage$: onMessage$.asObservable(),
    });
    conn.close$.pipe(take(1)).subscribe(() => {
      closed = true;
      onClose$.next();
      onClose$.complete();
      onMessage$.complete();
    });
    conn.message$.pipe(takeUntil(onClose$)).subscribe((data) => {
      try {
        onMessage$.next(
          (typeof data === "string" ? JSON.parse(data) : data) as RxjsBridgeMessage
        );
      } catch (e) {
        console.error("rxjs-bridge: Malformed data received", e);
      }
    });
  }
}
