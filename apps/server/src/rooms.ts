import crypto from "crypto";
import type { Server, Socket } from "socket.io";

import { applyAction, createInitialState, createRng } from "@pty/engine";

const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS = 6;

export type RoomState = {
  code: string;
  hostId: string;
  players: Array<{
    id: string;
    name: string;
    ready: boolean;
    connected: boolean;
  }>;
  started: boolean;
};

type PlayerEntry = {
  id: string;
  name: string;
  ready: boolean;
  token: string;
  connected: boolean;
  socketId: string;
};

type Room = {
  code: string;
  hostId: string;
  players: PlayerEntry[];
  gameState: ReturnType<typeof createInitialState> | null;
  rng: (() => number) | null;
};

type SocketContext = {
  roomCode?: string;
  playerId?: string;
};

type CreateRoomPayload = {
  name: string;
};

type JoinRoomPayload = {
  roomCode: string;
  name: string;
};

type ReadyPayload = {
  ready: boolean;
};

type ReconnectPayload = {
  roomCode: string;
  playerToken: string;
};

type GameActionPayload = {
  roomCode?: string;
  action?: {
    type?: string;
  };
};

type RoomHandlersOptions = {
  rngSeed?: number;
};

export function registerRoomHandlers(io: Server, options?: RoomHandlersOptions) {
  const rooms = new Map<string, Room>();
  const rngSeed = options?.rngSeed;

  const emitRoomState = (room: Room) => {
    const payload = { room: sanitizeRoom(room) };
    io.to(room.code).emit("room:state", payload);
  };

  const emitRoomStateToSocket = (
    room: Room,
    socket: Socket,
    player: PlayerEntry
  ) => {
    socket.emit("room:state", {
      room: sanitizeRoom(room),
      self: { playerId: player.id, playerToken: player.token }
    });
  };

  const sendError = (socket: Socket, code: string, message: string) => {
    socket.emit("game:error", { code, message });
  };

  io.on("connection", (socket) => {
    socket.on("game:reconnect", (payload: ReconnectPayload) => {
      const roomCode = payload?.roomCode?.trim().toUpperCase();
      const token = payload?.playerToken?.trim();
      if (!roomCode || !token) {
        sendError(socket, "INVALID_RECONNECT", "Reconnect data is missing.");
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        sendError(socket, "ROOM_NOT_FOUND", "Room not found.");
        return;
      }

      const player = room.players.find((entry) => entry.token === token);
      if (!player) {
        sendError(socket, "RECONNECT_FAILED", "Invalid player token.");
        return;
      }

      player.connected = true;
      player.socketId = socket.id;

      socket.join(roomCode);
      setSocketContext(socket, roomCode, player.id);

      emitRoomState(room);
      emitRoomStateToSocket(room, socket, player);

      if (room.gameState) {
        socket.emit("game:state", { state: room.gameState });
      }
    });

    socket.on("room:create", (payload: CreateRoomPayload) => {
      const name = payload?.name?.trim();
      if (!name) {
        sendError(socket, "NAME_REQUIRED", "Name is required.");
        return;
      }

      const roomCode = generateRoomCode(rooms);
      const player = createPlayer(name, socket.id);

      const room: Room = {
        code: roomCode,
        hostId: player.id,
        players: [player],
        gameState: null,
        rng: null
      };

      rooms.set(roomCode, room);
      socket.join(roomCode);
      setSocketContext(socket, roomCode, player.id);

      emitRoomState(room);
      emitRoomStateToSocket(room, socket, player);
    });

    socket.on("room:join", (payload: JoinRoomPayload) => {
      const roomCode = payload?.roomCode?.trim().toUpperCase();
      const name = payload?.name?.trim();
      if (!name) {
        sendError(socket, "NAME_REQUIRED", "Name is required.");
        return;
      }
      if (!roomCode) {
        sendError(socket, "ROOM_CODE_REQUIRED", "Room code is required.");
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        sendError(socket, "ROOM_NOT_FOUND", "Room not found.");
        return;
      }

      if (room.players.length >= MAX_PLAYERS) {
        sendError(socket, "ROOM_FULL", "Room is full.");
        return;
      }

      if (room.gameState) {
        sendError(socket, "GAME_ALREADY_STARTED", "Game already started.");
        return;
      }

      const player = createPlayer(name, socket.id);
      room.players.push(player);

      socket.join(roomCode);
      setSocketContext(socket, roomCode, player.id);

      emitRoomState(room);
      emitRoomStateToSocket(room, socket, player);
    });

    socket.on("room:ready", (payload: ReadyPayload) => {
      const context = socket.data as SocketContext;
      if (!context.roomCode || !context.playerId) return;
      const room = rooms.get(context.roomCode);
      if (!room) return;

      const player = room.players.find((p) => p.id === context.playerId);
      if (!player) return;

      player.ready = payload?.ready ?? false;
      emitRoomState(room);

      if (room.gameState === null && allPlayersReady(room)) {
        startGame(room, io, rngSeed);
      }
    });

    socket.on("room:start", () => {
      const context = socket.data as SocketContext;
      if (!context.roomCode || !context.playerId) return;
      const room = rooms.get(context.roomCode);
      if (!room) return;
      if (room.hostId !== context.playerId) {
        sendError(socket, "NOT_HOST", "Only the host can start the game.");
        return;
      }
      if (room.gameState) return;

      startGame(room, io, rngSeed);
    });

    socket.on("game:action", (payload: GameActionPayload) => {
      const context = socket.data as SocketContext;
      const roomCode = context.roomCode ?? payload?.roomCode?.trim().toUpperCase();
      if (!roomCode || !context.playerId) {
        sendError(socket, "INVALID_ACTION", "无法识别房间或玩家。");
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        sendError(socket, "ROOM_NOT_FOUND", "房间不存在。");
        return;
      }

      if (!room.gameState) {
        sendError(socket, "GAME_NOT_STARTED", "游戏尚未开始。");
        return;
      }

      const actionType = payload?.action?.type;
      if (!actionType) {
        sendError(socket, "INVALID_ACTION", "操作无效。");
        return;
      }

      if (
        actionType !== "ROLL_DICE" &&
        actionType !== "BUY_CURRENT_SPACE" &&
        actionType !== "END_TURN"
      ) {
        sendError(socket, "INVALID_ACTION", "不支持的操作。");
        return;
      }

      const result = applyAction(
        room.gameState,
        { type: actionType, playerId: context.playerId },
        actionType === "ROLL_DICE" ? { rng: room.rng ?? Math.random } : undefined
      );

      if (result.error) {
        sendError(socket, result.error.code, result.error.message);
        return;
      }

      room.gameState = result.state;
      io.to(room.code).emit("game:state", { state: room.gameState });
    });

    socket.on("disconnect", () => {
      const context = socket.data as SocketContext;
      if (!context.roomCode || !context.playerId) return;

      const room = rooms.get(context.roomCode);
      if (!room) return;

      const player = room.players.find((p) => p.id === context.playerId);
      if (!player) return;

      player.connected = false;
      emitRoomState(room);
    });
  });
}

function startGame(room: Room, io: Server, rngSeed?: number) {
  room.gameState = createInitialState(
    room.players.map((player) => ({ id: player.id, name: player.name }))
  );
  room.rng = room.rng ?? createRoomRng(rngSeed);
  io.to(room.code).emit("room:state", { room: sanitizeRoom(room) });
  io.to(room.code).emit("game:state", { state: room.gameState });
}

function sanitizeRoom(room: Room): RoomState {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      ready: player.ready,
      connected: player.connected
    })),
    started: room.gameState !== null
  };
}

function allPlayersReady(room: Room) {
  return room.players.length > 0 && room.players.every((p) => p.ready);
}

function createPlayer(name: string, socketId: string): PlayerEntry {
  return {
    id: crypto.randomUUID(),
    name,
    ready: false,
    token: crypto.randomUUID(),
    connected: true,
    socketId
  };
}

function generateRoomCode(existing: Map<string, Room>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      const index = Math.floor(Math.random() * alphabet.length);
      code += alphabet[index];
    }
    if (!existing.has(code)) return code;
  }
  return crypto.randomUUID().slice(0, ROOM_CODE_LENGTH).toUpperCase();
}

function setSocketContext(
  socket: Socket,
  roomCode: string,
  playerId: string
) {
  const context = socket.data as SocketContext;
  context.roomCode = roomCode;
  context.playerId = playerId;
}

function createRoomRng(seed?: number): () => number {
  if (seed === undefined || Number.isNaN(seed)) {
    return Math.random;
  }
  return createRng(seed);
}
