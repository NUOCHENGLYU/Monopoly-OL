export type BoardSpaceType = "START" | "PROPERTY" | "EMPTY";

export type BoardSpace = {
  id: number;
  name: string;
  type: BoardSpaceType;
  cost?: number;
  rentTable?: number[];
  colorGroup?: string;
  ownerId?: string | null;
};

export type PlayerInput = {
  id: string;
  name: string;
};

export type Player = {
  id: string;
  name: string;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  properties: number[];
  isBankrupt: boolean;
};

export type DiceRoll = {
  d1: number;
  d2: number;
  total: number;
};

export type GameState = {
  board: BoardSpace[];
  players: Player[];
  currentPlayerIndex: number;
  turn: number;
  lastRoll: DiceRoll | null;
  log: string[];
  winnerId: string | null;
};

export type Action =
  | {
      type: "ROLL_DICE";
      playerId: string;
    }
  | {
      type: "BUY_CURRENT_SPACE";
      playerId: string;
    }
  | {
      type: "END_TURN";
      playerId: string;
    };

export type ActionContext = {
  rngSeed?: number;
  rng?: () => number;
};

export type GameErrorCode =
  | "NOT_YOUR_TURN"
  | "UNKNOWN_ACTION"
  | "ALREADY_ROLLED"
  | "NOT_ROLLED"
  | "CANNOT_BUY"
  | "NOT_ENOUGH_MONEY"
  | "GAME_OVER";

export type GameError = {
  code: GameErrorCode;
  message: string;
};

export type ApplyResult = {
  state: GameState;
  error?: GameError;
};

export const STARTING_MONEY = 1500;
export const START_BONUS = 200;

const DEFAULT_BOARD: BoardSpace[] = [
  { id: 0, name: "启程广场", type: "START" },
  { id: 1, name: "港湾路", type: "PROPERTY", cost: 60, rentTable: [2] },
  { id: 2, name: "运河街", type: "PROPERTY", cost: 60, rentTable: [4] },
  { id: 3, name: "旧城巷", type: "EMPTY" },
  { id: 4, name: "枫叶大道", type: "PROPERTY", cost: 100, rentTable: [6] },
  { id: 5, name: "落日大道", type: "PROPERTY", cost: 120, rentTable: [8] },
  { id: 6, name: "集市广场", type: "EMPTY" },
  { id: 7, name: "灯塔路", type: "PROPERTY", cost: 140, rentTable: [10] },
  { id: 8, name: "河畔大道", type: "PROPERTY", cost: 160, rentTable: [12] },
  { id: 9, name: "节庆广场", type: "EMPTY" },
  { id: 10, name: "松岭区", type: "PROPERTY", cost: 180, rentTable: [14] },
  { id: 11, name: "市政中心", type: "EMPTY" },
  { id: 12, name: "北站街", type: "PROPERTY", cost: 200, rentTable: [16] },
  { id: 13, name: "花园步道", type: "PROPERTY", cost: 220, rentTable: [18] },
  { id: 14, name: "天际台", type: "EMPTY" },
  { id: 15, name: "东码头", type: "PROPERTY", cost: 240, rentTable: [20] },
  { id: 16, name: "胜利公园", type: "PROPERTY", cost: 260, rentTable: [22] },
  { id: 17, name: "市中心环路", type: "EMPTY" },
  { id: 18, name: "山顶小区", type: "PROPERTY", cost: 280, rentTable: [24] },
  { id: 19, name: "宏伟广场", type: "PROPERTY", cost: 300, rentTable: [26] },
  { id: 20, name: "海滨长廊", type: "EMPTY" },
  { id: 21, name: "水晶湾", type: "PROPERTY", cost: 320, rentTable: [28] },
  { id: 22, name: "铁桥街", type: "PROPERTY", cost: 350, rentTable: [35] },
  { id: 23, name: "巅峰庭院", type: "PROPERTY", cost: 400, rentTable: [50] }
];

export function createInitialState(
  players: PlayerInput[],
  options?: { board?: BoardSpace[]; startingMoney?: number }
): GameState {
  const board = (options?.board ?? DEFAULT_BOARD).map((space) => ({
    ...space,
    ownerId: space.ownerId ?? null
  }));
  const startingMoney = options?.startingMoney ?? STARTING_MONEY;

  const normalizedPlayers: Player[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    money: startingMoney,
    position: 0,
    inJail: false,
    jailTurns: 0,
    properties: [],
    isBankrupt: false
  }));

  return {
    board,
    players: normalizedPlayers,
    currentPlayerIndex: 0,
    turn: 1,
    lastRoll: null,
    log: [`游戏创建完成：${players.length} 名玩家加入。`],
    winnerId: null
  };
}

export function createRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDice(rngSeed?: number): DiceRoll {
  const rng = rngSeed === undefined ? Math.random : createRng(rngSeed);
  return rollDiceWithRng(rng);
}

function rollDiceWithRng(rng: () => number): DiceRoll {
  const d1 = Math.floor(rng() * 6) + 1;
  const d2 = Math.floor(rng() * 6) + 1;
  return { d1, d2, total: d1 + d2 };
}

export function applyAction(
  state: GameState,
  action: Action,
  context?: ActionContext
): ApplyResult {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== action.playerId) {
    return {
      state,
      error: {
        code: "NOT_YOUR_TURN",
        message: "当前不是你的回合。"
      }
    };
  }

  if (state.winnerId) {
    return {
      state,
      error: {
        code: "GAME_OVER",
        message: "游戏已结束。"
      }
    };
  }

  switch (action.type) {
    case "ROLL_DICE": {
      if (state.lastRoll) {
        return {
          state,
          error: {
            code: "ALREADY_ROLLED",
            message: "本回合已掷骰。"
          }
        };
      }

      const rng =
        context?.rng ??
        (context?.rngSeed !== undefined
          ? createRng(context.rngSeed)
          : Math.random);
      const roll = rollDiceWithRng(rng);
      const boardSize = state.board.length;
      const movedPosition = (currentPlayer.position + roll.total) % boardSize;
      const passedStart = currentPlayer.position + roll.total >= boardSize;
      let updatedMoney = passedStart
        ? currentPlayer.money + START_BONUS
        : currentPlayer.money;

      const updatedBoard = state.board.map((space) => ({ ...space }));
      const updatedPlayers = state.players.map((player) => ({ ...player }));
      const player = updatedPlayers[state.currentPlayerIndex];
      player.position = movedPosition;
      player.money = updatedMoney;

      const logEntries: string[] = [];
      logEntries.push(
        `${player.name} 掷出了 ${roll.d1} + ${roll.d2}。`
      );
      if (passedStart) {
        logEntries.push(`${player.name} 经过起点，获得 ${START_BONUS}。`);
      }

      const landedSpace = updatedBoard[movedPosition];
      if (landedSpace.type === "PROPERTY") {
        if (landedSpace.ownerId && landedSpace.ownerId !== player.id) {
          const rent = landedSpace.rentTable?.[0] ?? 0;
          const ownerIndex = updatedPlayers.findIndex(
            (entry) => entry.id === landedSpace.ownerId
          );
          if (ownerIndex >= 0) {
            const owner = updatedPlayers[ownerIndex];
            if (player.money >= rent) {
              player.money -= rent;
              owner.money += rent;
              logEntries.push(
                `${player.name} 向 ${owner.name} 支付租金 ${rent}。`
              );
            } else {
              const paid = player.money;
              player.money = 0;
              owner.money += paid;
              player.isBankrupt = true;
              player.properties = [];
              updatedBoard.forEach((space) => {
                if (space.ownerId === player.id) {
                  space.ownerId = null;
                }
              });
              logEntries.push(
                `${player.name} 无法支付租金，破产出局。`
              );
            }
          }
        } else if (!landedSpace.ownerId) {
          logEntries.push(`${player.name} 停在 ${landedSpace.name}，可购买。`);
        }
      }

      const winnerId = getWinnerId(updatedPlayers);

      return {
        state: {
          ...state,
          board: updatedBoard,
          players: updatedPlayers,
          lastRoll: roll,
          log: [...state.log, ...logEntries],
          winnerId
        }
      };
    }
    case "BUY_CURRENT_SPACE": {
      if (!state.lastRoll) {
        return {
          state,
          error: {
            code: "NOT_ROLLED",
            message: "请先掷骰。"
          }
        };
      }

      const boardSpace = state.board[currentPlayer.position];
      if (
        boardSpace.type !== "PROPERTY" ||
        boardSpace.ownerId ||
        boardSpace.cost === undefined
      ) {
        return {
          state,
          error: {
            code: "CANNOT_BUY",
            message: "当前格子无法购买。"
          }
        };
      }

      if (currentPlayer.money < boardSpace.cost) {
        return {
          state,
          error: {
            code: "NOT_ENOUGH_MONEY",
            message: "余额不足，无法购买。"
          }
        };
      }

      const updatedBoard = state.board.map((space, index) => {
        if (index !== currentPlayer.position) return { ...space };
        return { ...space, ownerId: currentPlayer.id };
      });
      const updatedPlayers = state.players.map((player, index) => {
        if (index !== state.currentPlayerIndex) return { ...player };
        return {
          ...player,
          money: player.money - boardSpace.cost!,
          properties: [...player.properties, boardSpace.id]
        };
      });

      const winnerId = getWinnerId(updatedPlayers);

      return {
        state: {
          ...state,
          board: updatedBoard,
          players: updatedPlayers,
          log: [
            ...state.log,
            `${currentPlayer.name} 购买了 ${boardSpace.name}。`
          ],
          winnerId
        }
      };
    }
    case "END_TURN": {
      const updatedPlayers = state.players.map((player) => ({ ...player }));
      const winnerId = getWinnerId(updatedPlayers);
      const logEntry = `${currentPlayer.name} 结束了回合。`;

      const nextIndex = winnerId
        ? state.currentPlayerIndex
        : getNextActivePlayerIndex(updatedPlayers, state.currentPlayerIndex);

      return {
        state: {
          ...state,
          currentPlayerIndex: nextIndex,
          turn: state.turn + 1,
          lastRoll: null,
          winnerId,
          log: [...state.log, logEntry]
        }
      };
    }
    default:
      return {
        state,
        error: {
          code: "UNKNOWN_ACTION",
          message: "未知操作。"
        }
      };
  }
}

function getWinnerId(players: Player[]): string | null {
  const activePlayers = players.filter((player) => !player.isBankrupt);
  return activePlayers.length === 1 ? activePlayers[0].id : null;
}

function getNextActivePlayerIndex(
  players: Player[],
  currentIndex: number
): number {
  if (players.length === 0) return currentIndex;
  for (let offset = 1; offset <= players.length; offset += 1) {
    const nextIndex = (currentIndex + offset) % players.length;
    if (!players[nextIndex].isBankrupt) return nextIndex;
  }
  return currentIndex;
}
