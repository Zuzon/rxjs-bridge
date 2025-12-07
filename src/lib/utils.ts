import { BehaviorSubject } from "rxjs";
import { RxjsBridge } from "./rxjsbridge"

export const initRxBridgeProps = (target: RxjsBridge) => {
  if (!target._bridgedMethods) {
    target._bridgedMethods = [];
  }
  if (!target._bridgedProperties) {
    target._bridgedProperties = [];
  }
  if (target._packetId === undefined) {
    target._packetId = 0;
  }
  if (!target._bridgeConnected) {
    target._bridgeConnected = new BehaviorSubject<boolean>(false);
  }
  return target;
};
