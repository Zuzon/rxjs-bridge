// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  filter,
  firstValueFrom,
  fromEvent,
  map,
  NEVER,
  Observable,
  of,
  Subject,
  throwError,
  toArray,
  finalize,
} from "rxjs";
import {
  MessagePortHandler,
  PortConnection,
  PortHostSocketHandler,
  RxjsBridge,
  SocketMethod,
  SocketObservable,
  WebSocketBridge,
  WebSocketHost,
} from "../../src";

abstract class EchoServiceBase extends RxjsBridge {
  abstract counter$: Observable<number>;
  abstract echo(value: string): Observable<string>;
  abstract fail(): Observable<never>;
  abstract forever(): Observable<never>;
}

const portHost = new PortHostSocketHandler();
const foreverStopped$ = new Subject<void>();

@WebSocketHost("echo", portHost)
class EchoServiceHost extends EchoServiceBase {
  counter$ = of(1, 2, 3);
  echo(value: string): Observable<string> {
    return of(value);
  }
  fail(): Observable<never> {
    return throwError(() => new Error("boom"));
  }
  forever(): Observable<never> {
    return NEVER.pipe(finalize(() => foreverStopped$.next()));
  }
}
new EchoServiceHost();

function createEchoBridge(handler: MessagePortHandler): EchoServiceBase {
  @WebSocketBridge(handler, "echo")
  class EchoServiceBridge extends EchoServiceBase {
    @SocketObservable()
    counter$!: Observable<number>;
    @SocketMethod()
    echo(): Observable<string> {
      throw new Error("bridge stub");
    }
    @SocketMethod()
    fail(): Observable<never> {
      throw new Error("bridge stub");
    }
    @SocketMethod()
    forever(): Observable<never> {
      throw new Error("bridge stub");
    }
  }
  return new EchoServiceBridge();
}

/** What a hosting app does with each new port, e.g. Electron's MessagePortMain. */
function connectClient(address: string) {
  const { port1, port2 } = new MessageChannel();
  const conn: PortConnection = {
    send: (data) => port1.postMessage(data),
    message$: fromEvent<MessageEvent>(port1, "message").pipe(map((e) => e.data)),
    close$: fromEvent(port1, "close"),
    address,
  };
  portHost.connect(conn);
  port1.start();
  const handler = new MessagePortHandler(port2);
  handler.start();
  return { handler, bridge: createEchoBridge(handler) };
}

describe("Message port bridge", () => {
  const { handler, bridge } = connectClient("test:1");

  it("streams a property until the host completes it", async () => {
    expect(await firstValueFrom(bridge.counter$.pipe(toArray()))).toEqual([
      1, 2, 3,
    ]);
  });

  it("passes method arguments and results", async () => {
    expect(await firstValueFrom(bridge.echo("hi"))).toBe("hi");
  });

  it("delivers host errors as plain objects", async () => {
    await expect(firstValueFrom(bridge.fail())).rejects.toMatchObject({
      message: "boom",
    });
  });

  it("serves several clients independently", async () => {
    const second = connectClient("test:2");
    expect(await firstValueFrom(second.bridge.echo("two"))).toBe("two");
    second.handler.close();
  });

  it("stops host streams when the client port closes", async () => {
    const stopped = firstValueFrom(foreverStopped$);
    const connected = firstValueFrom(
      handler.connected$.pipe(filter((c) => !c)),
    );
    bridge.forever().subscribe();
    await new Promise((resolve) => setTimeout(resolve, 50));
    handler.close();
    await stopped;
    expect(await connected).toBe(false);
  });
});
