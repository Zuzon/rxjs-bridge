import { WebSocketServer } from "ws";
import { HostSocketHandler } from "../../../src";
export const wsServer = new WebSocketServer({ port: 8080 });
export const hostSocketHandler = new HostSocketHandler(wsServer);
