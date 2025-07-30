import { describe, beforeEach, it, expect, vi } from "vitest";
import { rxjsBridgeHealthMonitor } from "../../src";
import { worker } from "./mock/worker.mock";
import {
  WorkerBridgeFirstServiceMock,
  WorkerBridgeSecondServiceMock,
} from "./mock/workerBridge.mock";
import {
  WorkerHostFirstServiceMock,
  WorkerHostSecondServiceMock,
} from "./mock/workerHost.mock";

describe("Worker bridge", () => {
  let firstHost = new WorkerHostFirstServiceMock();
  // let secondHost: WorkerHostSecondServiceMock;
  let firstBridge = new WorkerBridgeFirstServiceMock();
  // let secondBridge: WorkerBridgeSecondServiceMock;
  it("Should just complete", () => {
    const handler = {
      next: () => {},
      complete: () => {},
    };
    const spyNext = vi.spyOn(handler, "next");
    const spyComplete = vi.spyOn(handler, "complete");
    const subsription = firstBridge.justComplete().subscribe(handler);
    expect(spyNext).toHaveBeenCalledTimes(0);
    expect(spyComplete).toHaveBeenCalledTimes(1);
    expect(subsription.closed).toBe(true);
  });

  it("Should trigger complete when host observable already completed", () => {
    const handler = {
      next: () => {},
      complete: () => {},
    };
    const spyNext = vi.spyOn(handler, "next");
    const spyComplete = vi.spyOn(handler, "complete");
    const subsription = firstBridge.alreadyCompleted().subscribe(handler);
    expect(spyNext).toHaveBeenCalledTimes(0);
    expect(spyComplete).toHaveBeenCalledTimes(1);
    expect(subsription.closed).toBe(true);
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
});
