import { Subject, Observable, BehaviorSubject, OperatorFunction } from "rxjs";
import { WebSocket } from 'ws';
import type { SocketHandler } from "./socketHandler";

export class RxjsBridge {
  public _worker!: Worker;
  public _sh!: SocketHandler;
  public _output!: Observable<RxjsBridgeMessage>;
  public _packetId = 0;
  public _serviceName!: string;
  public _bridgedMethods!: string[];
  public _bridgedProperties!: bridgedProp[];
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

export interface bridgedProp {
  key: string;
  operators: OperatorFunction<any, any>[];
  observable: Observable<unknown>;
}
