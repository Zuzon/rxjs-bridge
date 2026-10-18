import { Subject, Observable, BehaviorSubject, OperatorFunction } from "rxjs";
import type { SocketHandler } from "./socketHandler";
import type { BridgeSocket } from "./IhostSocketHandler";

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
  client: BridgeSocket;
  address: string;
}

export interface bridgedProp {
  key: string;
  operators: OperatorFunction<any, any>[];
  observable: Observable<unknown>;
}

export interface BridgeConfig {
  syncTimeout: number;
}
