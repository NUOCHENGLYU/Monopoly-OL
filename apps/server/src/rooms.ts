import crypto from "crypto";
import type { Server, Socket } from "socket.io";

import { applyAction, createInitialState, createRng } from "@pty/engine";

const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS = 6;
const TURN_DURATION_MS = Math.max(
  1,
  Number(process.env.TURN_TIMER ?? 60)
) * 1000;
const RECONNECT_WINDOW_MS = 5 * 60 * 1000;

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
  disconnectedAt?: number | null;
  socketId: string;
};

type Room = {
  code: string;
  hostId: string;
  players: PlayerEntry[];
  gameState: ReturnType<typeof createInitialState> | null;
  rng: (() => number) | null;
  turnEndsAt?: number | null;
  turnTimer?: NodeJS.Timeout | null;
  trades: Map<string, TradeOffer>;
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
    propertyId?: number;
  };
};

type RoomHandlersOptions = {
  rngSeed?: number;
};

type TradeOfferPayload = {
  roomCode?: string;
  toPlayerId?: string;
  offerMoney?: number;
  requestMoney?: number;
  offerPropertyIds?: number[];
  requestPropertyIds?: number[];
};

type TradeRespondPayload = {
  roomCode?: string;
  tradeId?: string;
  accept?: boolean;
};

type TradeOffer = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  offerMoney: number;
  requestMoney: number;
  offerPropertyIds: number[];
  requestPropertyIds: number[];
  createdAt: number;
};

export function registerRoomHandlers(io: Server, options?: RoomHandlersOptions) {
  const rooms = new Map<string, Room>();
  const rngSeed = options?.rngSeed;

  const emitRoomState = (room: Room) => {
    const payload = { room: sanitizeRoom(room) };
    io.to(room.code).emit("room:state", payload);
  };

  const emitGameState = (room: Room, socket?: Socket) => {
    if (!room.gameState) return;
    const payload = {
      state: room.gameState,
      turnEndsAt: room.turnEndsAt ?? null
    };
    if (socket) {
      socket.emit("game:state", payload);
      return;
    }
    io.to(room.code).emit("game:state", payload);
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

  const sendToast = (room: Room, message: string) => {
    io.to(room.code).emit("toast", { message });
  };

  const clearTurnTimer = (room: Room) => {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    room.turnEndsAt = null;
  };

  const scheduleTurnTimer = (room: Room) => {
    clearTurnTimer(room);
    if (!room.gameState || room.gameState.winnerId) return;

    room.turnEndsAt = Date.now() + TURN_DURATION_MS;
    room.turnTimer = setTimeout(() => {
      if (!room.gameState || room.gameState.winnerId) return;
      const currentPlayer =
        room.gameState.players[room.gameState.currentPlayerIndex];
      if (!currentPlayer) return;
      const result = applyAction(room.gameState, {
        type: "END_TURN",
        playerId: currentPlayer.id
      });
      if (result.error) return;
      room.gameState = {
        ...result.state,
        log: [
          ...result.state.log,
          `${currentPlayer.name} 回合超时，自动结束。`
        ]
      };
      sendToast(room, `${currentPlayer.name} 回合超时，自动结束。`);
      if (room.gameState.winnerId) {
        clearTurnTimer(room);
        emitGameState(room);
        return;
      }
      scheduleTurnTimer(room);
      emitGameState(room);
    }, TURN_DURATION_MS);
    if (room.turnTimer && typeof room.turnTimer.unref === "function") {
      room.turnTimer.unref();
    }
  };

  const startGame = (room: Room) => {
    room.gameState = createInitialState(
      room.players.map((player) => ({ id: player.id, name: player.name }))
    );
    room.rng = room.rng ?? createRoomRng(rngSeed);
    clearTurnTimer(room);
    scheduleTurnTimer(room);
    emitRoomState(room);
    emitGameState(room);
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

      if (
        player.disconnectedAt &&
        Date.now() - player.disconnectedAt > RECONNECT_WINDOW_MS
      ) {
        sendError(socket, "RECONNECT_FAILED", "Reconnect window expired.");
        return;
      }

      player.connected = true;
      player.disconnectedAt = null;
      player.socketId = socket.id;

      socket.join(roomCode);
      setSocketContext(socket, roomCode, player.id);

      emitRoomState(room);
      emitRoomStateToSocket(room, socket, player);

      if (room.gameState) {
        emitGameState(room, socket);
      }

      for (const trade of room.trades.values()) {
        if (trade.toPlayerId === player.id) {
          socket.emit("trade:offer", { trade });
        }
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
        rng: null,
        turnEndsAt: null,
        turnTimer: null,
        trades: new Map()
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
        startGame(room);
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

      startGame(room);
    });

    socket.on("trade:offer", (payload: TradeOfferPayload) => {
      const context = socket.data as SocketContext;
      const roomCode = context.roomCode ?? payload?.roomCode?.trim().toUpperCase();
      if (!roomCode || !context.playerId) {
        sendError(socket, "INVALID_ACTION", "无法识别房间或玩家。");
        return;
      }

      const room = rooms.get(roomCode);
      if (!room || !room.gameState) {
        sendError(socket, "GAME_NOT_STARTED", "游戏尚未开始。");
        return;
      }

      const fromPlayerId = context.playerId;
      const toPlayerId = payload?.toPlayerId;
      if (!toPlayerId || toPlayerId === fromPlayerId) {
        sendError(socket, "INVALID_ACTION", "交易对象无效。");
        return;
      }

      const fromPlayer = room.gameState.players.find(
        (player) => player.id === fromPlayerId
      );
      const toPlayer = room.gameState.players.find(
        (player) => player.id === toPlayerId
      );
      if (!fromPlayer || !toPlayer || fromPlayer.isBankrupt || toPlayer.isBankrupt) {
        sendError(socket, "INVALID_ACTION", "交易玩家无效。");
        return;
      }

      const offerMoney = normalizeMoney(payload?.offerMoney);
      const requestMoney = normalizeMoney(payload?.requestMoney);
      const offerPropertyIds = normalizeIdList(payload?.offerPropertyIds);
      const requestPropertyIds = normalizeIdList(payload?.requestPropertyIds);

      if (
        offerMoney < 0 ||
        requestMoney < 0 ||
        offerMoney > fromPlayer.money ||
        requestMoney > toPlayer.money
      ) {
        sendError(socket, "INVALID_ACTION", "交易金额不合法或余额不足。");
        return;
      }

      if (
        !validatePropertyOwnership(room.gameState, fromPlayerId, offerPropertyIds) ||
        !validatePropertyOwnership(room.gameState, toPlayerId, requestPropertyIds)
      ) {
        sendError(socket, "INVALID_ACTION", "地产归属校验失败。");
        return;
      }

      const trade: TradeOffer = {
        id: crypto.randomUUID(),
        fromPlayerId,
        toPlayerId,
        offerMoney,
        requestMoney,
        offerPropertyIds,
        requestPropertyIds,
        createdAt: Date.now()
      };

      room.trades.set(trade.id, trade);

      const target = room.players.find((entry) => entry.id === toPlayerId);
      if (target?.connected) {
        io.to(target.socketId).emit("trade:offer", { trade });
      } else {
        sendError(socket, "INVALID_ACTION", "对方不在线，无法发起交易。");
        room.trades.delete(trade.id);
        return;
      }

      socket.emit("trade:status", { tradeId: trade.id, status: "sent" });
    });

    socket.on("trade:respond", (payload: TradeRespondPayload) => {
      const context = socket.data as SocketContext;
      const roomCode = context.roomCode ?? payload?.roomCode?.trim().toUpperCase();
      if (!roomCode || !context.playerId) {
        sendError(socket, "INVALID_ACTION", "无法识别房间或玩家。");
        return;
      }

      const tradeId = payload?.tradeId;
      if (!tradeId) {
        sendError(socket, "INVALID_ACTION", "交易不存在。");
        return;
      }

      const room = rooms.get(roomCode);
      if (!room || !room.gameState) {
        sendError(socket, "GAME_NOT_STARTED", "游戏尚未开始。");
        return;
      }

      const trade = room.trades.get(tradeId);
      if (!trade || trade.toPlayerId !== context.playerId) {
        sendError(socket, "INVALID_ACTION", "无效的交易响应。");
        return;
      }

      room.trades.delete(tradeId);

      if (!payload?.accept) {
        io.to(room.code).emit("trade:status", {
          tradeId,
          status: "declined",
          trade
        });
        return;
      }

      const applied = applyTrade(room.gameState, trade);
      if (!applied) {
        sendError(socket, "INVALID_ACTION", "交易失败，请重新尝试。");
        return;
      }

      room.gameState = applied;
      io.to(room.code).emit("trade:status", {
        tradeId,
        status: "accepted",
        trade
      });
      emitGameState(room);
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
        actionType !== "PAY_BAIL" &&
        actionType !== "BUILD_HOUSE" &&
        actionType !== "END_TURN"
      ) {
        sendError(socket, "INVALID_ACTION", "不支持的操作。");
        return;
      }

      const actionPayload = payload?.action ?? {};
      let actionData: any = { type: actionType, playerId: context.playerId };
      if (actionType === "BUILD_HOUSE") {
        const rawId = actionPayload.propertyId;
        const propertyId = typeof rawId === "number" ? rawId : Number(rawId);
        if (!Number.isFinite(propertyId)) {
          sendError(socket, "INVALID_ACTION", "缺少地产编号。");
          return;
        }
        actionData = {
          type: actionType,
          playerId: context.playerId,
          propertyId
        };
      }

      const result = applyAction(
        room.gameState,
        actionData,
        actionType === "ROLL_DICE" ? { rng: room.rng ?? Math.random } : undefined
      );

      if (result.error) {
        sendError(socket, result.error.code, result.error.message);
        return;
      }

      const previousIndex = room.gameState.currentPlayerIndex;
      room.gameState = result.state;

      if (room.gameState.winnerId) {
        clearTurnTimer(room);
      } else if (
        actionType === "END_TURN" ||
        room.gameState.currentPlayerIndex !== previousIndex
      ) {
        scheduleTurnTimer(room);
      }

      emitGameState(room);
    });

    socket.on("disconnect", () => {
      const context = socket.data as SocketContext;
      if (!context.roomCode || !context.playerId) return;

      const room = rooms.get(context.roomCode);
      if (!room) return;

      const player = room.players.find((p) => p.id === context.playerId);
      if (!player) return;

      player.connected = false;
      player.disconnectedAt = Date.now();
      emitRoomState(room);
    });
  });
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
    disconnectedAt: null,
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

function normalizeMoney(value?: number) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return -1;
  return Math.floor(amount);
}

function normalizeIdList(ids?: number[]) {
  if (!Array.isArray(ids)) return [];
  const result: number[] = [];
  for (const raw of ids) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function validatePropertyOwnership(
  state: ReturnType<typeof createInitialState>,
  ownerId: string,
  propertyIds: number[]
) {
  if (propertyIds.length === 0) return true;
  return propertyIds.every((id) => {
    const space = state.board.find((entry) => entry.id === id);
    return space?.type === "PROPERTY" && space.ownerId === ownerId;
  });
}

function applyTrade(
  state: ReturnType<typeof createInitialState>,
  trade: TradeOffer
) {
  const board = state.board.map((space) => ({ ...space }));
  const players = state.players.map((player) => ({
    ...player,
    properties: [...player.properties]
  }));

  const fromPlayer = players.find((player) => player.id === trade.fromPlayerId);
  const toPlayer = players.find((player) => player.id === trade.toPlayerId);
  if (!fromPlayer || !toPlayer) return null;

  if (
    trade.offerMoney > fromPlayer.money ||
    trade.requestMoney > toPlayer.money
  ) {
    return null;
  }

  if (
    !validatePropertyOwnership(state, trade.fromPlayerId, trade.offerPropertyIds) ||
    !validatePropertyOwnership(state, trade.toPlayerId, trade.requestPropertyIds)
  ) {
    return null;
  }

  const removeProperty = (player: typeof fromPlayer, propertyId: number) => {
    player.properties = player.properties.filter((id) => id !== propertyId);
  };

  const addProperty = (player: typeof fromPlayer, propertyId: number) => {
    if (!player.properties.includes(propertyId)) {
      player.properties.push(propertyId);
    }
  };

  const transferProperty = (propertyId: number, newOwnerId: string) => {
    const space = board.find((entry) => entry.id === propertyId);
    if (!space) return;
    space.ownerId = newOwnerId;
    if (newOwnerId === fromPlayer.id) {
      removeProperty(toPlayer, propertyId);
      addProperty(fromPlayer, propertyId);
    } else {
      removeProperty(fromPlayer, propertyId);
      addProperty(toPlayer, propertyId);
    }
  };

  for (const id of trade.offerPropertyIds) {
    transferProperty(id, trade.toPlayerId);
  }

  for (const id of trade.requestPropertyIds) {
    transferProperty(id, trade.fromPlayerId);
  }

  fromPlayer.money -= trade.offerMoney;
  toPlayer.money += trade.offerMoney;
  toPlayer.money -= trade.requestMoney;
  fromPlayer.money += trade.requestMoney;

  return {
    ...state,
    board,
    players,
    log: [
      ...state.log,
      `${fromPlayer.name} 与 ${toPlayer.name} 完成交易。`
    ]
  };
}
