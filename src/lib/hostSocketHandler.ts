import { IncomingMessage } from "http";
import { Observable, of, share, shareReplay, Subject } from "rxjs";
import { WebSocket as NodeWebSocket, RawData, WebSocketServer } from "ws";
import { ApiAccessParams, ClientConnection } from "./IhostSocketHandler";
import { RxjsBridgeMessage } from "./rxjsbridge";

export class HostSocketHandler {
  public hasAccessTo(
    req: IncomingMessage,
    api: ApiAccessParams
  ): Observable<boolean> {
    return of(true).pipe(shareReplay(1));
  }
  private _clientConnection$ = new Subject<ClientConnection>();
  public readonly clientConnection$ = this._clientConnection$.pipe(share());
  public registeredServices: string[] = [];
  constructor(wsServer: WebSocketServer) {
    wsServer.on("connection", (socket: NodeWebSocket, req: IncomingMessage) => {
      const onClose$ = new Subject<void>();
      const onMessage$ = new Subject<RxjsBridgeMessage>();
      this._clientConnection$.next({
        socket,
        req,
        onClose$: onClose$.pipe(share({ resetOnRefCountZero: true })),
        onMessage$: onMessage$.pipe(share({ resetOnRefCountZero: true })),
      });
      socket.on("close", () => {
        console.log('socket close');
        onClose$.next();
        onClose$.complete();
        onMessage$.complete();
      });
      socket.on("message", (data: RawData) => {
        const msg = JSON.parse(data.toString()) as RxjsBridgeMessage;
        onMessage$.next(msg);
      });
    });
  }
}
