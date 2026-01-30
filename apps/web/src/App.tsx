import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001";

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
  type: "START" | "PROPERTY" | "EMPTY";
  cost?: number;
  rentTable?: number[];
  ownerId?: string | null;
};

type Player = {
  id: string;
  name: string;
  money: number;
  position: number;
  isBankrupt: boolean;
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

type ConnectionStatus = "connecting" | "connected" | "disconnected";

type Screen = "home" | "lobby" | "game";

const spaceTypeLabels: Record<BoardSpace["type"], string> = {
  START: "起点",
  PROPERTY: "地产",
  EMPTY: "空地"
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
  NOT_ENOUGH_MONEY: "余额不足。",
  GAME_OVER: "游戏已结束。"
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [connection, setConnection] = useState<ConnectionStatus>(
    "connecting"
  );
  const [room, setRoom] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [name, setName] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.playerName) ?? ""
  );
  const [roomCodeInput, setRoomCodeInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

    const handleGameState = (payload: { state: GameState }) => {
      setGameState(payload.state);
      setScreen("game");
      setNotice(null);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("room:state", handleRoomState);
    socket.on("game:error", handleError);
    socket.on("game:state", handleGameState);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room:state", handleRoomState);
      socket.off("game:error", handleError);
      socket.off("game:state", handleGameState);
      socket.disconnect();
    };
  }, [socket]);

  const ensureConnected = () => {
    if (!socket.connected) {
      socket.connect();
    }
  };

  const resetLocalSession = () => {
    localStorage.removeItem(STORAGE_KEYS.roomCode);
    localStorage.removeItem(STORAGE_KEYS.playerId);
    localStorage.removeItem(STORAGE_KEYS.playerToken);
  };

  const handleCreate = () => {
    setError(null);
    setNotice(null);
    setGameState(null);
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
    setScreen("home");
    setPlayerId(null);
    setPlayerToken(null);
    setNotice(null);
    socket.disconnect();
  };

  const handleGameAction = (type: "ROLL_DICE" | "BUY_CURRENT_SPACE" | "END_TURN") => {
    if (!room) return;
    setError(null);
    socket.emit("game:action", {
      roomCode: room.code,
      action: { type }
    });
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
  const currentSpace = gameState
    ? gameState.board[gameState.players[gameState.currentPlayerIndex].position]
    : null;
  const canRoll = isMyTurn && !gameState?.lastRoll && !gameState?.winnerId;
  const canBuy =
    isMyTurn &&
    !!gameState?.lastRoll &&
    currentSpace?.type === "PROPERTY" &&
    !currentSpace.ownerId &&
    !!currentSpace.cost &&
    (gameState?.players[gameState.currentPlayerIndex].money ?? 0) >=
      currentSpace.cost &&
    !gameState?.winnerId;
  const canEndTurn = isMyTurn && !!gameState?.lastRoll && !gameState?.winnerId;

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">地产大亨</p>
        <h1>在线联机房间大厅</h1>
        <p className="subhead">
          先创建/加入房间，再准备并开始游戏。当前版本已支持基础掷骰、买地、收租。
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
              </p>
            </div>
            <div className="lobby-actions">
              <button onClick={() => handleGameAction("ROLL_DICE")} disabled={!canRoll}>
                掷骰
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
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h3>棋盘格子</h3>
              <div className="board">
                {gameState.board.map((space, index) => {
                  const ownerName = space.ownerId
                    ? gameState.players.find((p) => p.id === space.ownerId)?.name
                    : null;
                  const active =
                    gameState.players[gameState.currentPlayerIndex]?.position ===
                    index;
                  return (
                    <div key={space.id} className={`space ${active ? "active" : ""}`}>
                      <div className="space-title">
                        <strong>{space.name}</strong>
                        <span className="space-type">
                          {spaceTypeLabels[space.type]}
                        </span>
                      </div>
                      {space.type === "PROPERTY" && (
                        <div className="space-meta">
                          <span>价格 {space.cost}</span>
                          <span>租金 {space.rentTable?.[0] ?? 0}</span>
                          <span>
                            归属 {ownerName ?? "无"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
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
