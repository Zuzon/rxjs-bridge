import { Subject, Observable, BehaviorSubject } from "rxjs";
import { WebSocket } from 'ws';
import type { SocketHandler } from "./socketHandler";

export class RxjsBridge {
  public _worker!: Worker;
  public _sh!: SocketHandler;
  public _output!: Observable<RxjsBridgeMessage>;
  public _packetId = 0;
  public _serviceName!: string;
  public _bridgedMethods!: string[];
  public _bridgedProperties!: string[];
  public _bridgeConnected!: BehaviorSubject<boolean>;
}

export interface RxjsBridgeMessage {
  id: number;
  method: string;
  property: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  complete: boolean;
  service: string;
  isCheck?: boolean;
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
