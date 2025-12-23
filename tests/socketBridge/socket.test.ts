import { describe, it, expect, vi } from "vitest";
import { rxjsBridgeHealthMonitor } from "../../src";
import {
  FirstTestServiceHost,
  SocketHostSecondServiceMock,
  SocketHostThirdServiceMock,
} from "./mock/host.mock";
import {
  FirstTestServiceBridge,
  SocketBridgeNonExistentServiceMock,
  SocketBridgeSecondServiceMock,
  SocketBridgeThirdServiceMock,
} from "./mock/bridge.mock";
import { take } from "rxjs";

describe("Socket bridge", () => {
  let firstHost = new FirstTestServiceHost();
  let firstBridge = new FirstTestServiceBridge();
  it.skip("should fail if non-existing property contains", async () => {
    const errors: string[] = [];
    const handler = (event: ErrorEvent) => {
      errors.push(event.message);
    };
    process.on("uncaughtException", handler);
    await new Promise<void>((resolve) => {
      const host = new SocketHostThirdServiceMock();
      const service = new SocketBridgeThirdServiceMock();
      setTimeout(() => {
        resolve();
      }, 50);
    });
    process.off("uncaughtException", handler);
    console.log("should fail if non-existing property contains", errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(
      "Property nonExistentSubject$ is not supported by service: third"
    );
  });
  it.skip("should fail if non-existing method contains", async () => {
    const errors: string[] = [];
    const handler = (event: ErrorEvent) => {
      errors.push(event.message);
    };
    process.on("uncaughtException", handler);
    await new Promise<void>((resolve) => {
      const host = new SocketHostSecondServiceMock();
      const service = new SocketBridgeSecondServiceMock();
      setTimeout(() => {
        resolve();
      }, 50);
    });
    process.off("uncaughtException", handler);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(
      "Method nonExistent is not supported by service: second"
    );
  });

  it("Should just complete", async () => {
    await new Promise<void>((resolve) => {
      const handler = {
        next: () => {},
        complete: () => {
          expect(spyNext).toHaveBeenCalledTimes(0);
          expect(spyComplete).toHaveBeenCalledTimes(1);
          resolve();
        },
        error: () => {},
      };
      const spyNext = vi.spyOn(handler, "next");
      const spyComplete = vi.spyOn(handler, "complete");
      try {
        firstBridge.justComplete().subscribe(handler);
      } catch (e) {
        console.log(e);
        resolve();
      }
    });
  });
  it("Should trigger complete when host observable already completed", async () => {
    await new Promise<void>((resolve) => {
      const handler = {
        next: () => {},
        complete: () => {
          expect(spyNext).toHaveBeenCalledTimes(0);
          expect(spyComplete).toHaveBeenCalledTimes(1);
          resolve();
        },
      };
      const spyNext = vi.spyOn(handler, "next");
      const spyComplete = vi.spyOn(handler, "complete");
      firstBridge.alreadyCompleted().subscribe(handler);
    });
  });
  it("Should stop host subject if client unsubscribes", async () => {
    await new Promise<void>(async (resolve) => {
      const subsription1 = firstBridge.longRunningOne().subscribe();
      const subsription2 = firstBridge.longRunningOne().subscribe();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rxjsBridgeHealthMonitor.checkHealth().socketJointAmount).toBe(2);
      subsription1.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rxjsBridgeHealthMonitor.checkHealth().socketJointAmount).toBe(1);
      subsription2.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rxjsBridgeHealthMonitor.checkHealth().socketJointAmount).toBe(0);
      resolve();
    });
  });

  it("Should handle shared observable", async () => {
    const handler1 = {
      next: () => {},
    };
    const handler2 = {
      next: () => {},
    };
    const spy1 = vi.spyOn(handler1, "next");
    const spy2 = vi.spyOn(handler2, "next");
    firstBridge.sharedOne().subscribe(handler1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    firstHost.sharedSubject.next(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy1).toBeCalledWith(1);
    firstBridge.sharedOne().subscribe(handler2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    firstHost.sharedSubject.next(2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy1).toHaveBeenCalledTimes(2);
    expect(spy1).toBeCalledWith(2);
    expect(spy2).toHaveBeenCalledTimes(1);
    expect(spy2).toBeCalledWith(2);
  });

  it("PropertyObservable", async () => {
    await new Promise<void>((resolve) => {
      const handler1 = {
        next: () => {},
        complete: () => {},
        error: () => {},
      };
      const spy1 = vi.spyOn(handler1, "next");
      handler1.complete = () => {
        expect(spy1).toHaveBeenCalledTimes(1);
        expect(spy1).toBeCalledWith(0);
        expect((firstHost.counter$ as any).observers?.length).toBe(undefined);
        resolve();
      };
      firstBridge.counter$.pipe(take(1)).subscribe(handler1);
    });
  });

  it("PropertyObservable broken", async () => {
    let msg = "";
    const handler1 = {
      next: () => {},
      complete: () => {},
      error: (e: any) => {
        msg = e.message;
      },
    };
    const spy1 = vi.spyOn(handler1, "error");
    firstBridge.brokenProp$.subscribe(handler1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(msg).eq("I`m broken!");
  });

  it("broken method", async () => {
    let msg = "";
    const handler1 = {
      next: () => {},
      complete: () => {},
      error: (e: any) => {
        msg = e.message;
      },
    };
    const spy1 = vi.spyOn(handler1, "error");
    firstBridge.brokenMethod().subscribe(handler1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(msg).toEqual("something wrong happened!");
  });

  it("internal broken method", async () => {
    let msg = "";
    const handler1 = {
      next: () => {},
      complete: () => {},
      error: (e: any) => {
        msg = e.message;
      },
    };
    const spy1 = vi.spyOn(handler1, "error");
    firstBridge.internalBrokenMethod().subscribe(handler1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(msg).toEqual("something internally wrong happened!");
  });
  it("shared prop", async () => {
    await new Promise<void>((resolve) => {
      firstBridge.multiValuesShared$.subscribe({
        next: (value) => {
          if (value < 2) {
            firstBridge.multiValuesShared$.subscribe((value) => {
              expect(value).toBe(2);
            });
          }
        },
        complete: () => {
          resolve();
        },
      });
    });
  });
  it("should fail if service name incorrect or not exists", async () => {
    const errors: string[] = [];
    const handler = (event: ErrorEvent) => {
      errors.push(event.message);
    };
    process.on("uncaughtException", handler);
    await new Promise<void>((resolve) => {
      const service = new SocketBridgeNonExistentServiceMock();
      setTimeout(() => {
        resolve();
      }, 5100);
    });
    process.off("uncaughtException", handler);
    console.log("should fail if service name incorrect or not exists", errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe("service non-existent is not connected");
  }, 5200);
});
