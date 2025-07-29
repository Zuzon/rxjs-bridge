import { Subject, Observable } from "rxjs";
import { WebSocket } from 'ws';
import type { SocketHandler } from "./socketHandler";

export class RxjsBridge {
  public _worker!: Worker;
  public _sh!: SocketHandler;
  public _output!: Subject<RxjsBridgeMessage>;
  public _packetId = 0;
  public _serviceName!: string;
}

export interface RxjsBridgeMessage {
  id: number;
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  complete: boolean;
  service: string;
}

export interface WsRxSignal {
  msg: RxjsBridgeMessage;
  client: WebSocket;
  address: string;
}

export interface RxjsBridgeObservable<T> {
  argsJson: string;
  observable: Observable<T>;
}
