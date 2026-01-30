import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as ioClient, Socket } from "socket.io-client";

import { createServer } from "../src/server";

const waitForConnect = (client: Socket) =>
  new Promise<void>((resolve) => {
    if (client.connected) {
      resolve();
      return;
    }
    client.once("connect", () => resolve());
  });

const waitForRoomState = (
  client: Socket,
  predicate: (payload: any) => boolean,
  timeoutMs = 2000
) =>
  new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for room state"));
    }, timeoutMs);

    const handler = (payload: any) => {
      if (!predicate(payload)) return;
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.off("room:state", handler);
    };

    client.on("room:state", handler);
  });

describe("room system", () => {
  const { httpServer, io } = createServer();
  let port = 0;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        if (address && typeof address !== "string") {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("creates a room and broadcasts state to both players", async () => {
    const url = `http://localhost:${port}`;
    const clientA = ioClient(url, { transports: ["websocket"], forceNew: true });
    const clientB = ioClient(url, { transports: ["websocket"], forceNew: true });

    await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

    clientA.emit("room:create", { name: "Alice" });

    const created = await waitForRoomState(
      clientA,
      (payload) => payload?.room?.players?.length === 1
    );
    const roomCode = created.room.code as string;

    clientB.emit("room:join", { roomCode, name: "Bob" });

    const stateA = await waitForRoomState(
      clientA,
      (payload) => payload?.room?.players?.length === 2
    );
    const stateB = await waitForRoomState(
      clientB,
      (payload) => payload?.room?.players?.length === 2
    );

    expect(stateA.room.players.length).toBe(2);
    expect(stateB.room.players.length).toBe(2);

    clientA.disconnect();
    clientB.disconnect();
  });
});
