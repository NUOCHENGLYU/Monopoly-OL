import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as ioClient, Socket } from "socket.io-client";
import type { GameState } from "@pty/engine";
import { applyAction, createRng } from "@pty/engine";

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

const waitForGameState = (client: Socket, timeoutMs = 2000) =>
  new Promise<{ state: GameState }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for game state"));
    }, timeoutMs);

    const handler = (payload: { state: GameState }) => {
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.off("game:state", handler);
    };

    client.on("game:state", handler);
  });

const emitGameAction = async (
  actingClient: Socket,
  roomCode: string,
  type: "ROLL_DICE" | "BUY_CURRENT_SPACE" | "END_TURN",
  listenerClient: Socket = actingClient
) => {
  const wait = waitForGameState(listenerClient);
  actingClient.emit("game:action", { roomCode, action: { type } });
  return wait;
};

describe("game actions", () => {
  const seed = 12345;
  const { httpServer, io } = createServer({ rngSeed: seed });
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

  it("runs a deterministic sequence of rolls, buys, and rent", async () => {
    const url = `http://localhost:${port}`;
    const clientA = ioClient(url, { transports: ["websocket"], forceNew: true });
    const clientB = ioClient(url, { transports: ["websocket"], forceNew: true });

    await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

    const waitCreated = waitForRoomState(
      clientA,
      (payload) => payload?.room?.players?.length === 1
    );
    clientA.emit("room:create", { name: "Alice" });
    const created = await waitCreated;
    const roomCode = created.room.code as string;
    const playerIdA = created.room.players[0].id as string;

    const waitJoined = waitForRoomState(
      clientA,
      (payload) => payload?.room?.players?.length === 2
    );
    clientB.emit("room:join", { roomCode, name: "Bob" });
    const joined = await waitJoined;
    const playerIdB = (joined.room.players as Array<{ id: string }>).find(
      (player) => player.id !== playerIdA
    )?.id as string;

    const waitGameStart = waitForGameState(clientA);
    clientA.emit("room:start");
    const startStatePayload = await waitGameStart;

    let localState = structuredClone(startStatePayload.state);
    const rng = createRng(seed);
    const clientByPlayerId = new Map<string, Socket>([
      [playerIdA, clientA],
      [playerIdB, clientB]
    ]);

    let rentOccurred = false;

    for (let step = 0; step < 12; step += 1) {
      const currentPlayer = localState.players[localState.currentPlayerIndex];
      const actingClient = clientByPlayerId.get(currentPlayer.id);
      if (!actingClient) break;

      const rollPayload = await emitGameAction(
        actingClient,
        roomCode,
        "ROLL_DICE",
        clientA
      );
      localState = applyAction(
        localState,
        { type: "ROLL_DICE", playerId: currentPlayer.id },
        { rng }
      ).state;
      expect(rollPayload.state).toEqual(localState);

      const landedSpace =
        localState.board[localState.players[localState.currentPlayerIndex].position];
      if (
        landedSpace.type === "PROPERTY" &&
        landedSpace.ownerId &&
        landedSpace.ownerId !== currentPlayer.id
      ) {
        rentOccurred = true;
      }

      if (landedSpace.type === "PROPERTY" && !landedSpace.ownerId) {
        const buyPayload = await emitGameAction(
          actingClient,
          roomCode,
          "BUY_CURRENT_SPACE",
          clientA
        );
        localState = applyAction(localState, {
          type: "BUY_CURRENT_SPACE",
          playerId: currentPlayer.id
        }).state;
        expect(buyPayload.state).toEqual(localState);
      }

      if (localState.winnerId) {
        break;
      }

      const endPayload = await emitGameAction(
        actingClient,
        roomCode,
        "END_TURN",
        clientA
      );
      localState = applyAction(localState, {
        type: "END_TURN",
        playerId: currentPlayer.id
      }).state;
      expect(endPayload.state).toEqual(localState);

      if (rentOccurred) break;
    }

    expect(rentOccurred).toBe(true);

    clientA.disconnect();
    clientB.disconnect();
  });
});
