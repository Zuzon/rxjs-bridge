import { Subject } from "rxjs";

const host = new Subject<any>();
const bridge = new Subject<any>();
global.addEventListener = (event: string, cb: any) => {
  bridge.subscribe(cb);
}
global.postMessage = (event) => {
  host.next({
    data: event
  });
  return true;
}
export const worker = {
  postMessage: (msg: any) => {
    bridge.next({
      data: msg
    });
  },
  addEventListener: (event: string, cb: any) => {
    host.subscribe(cb);
  },
};
