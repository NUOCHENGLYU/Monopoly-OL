export type BoardSpaceType =
  | "START"
  | "PROPERTY"
  | "EMPTY"
  | "TAX"
  | "JAIL"
  | "GOTO_JAIL"
  | "CARD";

export type BoardSpace = {
  id: number;
  name: string;
  type: BoardSpaceType;
  cost?: number;
  rentTable?: number[];
  colorGroup?: string;
  buildCost?: number;
  ownerId?: string | null;
  houses?: number;
  taxAmount?: number;
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
      type: "PAY_BAIL";
      playerId: string;
    }
  | {
      type: "BUILD_HOUSE";
      playerId: string;
      propertyId: number;
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
  | "CANNOT_BUILD"
  | "NOT_ENOUGH_MONEY"
  | "GAME_OVER"
  | "IN_JAIL"
  | "NOT_IN_JAIL";

export type GameError = {
  code: GameErrorCode;
  message: string;
};

export type ApplyResult = {
  state: GameState;
  error?: GameError;
};

type CardEffect =
  | { type: "MONEY"; amount: number }
  | { type: "MOVE_ABS"; position: number }
  | { type: "MOVE_REL"; steps: number }
  | { type: "GOTO_JAIL" };

type Card = {
  id: string;
  description: string;
  effect: CardEffect;
};

export const STARTING_MONEY = 1500;
export const START_BONUS = 200;
export const BAIL_COST = 50;
export const JAIL_MAX_TURNS = 3;
const DEFAULT_TAX = 100;

const rentTable = (base: number) => [
  base,
  base * 5,
  base * 15,
  base * 30,
  base * 50
];

const property = (
  id: number,
  name: string,
  cost: number,
  baseRent: number,
  colorGroup: string,
  buildCost: number
): BoardSpace => ({
  id,
  name,
  type: "PROPERTY",
  cost,
  rentTable: rentTable(baseRent),
  colorGroup,
  buildCost
});

const CARD_DECK: Card[] = [
  {
    id: "bonus_stipend",
    description: "领取补助金 +100",
    effect: { type: "MONEY", amount: 100 }
  },
  {
    id: "pay_fee",
    description: "缴纳管理费 -50",
    effect: { type: "MONEY", amount: -50 }
  },
  {
    id: "festival_bonus",
    description: "节庆奖励 +150",
    effect: { type: "MONEY", amount: 150 }
  },
  {
    id: "charity",
    description: "慈善捐助 -75",
    effect: { type: "MONEY", amount: -75 }
  },
  {
    id: "advance_start",
    description: "前往启程广场，并领取起点奖励",
    effect: { type: "MOVE_ABS", position: 0 }
  },
  {
    id: "advance_three",
    description: "前进 3 格",
    effect: { type: "MOVE_REL", steps: 3 }
  },
  {
    id: "step_back",
    description: "后退 2 格",
    effect: { type: "MOVE_REL", steps: -2 }
  },
  {
    id: "go_market",
    description: "前往集市广场",
    effect: { type: "MOVE_ABS", position: 6 }
  },
  {
    id: "go_hilltop",
    description: "前往山顶小区",
    effect: { type: "MOVE_ABS", position: 18 }
  },
  { id: "go_to_jail", description: "前往监狱", effect: { type: "GOTO_JAIL" } }
];

const DEFAULT_BOARD: BoardSpace[] = [
  { id: 0, name: "启程广场", type: "START" },
  property(1, "港湾路", 60, 2, "港区", 50),
  property(2, "运河街", 60, 4, "港区", 50),
  { id: 3, name: "机遇站", type: "CARD" },
  property(4, "枫叶大道", 100, 6, "枫林", 50),
  property(5, "落日大道", 120, 8, "枫林", 50),
  { id: 6, name: "税务所", type: "TAX", taxAmount: 100 },
  property(7, "灯塔路", 140, 10, "灯塔", 100),
  property(8, "河畔大道", 160, 12, "灯塔", 100),
  { id: 9, name: "机遇站", type: "CARD" },
  property(10, "松岭区", 180, 14, "松岭", 100),
  { id: 11, name: "监狱", type: "JAIL" },
  property(12, "北站街", 200, 16, "松岭", 100),
  property(13, "花园步道", 220, 18, "花园", 150),
  { id: 14, name: "税务所", type: "TAX", taxAmount: 150 },
  property(15, "东码头", 240, 20, "花园", 150),
  property(16, "胜利公园", 260, 22, "胜利", 150),
  { id: 17, name: "机遇站", type: "CARD" },
  property(18, "山顶小区", 280, 24, "胜利", 150),
  property(19, "宏伟广场", 300, 26, "宏伟", 200),
  { id: 20, name: "前往监狱", type: "GOTO_JAIL" },
  property(21, "水晶湾", 320, 28, "宏伟", 200),
  property(22, "铁桥街", 350, 35, "巅峰", 200),
  property(23, "巅峰庭院", 400, 50, "巅峰", 200)
];

export function createInitialState(
  players: PlayerInput[],
  options?: { board?: BoardSpace[]; startingMoney?: number }
): GameState {
  const board = (options?.board ?? DEFAULT_BOARD).map((space) => ({
    ...space,
    ownerId: space.ownerId ?? null,
    houses: space.houses ?? 0
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
      const updatedBoard = cloneBoard(state.board);
      const updatedPlayers = clonePlayers(state.players);
      const player = updatedPlayers[state.currentPlayerIndex];
      const logEntries: string[] = [];

      if (player.inJail) {
        const isDouble = roll.d1 === roll.d2;
        if (isDouble) {
          player.inJail = false;
          player.jailTurns = 0;
          logEntries.push(`${player.name} 掷出对子，出狱并前进 ${roll.total}。`);
          moveBy(player, roll.total, logEntries, updatedBoard.length);
          resolveLanding(
            player,
            updatedBoard,
            updatedPlayers,
            rng,
            logEntries,
            true
          );
        } else {
          player.jailTurns += 1;
          logEntries.push(
            `${player.name} 未掷出对子，留在监狱（${player.jailTurns}/${JAIL_MAX_TURNS}）。`
          );
          if (player.jailTurns >= JAIL_MAX_TURNS) {
            if (player.money >= BAIL_COST) {
              player.money -= BAIL_COST;
              player.inJail = false;
              player.jailTurns = 0;
              logEntries.push(
                `${player.name} 第三回合未出狱，支付保释金 ${BAIL_COST} 并前进 ${roll.total}。`
              );
              moveBy(player, roll.total, logEntries, updatedBoard.length);
              resolveLanding(
                player,
                updatedBoard,
                updatedPlayers,
                rng,
                logEntries,
                true
              );
            } else {
              handleBankruptcy(player, updatedBoard);
              logEntries.push(`${player.name} 无法支付保释金，破产出局。`);
            }
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

      logEntries.push(`${player.name} 掷出了 ${roll.d1} + ${roll.d2}。`);
      moveBy(player, roll.total, logEntries, updatedBoard.length);
      resolveLanding(
        player,
        updatedBoard,
        updatedPlayers,
        rng,
        logEntries,
        true
      );

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

      if (currentPlayer.inJail) {
        return {
          state,
          error: {
            code: "IN_JAIL",
            message: "在监狱中无法购买地产。"
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

      const updatedBoard = cloneBoard(state.board);
      const updatedPlayers = clonePlayers(state.players);
      updatedBoard[currentPlayer.position].ownerId = currentPlayer.id;
      const player = updatedPlayers[state.currentPlayerIndex];
      player.money -= boardSpace.cost;
      player.properties = [...player.properties, boardSpace.id];

      const winnerId = getWinnerId(updatedPlayers);

      return {
        state: {
          ...state,
          board: updatedBoard,
          players: updatedPlayers,
          log: [...state.log, `${currentPlayer.name} 购买了 ${boardSpace.name}。`],
          winnerId
        }
      };
    }
    case "PAY_BAIL": {
      if (!currentPlayer.inJail) {
        return {
          state,
          error: {
            code: "NOT_IN_JAIL",
            message: "当前不在监狱中。"
          }
        };
      }

      if (currentPlayer.money < BAIL_COST) {
        return {
          state,
          error: {
            code: "NOT_ENOUGH_MONEY",
            message: "余额不足，无法支付保释金。"
          }
        };
      }

      const updatedPlayers = clonePlayers(state.players);
      const player = updatedPlayers[state.currentPlayerIndex];
      player.money -= BAIL_COST;
      player.inJail = false;
      player.jailTurns = 0;

      const winnerId = getWinnerId(updatedPlayers);

      return {
        state: {
          ...state,
          players: updatedPlayers,
          log: [...state.log, `${player.name} 支付保释金 ${BAIL_COST}，出狱。`],
          winnerId
        }
      };
    }
    case "BUILD_HOUSE": {
      if (currentPlayer.inJail) {
        return {
          state,
          error: {
            code: "IN_JAIL",
            message: "在监狱中无法建造房屋。"
          }
        };
      }

      const targetIndex = state.board.findIndex(
        (space) => space.id === action.propertyId
      );
      if (targetIndex < 0) {
        return {
          state,
          error: {
            code: "CANNOT_BUILD",
            message: "未找到目标地产。"
          }
        };
      }

      const targetSpace = state.board[targetIndex];
      if (
        targetSpace.type !== "PROPERTY" ||
        targetSpace.ownerId !== currentPlayer.id
      ) {
        return {
          state,
          error: {
            code: "CANNOT_BUILD",
            message: "只能在自己的地产上建房。"
          }
        };
      }

      if (!targetSpace.colorGroup) {
        return {
          state,
          error: {
            code: "CANNOT_BUILD",
            message: "该地产不可建房。"
          }
        };
      }

      if (!hasMonopoly(currentPlayer.id, state.board, targetSpace.colorGroup)) {
        return {
          state,
          error: {
            code: "CANNOT_BUILD",
            message: "未垄断该地产组，无法建房。"
          }
        };
      }

      const currentHouses = targetSpace.houses ?? 0;
      if (currentHouses >= 4) {
        return {
          state,
          error: {
            code: "CANNOT_BUILD",
            message: "该地产已达到房屋上限。"
          }
        };
      }

      const cost = targetSpace.buildCost ?? 0;
      if (cost <= 0) {
        return {
          state,
          error: {
            code: "CANNOT_BUILD",
            message: "该地产无法建房。"
          }
        };
      }

      if (currentPlayer.money < cost) {
        return {
          state,
          error: {
            code: "NOT_ENOUGH_MONEY",
            message: "余额不足，无法建房。"
          }
        };
      }

      const updatedBoard = cloneBoard(state.board);
      const updatedPlayers = clonePlayers(state.players);
      const player = updatedPlayers[state.currentPlayerIndex];

      updatedBoard[targetIndex].houses = currentHouses + 1;
      player.money -= cost;

      const winnerId = getWinnerId(updatedPlayers);

      return {
        state: {
          ...state,
          board: updatedBoard,
          players: updatedPlayers,
          log: [
            ...state.log,
            `${player.name} 在 ${targetSpace.name} 建造了 1 栋房屋（共 ${currentHouses + 1} 栋）。`
          ],
          winnerId
        }
      };
    }
    case "END_TURN": {
      const updatedPlayers = clonePlayers(state.players);
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

function resolveLanding(
  player: Player,
  board: BoardSpace[],
  players: Player[],
  rng: () => number,
  logEntries: string[],
  allowCard: boolean
) {
  if (player.isBankrupt) return;

  const space = board[player.position];
  switch (space.type) {
    case "PROPERTY": {
      if (space.ownerId && space.ownerId !== player.id) {
        const houses = space.houses ?? 0;
        const rent =
          space.rentTable?.[houses] ?? space.rentTable?.[0] ?? 0;
        const owner = players.find((entry) => entry.id === space.ownerId);
        if (owner) {
          if (player.money >= rent) {
            player.money -= rent;
            owner.money += rent;
            logEntries.push(`${player.name} 向 ${owner.name} 支付租金 ${rent}。`);
          } else {
            const paid = player.money;
            player.money = 0;
            owner.money += paid;
            handleBankruptcy(player, board);
            logEntries.push(`${player.name} 无法支付租金，破产出局。`);
          }
        }
      } else if (!space.ownerId) {
        logEntries.push(`${player.name} 停在 ${space.name}，可购买。`);
      }
      break;
    }
    case "TAX": {
      const amount = space.taxAmount ?? DEFAULT_TAX;
      if (player.money >= amount) {
        player.money -= amount;
        logEntries.push(`${player.name} 支付税款 ${amount}。`);
      } else {
        player.money = 0;
        handleBankruptcy(player, board);
        logEntries.push(`${player.name} 无法支付税款，破产出局。`);
      }
      break;
    }
    case "GOTO_JAIL": {
      sendToJail(player, board, logEntries);
      break;
    }
    case "JAIL": {
      logEntries.push(`${player.name} 到达监狱（只是探视）。`);
      break;
    }
    case "CARD": {
      if (!allowCard) return;
      const card = drawCard(rng);
      logEntries.push(`事件卡：${card.description}`);
      applyCardEffect(card.effect, player, board, players, rng, logEntries);
      break;
    }
    case "START":
    case "EMPTY":
    default:
      break;
  }
}

function applyCardEffect(
  effect: CardEffect,
  player: Player,
  board: BoardSpace[],
  players: Player[],
  rng: () => number,
  logEntries: string[]
) {
  switch (effect.type) {
    case "MONEY": {
      const nextMoney = player.money + effect.amount;
      if (nextMoney >= 0) {
        player.money = nextMoney;
        logEntries.push(
          `${player.name} ${effect.amount >= 0 ? "获得" : "支付"} ${Math.abs(
            effect.amount
          )}。`
        );
      } else {
        player.money = 0;
        handleBankruptcy(player, board);
        logEntries.push(`${player.name} 无法支付费用，破产出局。`);
      }
      break;
    }
    case "MOVE_ABS": {
      const target = normalizePosition(effect.position, board.length);
      const passedStart = target < player.position;
      player.position = target;
      if (passedStart) {
        player.money += START_BONUS;
        logEntries.push(`${player.name} 经过起点，获得 ${START_BONUS}。`);
      }
      resolveLanding(player, board, players, rng, logEntries, false);
      break;
    }
    case "MOVE_REL": {
      moveBy(player, effect.steps, logEntries, board.length);
      resolveLanding(player, board, players, rng, logEntries, false);
      break;
    }
    case "GOTO_JAIL": {
      sendToJail(player, board, logEntries);
      break;
    }
  }
}

function moveBy(
  player: Player,
  steps: number,
  logEntries: string[],
  boardSize: number
) {
  const rawPosition = player.position + steps;
  const passedStart = rawPosition >= boardSize;
  player.position = normalizePosition(rawPosition, boardSize);
  if (passedStart) {
    player.money += START_BONUS;
    logEntries.push(`${player.name} 经过起点，获得 ${START_BONUS}。`);
  }
}

function sendToJail(player: Player, board: BoardSpace[], logEntries: string[]) {
  const jailIndex = board.findIndex((space) => space.type === "JAIL");
  if (jailIndex >= 0) {
    player.position = jailIndex;
  }
  player.inJail = true;
  player.jailTurns = 0;
  logEntries.push(`${player.name} 被送往监狱。`);
}

function drawCard(rng: () => number): Card {
  const index = Math.floor(rng() * CARD_DECK.length);
  return CARD_DECK[index] ?? CARD_DECK[0];
}

function normalizePosition(position: number, boardSize: number) {
  const mod = position % boardSize;
  return mod < 0 ? mod + boardSize : mod;
}

function cloneBoard(board: BoardSpace[]) {
  return board.map((space) => ({ ...space }));
}

function clonePlayers(players: Player[]) {
  return players.map((player) => ({
    ...player,
    properties: [...player.properties]
  }));
}

function handleBankruptcy(player: Player, board: BoardSpace[]) {
  player.isBankrupt = true;
  player.properties = [];
  board.forEach((space) => {
    if (space.ownerId === player.id) {
      space.ownerId = null;
      space.houses = 0;
    }
  });
}

function hasMonopoly(playerId: string, board: BoardSpace[], group: string) {
  const groupSpaces = board.filter(
    (space) => space.type === "PROPERTY" && space.colorGroup === group
  );
  return (
    groupSpaces.length > 0 &&
    groupSpaces.every((space) => space.ownerId === playerId)
  );
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
