import { describe, it, expect, vi } from "vitest";
import { rxjsBridgeHealthMonitor } from "../../src";
import {
  WorkerBridgeFirstServiceMock,
  WorkerBridgeNonExistentServiceMock,
  WorkerBridgeSecondServiceMock,
  WorkerBridgeThirdServiceMock,
} from "./mock/workerBridge.mock";
import {
  WorkerHostFirstServiceMock,
  WorkerHostSecondServiceMock,
  WorkerHostThirdServiceMock,
} from "./mock/workerHost.mock";
import { take } from "rxjs";

describe("Worker bridge", () => {
  let firstHost = new WorkerHostFirstServiceMock();
  let firstBridge = new WorkerBridgeFirstServiceMock();
  it("Should just complete", async () => {
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
      firstBridge.justComplete().subscribe(handler);
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

  it("Should stop host subject if client unsubscribes", () => {
    const subsription1 = firstBridge.longRunningOne().subscribe();
    const subsription2 = firstBridge.longRunningOne().subscribe();
    expect(rxjsBridgeHealthMonitor.checkHealth().workerJointAmount).toBe(2);
    subsription1.unsubscribe();
    expect(rxjsBridgeHealthMonitor.checkHealth().workerJointAmount).toBe(1);
    subsription2.unsubscribe();
    expect(rxjsBridgeHealthMonitor.checkHealth().workerJointAmount).toBe(0);
  });

  it("Should handle shared observable", () => {
    const handler1 = {
      next: () => {},
    };
    const handler2 = {
      next: () => {},
    };
    const spy1 = vi.spyOn(handler1, "next");
    const spy2 = vi.spyOn(handler2, "next");
    firstBridge.sharedOne().subscribe(handler1);
    firstHost.sharedSubject.next(1);
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy1).toBeCalledWith(1);
    firstBridge.sharedOne().subscribe(handler2);
    firstHost.sharedSubject.next(2);
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

  it("PropertyObservable broken", () => {
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
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(msg).eq("I`m broken!");
  });

  it("broken method", () => {
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
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(msg).toEqual("something wrong happened!");
  });

  it("internal broken method", () => {
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
  it("should fail if non-existing method contains", async () => {
    const errors: string[] = [];
    const handler = (event: ErrorEvent) => {
      errors.push(event.message);
    };
    process.on("uncaughtException", handler);
    await new Promise<void>((resolve) => {
      const host = new WorkerHostSecondServiceMock();
      const service = new WorkerBridgeSecondServiceMock();
      setTimeout(() => {
        resolve();
      }, 0);
    });
    process.off("uncaughtException", handler);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(
      "Method nonExistent is not supported by service: second"
    );
  });
  it("should fail if non-existing property contains", async () => {
    const errors: string[] = [];
    const handler = (event: ErrorEvent) => {
      errors.push(event.message);
    };
    process.on("uncaughtException", handler);
    await new Promise<void>((resolve) => {
      const host = new WorkerHostThirdServiceMock();
      const service = new WorkerBridgeThirdServiceMock();
      setTimeout(() => {resolve(); }, 0);
    });
    process.off("uncaughtException", handler);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('Property nonExistentSubject$ is not supported by service: third');
  });
  it("should fail if service name incorrect or not exists", async () => {
    const errors: string[] = [];
    const handler = (event: ErrorEvent) => {
      errors.push(event.message);
    };
    process.on("uncaughtException", handler);
    await new Promise<void>((resolve) => {
      const service = new WorkerBridgeNonExistentServiceMock();
      setTimeout(() => {
        resolve();
      }, 5100);
    });
    process.off("uncaughtException", handler);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe("service non-existent is not connected");
  }, 5200);
});
