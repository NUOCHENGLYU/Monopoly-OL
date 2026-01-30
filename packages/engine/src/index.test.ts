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
