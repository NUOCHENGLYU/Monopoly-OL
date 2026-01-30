import { describe, expect, it } from "vitest";
import {
  START_BONUS,
  applyAction,
  createInitialState,
  rollDice
} from "./index";

const sequenceRng = (values: number[]) => {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
};

describe("rollDice", () => {
  it("returns values between 1 and 6", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const roll = rollDice(seed);
      expect(roll.d1).toBeGreaterThanOrEqual(1);
      expect(roll.d1).toBeLessThanOrEqual(6);
      expect(roll.d2).toBeGreaterThanOrEqual(1);
      expect(roll.d2).toBeLessThanOrEqual(6);
      expect(roll.total).toBe(roll.d1 + roll.d2);
    }
  });
});

describe("applyAction", () => {
  it("moves player and awards start bonus when passing start", () => {
    const state = createInitialState([
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" }
    ]);
    const boardSize = state.board.length;
    const adjustedPlayers = state.players.map((player, index) => {
      if (index !== 0) return player;
      return { ...player, position: boardSize - 2, money: 1000 };
    });
    const adjustedState = { ...state, players: adjustedPlayers };

    const result = applyAction(
      adjustedState,
      { type: "ROLL_DICE", playerId: "p1" },
      { rng: sequenceRng([0.2, 0.2]) }
    );

    expect(result.error).toBeUndefined();
    expect(result.state.players[0].position).toBe(2);
    expect(result.state.players[0].money).toBe(1000 + START_BONUS);
    expect(result.state.lastRoll?.total).toBe(4);
  });

  it("allows buying an unowned property", () => {
    const board = [
      { id: 0, name: "Start", type: "START" as const },
      {
        id: 1,
        name: "Test Property",
        type: "PROPERTY" as const,
        cost: 100,
        rentTable: [10]
      }
    ];
    const state = createInitialState(
      [
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" }
      ],
      { board, startingMoney: 500 }
    );

    const withRoll = {
      ...state,
      lastRoll: { d1: 1, d2: 1, total: 2 },
      players: state.players.map((player, index) =>
        index === 0 ? { ...player, position: 1 } : player
      )
    };

    const result = applyAction(withRoll, {
      type: "BUY_CURRENT_SPACE",
      playerId: "p1"
    });

    expect(result.error).toBeUndefined();
    expect(result.state.players[0].money).toBe(400);
    expect(result.state.board[1].ownerId).toBe("p1");
  });

  it("charges rent when landing on owned property", () => {
    const board = [
      { id: 0, name: "Start", type: "START" as const },
      { id: 1, name: "Empty", type: "EMPTY" as const },
      {
        id: 2,
        name: "Rent Spot",
        type: "PROPERTY" as const,
        cost: 100,
        rentTable: [50],
        ownerId: "p2"
      }
    ];
    const state = createInitialState(
      [
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" }
      ],
      { board, startingMoney: 200 }
    );

    const result = applyAction(
      state,
      { type: "ROLL_DICE", playerId: "p1" },
      { rng: sequenceRng([0, 0]) }
    );

    expect(result.state.players[0].position).toBe(2);
    expect(result.state.players[0].money).toBe(150);
    expect(result.state.players[1].money).toBe(250);
  });

  it("marks player bankrupt if they cannot pay rent", () => {
    const board = [
      { id: 0, name: "Start", type: "START" as const },
      { id: 1, name: "Empty", type: "EMPTY" as const },
      {
        id: 2,
        name: "Rent Spot",
        type: "PROPERTY" as const,
        cost: 100,
        rentTable: [80],
        ownerId: "p2"
      },
      {
        id: 3,
        name: "Owned",
        type: "PROPERTY" as const,
        cost: 100,
        rentTable: [10],
        ownerId: "p1"
      }
    ];
    const state = createInitialState(
      [
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" }
      ],
      { board, startingMoney: 50 }
    );

    const result = applyAction(
      state,
      { type: "ROLL_DICE", playerId: "p1" },
      { rng: sequenceRng([0, 0]) }
    );

    expect(result.state.players[0].position).toBe(2);
    expect(result.state.players[0].money).toBe(0);
    expect(result.state.players[0].isBankrupt).toBe(true);
    expect(result.state.board[3].ownerId).toBe(null);
  });

  it("charges tax when landing on tax space", () => {
    const board = [
      { id: 0, name: "Start", type: "START" as const },
      { id: 1, name: "Empty", type: "EMPTY" as const },
      { id: 2, name: "Tax", type: "TAX" as const, taxAmount: 80 }
    ];
    const state = createInitialState(
      [{ id: "p1", name: "Alice" }],
      { board, startingMoney: 200 }
    );

    const result = applyAction(
      state,
      { type: "ROLL_DICE", playerId: "p1" },
      { rng: sequenceRng([0, 0]) }
    );

    expect(result.state.players[0].position).toBe(2);
    expect(result.state.players[0].money).toBe(120);
  });

  it("sends player to jail when landing on go-to-jail", () => {
    const board = [
      { id: 0, name: "Start", type: "START" as const },
      { id: 1, name: "Empty", type: "EMPTY" as const },
      { id: 2, name: "Go To Jail", type: "GOTO_JAIL" as const },
      { id: 3, name: "Jail", type: "JAIL" as const }
    ];
    const state = createInitialState([{ id: "p1", name: "Alice" }], {
      board,
      startingMoney: 200
    });

    const result = applyAction(
      state,
      { type: "ROLL_DICE", playerId: "p1" },
      { rng: sequenceRng([0, 0]) }
    );

    expect(result.state.players[0].inJail).toBe(true);
    expect(result.state.players[0].position).toBe(3);
  });

  it("draws a card and applies money effect", () => {
    const board = [
      { id: 0, name: "Start", type: "START" as const },
      { id: 1, name: "Empty", type: "EMPTY" as const },
      { id: 2, name: "Card", type: "CARD" as const }
    ];
    const state = createInitialState([{ id: "p1", name: "Alice" }], {
      board,
      startingMoney: 200
    });

    const result = applyAction(
      state,
      { type: "ROLL_DICE", playerId: "p1" },
      { rng: sequenceRng([0, 0, 0]) }
    );

    expect(result.state.players[0].position).toBe(2);
    expect(result.state.players[0].money).toBe(300);
  });

  it("rejects actions from non-current players", () => {
    const state = createInitialState([
      { id: "p1", name: "Alice" },
      { id: "p2", name: "Bob" }
    ]);

    const result = applyAction(
      state,
      { type: "ROLL_DICE", playerId: "p2" },
      { rng: sequenceRng([0.2, 0.2]) }
    );

    expect(result.error?.code).toBe("NOT_YOUR_TURN");
    expect(result.state).toBe(state);
  });
});
