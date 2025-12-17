import { WebSocketHandler } from "../../../src";

export const wsHandler = new WebSocketHandler(
  `ws://localhost:8080`
);
wsHandler.start();
