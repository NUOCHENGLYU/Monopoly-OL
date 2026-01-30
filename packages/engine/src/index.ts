export type BoardSpaceType = "START" | "PROPERTY" | "EMPTY";

export type BoardSpace = {
  id: number;
  name: string;
  type: BoardSpaceType;
  cost?: number;
  rentTable?: number[];
  colorGroup?: string;
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
      type: "END_TURN";
      playerId: string;
    };

export type ActionContext = {
  rngSeed?: number;
  rng?: () => number;
};

export type GameErrorCode = "NOT_YOUR_TURN" | "UNKNOWN_ACTION";

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
  { id: 0, name: "Start", type: "START" },
  { id: 1, name: "Harbor Lane", type: "PROPERTY", cost: 60, rentTable: [2] },
  { id: 2, name: "Canal Street", type: "PROPERTY", cost: 60, rentTable: [4] },
  { id: 3, name: "Old Town", type: "EMPTY" },
  { id: 4, name: "Maple Avenue", type: "PROPERTY", cost: 100, rentTable: [6] },
  { id: 5, name: "Sunset Boulevard", type: "PROPERTY", cost: 120, rentTable: [8] },
  { id: 6, name: "Market Square", type: "EMPTY" },
  { id: 7, name: "Lighthouse Way", type: "PROPERTY", cost: 140, rentTable: [10] },
  { id: 8, name: "Riverside Drive", type: "PROPERTY", cost: 160, rentTable: [12] },
  { id: 9, name: "Festival Grounds", type: "EMPTY" },
  { id: 10, name: "Pine Ridge", type: "PROPERTY", cost: 180, rentTable: [14] },
  { id: 11, name: "Civic Center", type: "EMPTY" },
  { id: 12, name: "North Station", type: "PROPERTY", cost: 200, rentTable: [16] },
  { id: 13, name: "Garden Walk", type: "PROPERTY", cost: 220, rentTable: [18] },
  { id: 14, name: "Skyline Point", type: "EMPTY" },
  { id: 15, name: "East Pier", type: "PROPERTY", cost: 240, rentTable: [20] },
  { id: 16, name: "Victory Park", type: "PROPERTY", cost: 260, rentTable: [22] },
  { id: 17, name: "Downtown Loop", type: "EMPTY" },
  { id: 18, name: "Hilltop Heights", type: "PROPERTY", cost: 280, rentTable: [24] },
  { id: 19, name: "Grand Plaza", type: "PROPERTY", cost: 300, rentTable: [26] },
  { id: 20, name: "Seaside Walk", type: "EMPTY" },
  { id: 21, name: "Crystal Bay", type: "PROPERTY", cost: 320, rentTable: [28] },
  { id: 22, name: "Iron Bridge", type: "PROPERTY", cost: 350, rentTable: [35] },
  { id: 23, name: "Summit Court", type: "PROPERTY", cost: 400, rentTable: [50] }
];

export function createInitialState(
  players: PlayerInput[],
  options?: { board?: BoardSpace[]; startingMoney?: number }
): GameState {
  const board = options?.board ?? DEFAULT_BOARD;
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
    log: [`Game created with ${players.length} players.`],
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
        message: "Only the current player can act."
      }
    };
  }

  switch (action.type) {
    case "ROLL_DICE": {
      const rng =
        context?.rng ??
        (context?.rngSeed !== undefined
          ? createRng(context.rngSeed)
          : Math.random);
      const roll = rollDiceWithRng(rng);
      const boardSize = state.board.length;
      const movedPosition = (currentPlayer.position + roll.total) % boardSize;
      const passedStart = currentPlayer.position + roll.total >= boardSize;
      const newMoney = passedStart
        ? currentPlayer.money + START_BONUS
        : currentPlayer.money;

      const updatedPlayers = state.players.map((player, index) => {
        if (index !== state.currentPlayerIndex) return player;
        return {
          ...player,
          position: movedPosition,
          money: newMoney
        };
      });

      const logEntry = `${currentPlayer.name} rolled ${roll.d1} + ${roll.d2}.`;

      return {
        state: {
          ...state,
          players: updatedPlayers,
          lastRoll: roll,
          log: [...state.log, logEntry]
        }
      };
    }
    case "END_TURN": {
      const nextIndex = getNextActivePlayerIndex(
        state.players,
        state.currentPlayerIndex
      );
      const winnerId = getWinnerId(state.players);
      const logEntry = `${currentPlayer.name} ended their turn.`;

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
          message: "Unknown action."
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
