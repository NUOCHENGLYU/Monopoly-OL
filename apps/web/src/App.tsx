import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);

const STORAGE_KEYS = {
  roomCode: "pty_room_code",
  playerId: "pty_player_id",
  playerToken: "pty_player_token",
  playerName: "pty_player_name"
};

type RoomPlayer = {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
};

type RoomState = {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  started: boolean;
};

type RoomStatePayload = {
  room: RoomState;
  self?: {
    playerId: string;
    playerToken: string;
  };
};

type GameErrorPayload = {
  code?: string;
  message?: string;
};

type BoardSpace = {
  id: number;
  name: string;
  type: "START" | "PROPERTY" | "EMPTY" | "TAX" | "JAIL" | "GOTO_JAIL" | "CARD";
  cost?: number;
  rentTable?: number[];
  colorGroup?: string;
  buildCost?: number;
  ownerId?: string | null;
  houses?: number;
  taxAmount?: number;
};

type Player = {
  id: string;
  name: string;
  money: number;
  position: number;
  isBankrupt: boolean;
  inJail: boolean;
  jailTurns: number;
};

type GameState = {
  board: BoardSpace[];
  players: Player[];
  currentPlayerIndex: number;
  turn: number;
  lastRoll: { d1: number; d2: number; total: number } | null;
  log: string[];
  winnerId: string | null;
};

type GameStatePayload = {
  state: GameState;
  turnEndsAt?: number | null;
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

type ConnectionStatus = "connecting" | "connected" | "disconnected";

type Screen = "home" | "lobby" | "game";

const BAIL_COST = 50;

const buildRingPositions = (size: number) => {
  const positions: Array<{ row: number; col: number }> = [];
  const last = size - 1;
  for (let col = last; col >= 0; col -= 1) {
    positions.push({ row: last, col });
  }
  for (let row = last - 1; row > 0; row -= 1) {
    positions.push({ row, col: 0 });
  }
  for (let col = 0; col < size; col += 1) {
    positions.push({ row: 0, col });
  }
  for (let row = 1; row < last; row += 1) {
    positions.push({ row, col: last });
  }
  return positions;
};

const spaceTypeLabels: Record<BoardSpace["type"], string> = {
  START: "起点",
  PROPERTY: "地产",
  EMPTY: "空地",
  TAX: "税务",
  JAIL: "监狱",
  GOTO_JAIL: "前往监狱",
  CARD: "事件"
};

const errorMessages: Record<string, string> = {
  NAME_REQUIRED: "请输入昵称。",
  ROOM_CODE_REQUIRED: "请输入房间码。",
  ROOM_NOT_FOUND: "房间不存在。",
  ROOM_FULL: "房间已满。",
  GAME_ALREADY_STARTED: "游戏已开始，无法加入。",
  NOT_HOST: "只有房主可以开始游戏。",
  INVALID_RECONNECT: "重连信息不完整，请重新加入。",
  RECONNECT_FAILED: "重连失败，请重新加入。",
  INVALID_ACTION: "操作无效。",
  GAME_NOT_STARTED: "游戏尚未开始。",
  NOT_YOUR_TURN: "当前不是你的回合。",
  ALREADY_ROLLED: "本回合已掷骰。",
  NOT_ROLLED: "请先掷骰。",
  CANNOT_BUY: "当前格子无法购买。",
  CANNOT_BUILD: "无法建造房屋。",
  NOT_ENOUGH_MONEY: "余额不足。",
  IN_JAIL: "在监狱中无法执行该操作。",
  NOT_IN_JAIL: "当前不在监狱中。",
  GAME_OVER: "游戏已结束。"
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [connection, setConnection] = useState<ConnectionStatus>(
    "connecting"
  );
  const [room, setRoom] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [turnEndsAt, setTurnEndsAt] = useState<number | null>(null);
  const [turnRemaining, setTurnRemaining] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [name, setName] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.playerName) ?? ""
  );
  const [roomCodeInput, setRoomCodeInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [tradeTargetId, setTradeTargetId] = useState<string>("");
  const [offerMoney, setOfferMoney] = useState<string>("0");
  const [requestMoney, setRequestMoney] = useState<string>("0");
  const [offerPropertyIds, setOfferPropertyIds] = useState<number[]>([]);
  const [requestPropertyIds, setRequestPropertyIds] = useState<number[]>([]);
  const [incomingTrade, setIncomingTrade] = useState<TradeOffer | null>(null);
  const ringPositions = useMemo(() => buildRingPositions(7), []);

  const socket = useMemo<Socket>(
    () => io(SOCKET_URL, { autoConnect: false }),
    []
  );

  useEffect(() => {
    const handleConnect = () => {
      setConnection("connected");
      const storedToken = localStorage.getItem(STORAGE_KEYS.playerToken);
      const storedRoom = localStorage.getItem(STORAGE_KEYS.roomCode);
      if (storedToken && storedRoom) {
        socket.emit("game:reconnect", {
          roomCode: storedRoom,
          playerToken: storedToken
        });
      }
    };

    const handleDisconnect = () => {
      setConnection("disconnected");
    };

    const handleRoomState = (payload: RoomStatePayload) => {
      setRoom(payload.room);
      if (!payload.room.started) {
        setScreen("lobby");
      }
      setNotice(null);
      if (payload.self) {
        setPlayerId(payload.self.playerId);
        setPlayerToken(payload.self.playerToken);
        localStorage.setItem(STORAGE_KEYS.playerId, payload.self.playerId);
        localStorage.setItem(
          STORAGE_KEYS.playerToken,
          payload.self.playerToken
        );
      }
      localStorage.setItem(STORAGE_KEYS.roomCode, payload.room.code);
    };

    const handleError = (payload: GameErrorPayload) => {
      const message =
        (payload.code && errorMessages[payload.code]) ||
        payload.message ||
        "操作失败，请重试。";
      setError(message);
    };

    const handleGameState = (payload: GameStatePayload) => {
      setGameState(payload.state);
      setTurnEndsAt(payload.turnEndsAt ?? null);
      setScreen("game");
      setNotice(null);
    };

    const handleTradeOffer = (payload: { trade: TradeOffer }) => {
      setIncomingTrade(payload.trade);
    };

    const handleTradeStatus = (payload: {
      tradeId: string;
      status: string;
      trade?: TradeOffer;
    }) => {
      if (incomingTrade && payload.tradeId === incomingTrade.id) {
        setIncomingTrade(null);
      }
      if (payload.status === "accepted") {
        setNotice("交易已完成。");
      } else if (payload.status === "declined") {
        setNotice("交易已被拒绝。");
      } else if (payload.status === "sent") {
        setNotice("交易已发送。");
      }
    };

    const handleToast = (payload: { message?: string }) => {
      if (payload?.message) setNotice(payload.message);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:state", handleRoomState);
    socket.on("game:error", handleError);
    socket.on("game:state", handleGameState);
    socket.on("trade:offer", handleTradeOffer);
    socket.on("trade:status", handleTradeStatus);
    socket.on("toast", handleToast);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:state", handleRoomState);
      socket.off("game:error", handleError);
      socket.off("game:state", handleGameState);
      socket.off("trade:offer", handleTradeOffer);
      socket.off("trade:status", handleTradeStatus);
      socket.off("toast", handleToast);
      socket.disconnect();
    };
  }, [socket]);

  const ensureConnected = () => {
    if (!socket.connected) {
      socket.connect();
    }
  };

  useEffect(() => {
    if (!turnEndsAt) {
      setTurnRemaining(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000));
      setTurnRemaining(remaining);
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [turnEndsAt]);

  useEffect(() => {
    setRequestPropertyIds([]);
  }, [tradeTargetId, gameState]);

  const resetLocalSession = () => {
    localStorage.removeItem(STORAGE_KEYS.roomCode);
    localStorage.removeItem(STORAGE_KEYS.playerId);
    localStorage.removeItem(STORAGE_KEYS.playerToken);
  };

  const handleCreate = () => {
    setError(null);
    setNotice(null);
    setGameState(null);
    setTurnEndsAt(null);
    setIncomingTrade(null);
    setSelectedSpaceId(null);
    if (!name.trim()) {
      setError("请输入昵称。");
      return;
    }
    ensureConnected();
    localStorage.setItem(STORAGE_KEYS.playerName, name.trim());
    socket.emit("room:create", { name: name.trim() });
  };

  const handleJoin = () => {
    setError(null);
    setNotice(null);
    setGameState(null);
    setTurnEndsAt(null);
    setIncomingTrade(null);
    setSelectedSpaceId(null);
    if (!name.trim()) {
      setError("请输入昵称。");
      return;
    }
    if (!roomCodeInput.trim()) {
      setError("请输入房间码。");
      return;
    }
    ensureConnected();
    const code = roomCodeInput.trim().toUpperCase();
    localStorage.setItem(STORAGE_KEYS.playerName, name.trim());
    socket.emit("room:join", { roomCode: code, name: name.trim() });
  };

  const handleToggleReady = () => {
    if (!room || !playerId) return;
    const self = room.players.find((p) => p.id === playerId);
    const nextReady = !(self?.ready ?? false);
    socket.emit("room:ready", { ready: nextReady });
  };

  const handleStart = () => {
    socket.emit("room:start");
  };

  const handleLeave = () => {
    resetLocalSession();
    setRoom(null);
    setGameState(null);
    setTurnEndsAt(null);
    setIncomingTrade(null);
    setSelectedSpaceId(null);
    setScreen("home");
    setPlayerId(null);
    setPlayerToken(null);
    setNotice(null);
    socket.disconnect();
  };

  const handleGameAction = (
    type:
      | "ROLL_DICE"
      | "BUY_CURRENT_SPACE"
      | "PAY_BAIL"
      | "BUILD_HOUSE"
      | "END_TURN",
    propertyId?: number
  ) => {
    if (!room) return;
    setError(null);
    socket.emit("game:action", {
      roomCode: room.code,
      action: propertyId === undefined ? { type } : { type, propertyId }
    });
  };

  const handleSendTrade = () => {
    if (!room || !tradeTargetId) {
      setError("请选择交易对象。");
      return;
    }
    const offerMoneyValue = Number(offerMoney) || 0;
    const requestMoneyValue = Number(requestMoney) || 0;
    socket.emit("trade:offer", {
      roomCode: room.code,
      toPlayerId: tradeTargetId,
      offerMoney: Math.max(0, Math.floor(offerMoneyValue)),
      requestMoney: Math.max(0, Math.floor(requestMoneyValue)),
      offerPropertyIds,
      requestPropertyIds
    });
  };

  const handleTradeResponse = (accept: boolean) => {
    if (!incomingTrade || !room) return;
    socket.emit("trade:respond", {
      roomCode: room.code,
      tradeId: incomingTrade.id,
      accept
    });
    if (!accept) {
      setIncomingTrade(null);
    }
  };

  const toggleOfferProperty = (id: number) => {
    setOfferPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );
  };

  const toggleRequestProperty = (id: number) => {
    setRequestPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );
  };

  const renderConnectionTag = () => {
    const labels: Record<ConnectionStatus, string> = {
      connecting: "连接中",
      connected: "已连接",
      disconnected: "已断开"
    };
    return (
      <span className={`badge ${connection}`}>{labels[connection]}</span>
    );
  };

  const self = room?.players.find((p) => p.id === playerId) ?? null;
  const isHost = room?.hostId === playerId;
  const isMyTurn =
    !!gameState &&
    gameState.players[gameState.currentPlayerIndex]?.id === playerId;
  const currentPlayer = gameState
    ? gameState.players[gameState.currentPlayerIndex]
    : null;
  const currentSpace = gameState && currentPlayer
    ? gameState.board[currentPlayer.position]
    : null;
  const selectedSpace = gameState
    ? gameState.board.find((space) => space.id === selectedSpaceId) ??
      currentSpace
    : null;
  const tradeTargets = gameState
    ? gameState.players.filter(
        (player) => player.id !== playerId && !player.isBankrupt
      )
    : [];
  const myProperties = gameState
    ? gameState.board.filter(
        (space) => space.type === "PROPERTY" && space.ownerId === playerId
      )
    : [];
  const targetProperties = gameState
    ? gameState.board.filter(
        (space) =>
          space.type === "PROPERTY" && space.ownerId === tradeTargetId
      )
    : [];
  const useRingLayout =
    !!gameState && gameState.board.length === ringPositions.length;
  const isInJail = currentPlayer?.inJail ?? false;
  const hasMonopoly = (group?: string) => {
    if (!gameState || !playerId || !group) return false;
    const groupSpaces = gameState.board.filter(
      (space) => space.type === "PROPERTY" && space.colorGroup === group
    );
    return (
      groupSpaces.length > 0 &&
      groupSpaces.every((space) => space.ownerId === playerId)
    );
  };
  const canRoll = isMyTurn && !gameState?.lastRoll && !gameState?.winnerId;
  const canPayBail =
    isMyTurn &&
    isInJail &&
    !gameState?.lastRoll &&
    (currentPlayer?.money ?? 0) >= BAIL_COST &&
    !gameState?.winnerId;
  const canBuy =
    isMyTurn &&
    !isInJail &&
    !!gameState?.lastRoll &&
    currentSpace?.type === "PROPERTY" &&
    !currentSpace.ownerId &&
    !!currentSpace.cost &&
    (currentPlayer?.money ?? 0) >= currentSpace.cost &&
    !gameState?.winnerId;
  const canBuildHouse =
    isMyTurn &&
    !isInJail &&
    !!selectedSpace &&
    selectedSpace.type === "PROPERTY" &&
    selectedSpace.ownerId === playerId &&
    hasMonopoly(selectedSpace.colorGroup) &&
    (selectedSpace.houses ?? 0) < 4 &&
    (selectedSpace.buildCost ?? 0) > 0 &&
    (currentPlayer?.money ?? 0) >= (selectedSpace.buildCost ?? 0) &&
    !gameState?.winnerId;
  const canEndTurn = isMyTurn && !!gameState?.lastRoll && !gameState?.winnerId;

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">地产大亨</p>
        <h1>在线联机房间大厅</h1>
        <p className="subhead">
          先创建/加入房间，再准备并开始游戏。当前版本已支持掷骰、买地、收租、税务与监狱。
        </p>
        <div className="connection">{renderConnectionTag()}</div>
      </header>

      {screen === "home" && (
        <section className="card">
          <h2>进入房间</h2>
          <div className="form-grid">
            <label>
              昵称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="请输入昵称"
              />
            </label>
            <label>
              房间码（加入时填写）
              <input
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(event.target.value)}
                placeholder="例如：AB12CD"
              />
            </label>
          </div>

          <div className="actions">
            <button className="primary" onClick={handleCreate}>
              创建房间
            </button>
            <button onClick={handleJoin}>加入房间</button>
          </div>

          {error && <p className="status error">{error}</p>}
        </section>
      )}

      {screen === "lobby" && room && (
        <section className="card">
          <div className="lobby-header">
            <div>
              <h2>房间：{room.code}</h2>
              <p className="muted">
                房主：{room.players.find((p) => p.id === room.hostId)?.name}
              </p>
            </div>
            <div className="lobby-actions">
              <button onClick={handleToggleReady}>
                {self?.ready ? "取消准备" : "准备"}
              </button>
              {isHost && (
                <button className="primary" onClick={handleStart}>
                  开始游戏
                </button>
              )}
              <button className="ghost" onClick={handleLeave}>
                退出房间
              </button>
            </div>
          </div>

          <div className="player-list">
            {room.players.map((player) => (
              <div
                key={player.id}
                className={`player ${player.id === playerId ? "self" : ""}`}
              >
                <div>
                  <strong>{player.name}</strong>
                  {player.id === room.hostId && (
                    <span className="tag">房主</span>
                  )}
                  {player.id === playerId && (
                    <span className="tag">你</span>
                  )}
                </div>
                <div className="player-meta">
                  <span>{player.ready ? "已准备" : "未准备"}</span>
                  <span className={player.connected ? "ok" : "warn"}>
                    {player.connected ? "在线" : "离线"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {room.started && (
            <p className="status ok">游戏已开始，准备进入下一阶段。</p>
          )}
          {notice && <p className="status">{notice}</p>}
          {error && <p className="status error">{error}</p>}
          {playerToken && (
            <p className="hint">
              断线后可在 5 分钟内刷新页面自动重连（已保存身份）。
            </p>
          )}
        </section>
      )}

      {screen === "game" && gameState && room && (
        <section className="card">
          <div className="game-header">
            <div>
              <h2>游戏进行中 · 房间 {room.code}</h2>
              <p className="muted">
                回合 {gameState.turn} · 当前玩家：
                {gameState.players[gameState.currentPlayerIndex]?.name}
                {currentPlayer?.inJail
                  ? `（监狱中 ${currentPlayer.jailTurns}/${3}）`
                  : ""}
                {turnRemaining !== null ? ` · 剩余 ${turnRemaining} 秒` : ""}
              </p>
            </div>
            <div className="lobby-actions">
              <button
                onClick={() => handleGameAction("PAY_BAIL")}
                disabled={!canPayBail}
              >
                支付保释金 {BAIL_COST}
              </button>
              <button
                onClick={() => handleGameAction("ROLL_DICE")}
                disabled={!canRoll}
              >
                {isInJail ? "尝试出狱" : "掷骰"}
              </button>
              <button onClick={() => handleGameAction("BUY_CURRENT_SPACE")} disabled={!canBuy}>
                购买地产
              </button>
              <button onClick={() => handleGameAction("END_TURN")} disabled={!canEndTurn}>
                结束回合
              </button>
              <button className="ghost" onClick={handleLeave}>
                退出房间
              </button>
            </div>
          </div>

          {gameState.winnerId && (
            <p className="status ok">
              胜利者：
              {gameState.players.find((player) => player.id === gameState.winnerId)?.name}
            </p>
          )}
          {error && <p className="status error">{error}</p>}

          <div className="game-layout">
            <div className="panel">
              <h3>玩家列表</h3>
              <div className="player-list">
                {gameState.players.map((player) => (
                  <div
                    key={player.id}
                    className={`player ${player.id === playerId ? "self" : ""}`}
                  >
                    <div>
                      <strong>{player.name}</strong>
                      {player.id === playerId && <span className="tag">你</span>}
                      {player.isBankrupt && <span className="tag">破产</span>}
                    </div>
                    <div className="player-meta">
                      <span>资金 {player.money}</span>
                      <span>位置 {player.position}</span>
                      {player.inJail && <span className="warn">监狱中</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h3>棋盘格子</h3>
              <div className={useRingLayout ? "board-grid" : "board"}>
                {gameState.board.map((space, index) => {
                  const ownerName = space.ownerId
                    ? gameState.players.find((p) => p.id === space.ownerId)?.name
                    : null;
                  const active =
                    gameState.players[gameState.currentPlayerIndex]?.position ===
                    index;
                  const selected = selectedSpace?.id === space.id;
                  const ringPosition = useRingLayout
                    ? ringPositions[index]
                    : null;
                  return (
                    <div
                      key={space.id}
                      className={`space ${active ? "active" : ""} ${
                        selected ? "selected" : ""
                      }`}
                      style={
                        ringPosition
                          ? {
                              gridRow: ringPosition.row + 1,
                              gridColumn: ringPosition.col + 1
                            }
                          : undefined
                      }
                      onClick={() => setSelectedSpaceId(space.id)}
                    >
                      <div className="space-title">
                        <strong>{space.name}</strong>
                        <span className="space-type">
                          {spaceTypeLabels[space.type]}
                        </span>
                      </div>
                      {space.type === "PROPERTY" && (
                        <div className="space-meta">
                          <span>价格 {space.cost}</span>
                          <span>
                            租金 {space.rentTable?.[space.houses ?? 0] ?? 0}
                          </span>
                          <span>
                            归属 {ownerName ?? "无"}
                          </span>
                          <span>房屋 {space.houses ?? 0}</span>
                        </div>
                      )}
                      {space.type === "TAX" && (
                        <div className="space-meta">
                          <span>税款 {space.taxAmount ?? 0}</span>
                        </div>
                      )}
                      {space.type === "CARD" && (
                        <div className="space-meta">
                          <span>抽取事件卡</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <h3>地产详情</h3>
              {!selectedSpace && (
                <p className="muted">点击棋盘格查看详情。</p>
              )}
              {selectedSpace && (
                <div className="detail">
                  <p>
                    <strong>{selectedSpace.name}</strong> ·{" "}
                    {spaceTypeLabels[selectedSpace.type]}
                  </p>
                  {selectedSpace.type === "PROPERTY" && (
                    <>
                      <p>归属：{selectedSpace.ownerId ? (gameState.players.find((p) => p.id === selectedSpace.ownerId)?.name ?? "未知") : "无"}</p>
                      <p>组别：{selectedSpace.colorGroup ?? "无"}</p>
                      <p>房屋：{selectedSpace.houses ?? 0}</p>
                      <p>当前租金：{selectedSpace.rentTable?.[selectedSpace.houses ?? 0] ?? 0}</p>
                      <p>建造费用：{selectedSpace.buildCost ?? "-"}</p>
                      <button
                        onClick={() =>
                          handleGameAction("BUILD_HOUSE", selectedSpace.id)
                        }
                        disabled={!canBuildHouse}
                      >
                        建造房屋
                      </button>
                      {!hasMonopoly(selectedSpace.colorGroup) && (
                        <p className="hint">需要先垄断该组全部地产。</p>
                      )}
                    </>
                  )}
                  {selectedSpace.type === "TAX" && (
                    <p>税款：{selectedSpace.taxAmount ?? 0}</p>
                  )}
                  {selectedSpace.type === "CARD" && (
                    <p>抽取事件卡并触发效果。</p>
                  )}
                  {selectedSpace.type === "JAIL" && <p>监狱（探视或关押）。</p>}
                  {selectedSpace.type === "GOTO_JAIL" && (
                    <p>到此格会被送往监狱。</p>
                  )}
                  {selectedSpace.type === "START" && <p>经过起点可获得奖励。</p>}
                  {selectedSpace.type === "EMPTY" && <p>普通空地。</p>}
                </div>
              )}
            </div>

            <div className="panel">
              <h3>交易</h3>
              {incomingTrade && (
                <div className="trade-offer">
                  <p>
                    来自{" "}
                    {
                      gameState.players.find(
                        (player) => player.id === incomingTrade.fromPlayerId
                      )?.name
                    }
                    的交易请求
                  </p>
                  <p>
                    对方给你：金币 {incomingTrade.offerMoney} · 地产{" "}
                    {incomingTrade.offerPropertyIds.length || 0} 个
                  </p>
                  <p>
                    对方想要：金币 {incomingTrade.requestMoney} · 地产{" "}
                    {incomingTrade.requestPropertyIds.length || 0} 个
                  </p>
                  <div className="actions">
                    <button className="primary" onClick={() => handleTradeResponse(true)}>
                      接受
                    </button>
                    <button onClick={() => handleTradeResponse(false)}>拒绝</button>
                  </div>
                </div>
              )}

              <div className="trade-form">
                <label>
                  交易对象
                  <select
                    value={tradeTargetId}
                    onChange={(event) => setTradeTargetId(event.target.value)}
                  >
                    <option value="">请选择</option>
                    {tradeTargets.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="trade-grid">
                  <label>
                    我给金币
                    <input
                      type="number"
                      min="0"
                      value={offerMoney}
                      onChange={(event) => setOfferMoney(event.target.value)}
                    />
                  </label>
                  <label>
                    我收金币
                    <input
                      type="number"
                      min="0"
                      value={requestMoney}
                      onChange={(event) => setRequestMoney(event.target.value)}
                    />
                  </label>
                </div>
                <div className="trade-list">
                  <div>
                    <p className="muted">我提供的地产</p>
                    {myProperties.length === 0 && <p className="muted">暂无</p>}
                    {myProperties.map((space) => (
                      <label key={space.id} className="checkbox">
                        <input
                          type="checkbox"
                          checked={offerPropertyIds.includes(space.id)}
                          onChange={() => toggleOfferProperty(space.id)}
                        />
                        {space.name}
                      </label>
                    ))}
                  </div>
                  <div>
                    <p className="muted">我想要的地产</p>
                    {targetProperties.length === 0 && <p className="muted">暂无</p>}
                    {targetProperties.map((space) => (
                      <label key={space.id} className="checkbox">
                        <input
                          type="checkbox"
                          checked={requestPropertyIds.includes(space.id)}
                          onChange={() => toggleRequestProperty(space.id)}
                        />
                        {space.name}
                      </label>
                    ))}
                  </div>
                </div>
                <button className="primary" onClick={handleSendTrade}>
                  发送报价
                </button>
              </div>
            </div>

            <div className="panel">
              <h3>事件日志</h3>
              <div className="log">
                {gameState.log.slice(-10).map((entry, index) => (
                  <p key={`${index}-${entry}`}>{entry}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
