import { Subject } from "rxjs";
import { WebSocket } from 'ws';
import { SocketHandler } from "./socketHandler";

export class RxBridge {
  public _worker!: Worker;
  public _sh!: SocketHandler;
  public _output!: Subject<RxBridgeMessage>;
  public _packetId = 0;
  public _serviceName!: string;
}

export interface RxBridgeMessage {
  id: number;
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  complete: boolean;
  service: string;
}

export interface WsRxSignal {
  msg: RxBridgeMessage;
  client: WebSocket;
  address: string;
}
