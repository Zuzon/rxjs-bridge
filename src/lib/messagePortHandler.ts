import { BehaviorSubject, shareReplay, Subject, share } from "rxjs";
import { RxjsBridgeMessage } from "./rxjsbridge";
import { SocketHandler } from "./socketHandler";

/** The part of a DOM (or Node global) `MessagePort` the handler uses. */
export interface MessagePortLike {
  postMessage(message: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: () => void): void;
  start(): void;
  close(): void;
}

/**
 * Client transport over a `MessagePort` whose other end is served by a
 * `PortHostSocketHandler`; use it with `WebSocketBridge` like a `WebSocketHandler`.
 * A closed port does not reconnect: the host hands out a new port instead.
 */
export class MessagePortHandler extends SocketHandler {
  private _input$ = new Subject<RxjsBridgeMessage>();
  private _connected$ = new BehaviorSubject<boolean>(false);
  private _started = false;
  private _closed = false;

  public output$ = this._input$.pipe(share({ resetOnRefCountZero: true }));
  public connected$ = this._connected$.pipe(shareReplay(1));

  constructor(private port: MessagePortLike) {
    super();
  }

  public start(): void {
    if (this._started) {
      return;
    }
    this._started = true;
    this.port.addEventListener("message", (event) => {
      try {
        this._input$.next(
          (typeof event.data === "string"
            ? JSON.parse(event.data)
            : event.data) as RxjsBridgeMessage
        );
      } catch (e) {
        console.error("rxjs-bridge: Malformed data received", e);
      }
    });
    this.port.addEventListener("close", () => this.markClosed());
    this.port.start();
    this._connected$.next(true);
  }

  public send(msg: RxjsBridgeMessage): void {
    if (this._closed) {
      return;
    }
    try {
      this.port.postMessage(JSON.stringify(msg));
    } catch (ex) {
      console.warn("failed to send message", msg, ex);
    }
  }

  /** Closes the port; bridged streams complete as on a socket disconnect. */
  public close(): void {
    this.port.close();
    this.markClosed();
  }

  private markClosed(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._connected$.next(false);
  }
}
