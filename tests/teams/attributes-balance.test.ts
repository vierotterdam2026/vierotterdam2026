import { describe, expect, it } from "vitest";
import type { Attributes } from "@/lib/players/attributes";
import { generateBalancedTeams } from "@/lib/teams/generate-balanced-teams";
import { attributeStrength, blendedStrength, POSITION_ATTRIBUTE_WEIGHTS } from "@/lib/teams/strength";
import { POSITION_CODES, type PositionCode } from "@/lib/teams/positions";
import type { GeneratorPlayer } from "@/lib/teams/types";
import { testPlayers } from "../helpers/players";

const flat = (n: number): Attributes => ({ pace: n, shooting: n, passing: n, dribbling: n, defending: n, physical: n });

const player = (id: string, position: PositionCode, rating: number, attributes?: Attributes | null): GeneratorPlayer => ({
  id,
  name: id,
  positions: [{ position, preferenceRank: 1, rating }],
  attributes,
});

describe("strength", () => {
  it("has position weights that sum to 1", () => {
    for (const position of POSITION_CODES) {
      const total = Object.values(POSITION_ATTRIBUTE_WEIGHTS[position]).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it("scores a flat player the same in every position", () => {
    for (const position of POSITION_CODES) expect(attributeStrength(flat(70), position)).toBeCloseTo(7, 10);
  });

  it("rewards the attributes a position cares about", () => {
    const shooter: Attributes = { ...flat(40), shooting: 90, pace: 80 };
    expect(attributeStrength(shooter, "ST")).toBeGreaterThan(attributeStrength(shooter, "DEF"));
  });

  it("weighs attributes 80% and the position rating 20%", () => {
    // Attributes say 8, the position rating says 3: 0.8*8 + 0.2*3 = 7.
    expect(blendedStrength(flat(80), "CM", 3)).toBeCloseTo(7, 10);
  });

  it("falls back to the position rating alone without attributes", () => {
    expect(blendedStrength(null, "CM", 6)).toBe(6);
    expect(blendedStrength(undefined, "CM", 6)).toBe(6);
  });
});

describe("generateBalancedTeams with attributes", () => {
  it("rates assigned players by the blend and keeps the attributes for the snapshot", () => {
    const squad = [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => player(`a${i}`, i < 2 ? "GK" : "CM", 3, flat(80))),
    ];
    const result = generateBalancedTeams(squad, 2, { seed: 1, restarts: 5 });
    for (const team of result.teams) {
      for (const p of team.players) {
        expect(p.rating).toBeGreaterThan(6.5);
        expect(p.attributes).toEqual(flat(80));
      }
    }
  });

  it("puts attribute strength ahead of a generous self-rating", () => {
    // Everyone claims 9, but two players' attributes say they are far weaker.
    // The blend must split the weak pair rather than trust the 9s.
    const squad = [
      player("gk1", "GK", 9, flat(80)),
      player("gk2", "GK", 9, flat(80)),
      player("s1", "CM", 9, flat(85)),
      player("s2", "CM", 9, flat(85)),
      player("s3", "CM", 9, flat(85)),
      player("s4", "CM", 9, flat(85)),
      player("w1", "CM", 9, flat(30)),
      player("w2", "CM", 9, flat(30)),
    ];
    const result = generateBalancedTeams(squad, 2, { seed: 3, restarts: 40 });
    const weakPerTeam = result.teams.map((t) => t.players.filter((p) => p.playerId.startsWith("w")).length);
    expect(weakPerTeam).toEqual([1, 1]);
  });

  it("spreads each attribute, not only the overall average", () => {
    // Same overall for everyone, but half are pure pace and half pure defending.
    const pace: Attributes = { pace: 90, shooting: 30, passing: 30, dribbling: 30, defending: 30, physical: 30 };
    const wall: Attributes = { pace: 30, shooting: 30, passing: 30, dribbling: 30, defending: 90, physical: 30 };
    const squad = [
      player("gk1", "GK", 6, flat(50)),
      player("gk2", "GK", 6, flat(50)),
      ...[1, 2, 3, 4].map((i) => player(`p${i}`, "CM", 6, pace)),
      ...[1, 2, 3, 4].map((i) => player(`d${i}`, "CM", 6, wall)),
    ];
    const result = generateBalancedTeams(squad, 2, { seed: 5, restarts: 60 });
    for (const team of result.teams) {
      const paceers = team.players.filter((p) => p.playerId.startsWith("p")).length;
      expect(paceers).toBe(2);
    }
    expect(result.metrics.attributeImbalance).toBeLessThan(0.5);
  });

  it("still works when only some players have attributes, and warns", () => {
    const squad = testPlayers(14).map((p, i) => (i % 2 === 0 ? { ...p, attributes: flat(60) } : p));
    const result = generateBalancedTeams(squad, 2, { seed: 2, restarts: 20 });
    expect(result.teams.flatMap((t) => t.players)).toHaveLength(14);
    expect(result.warnings.some((w) => /FIFA-style ratings/.test(w))).toBe(true);
  });

  it("behaves as before when nobody has attributes", () => {
    const result = generateBalancedTeams(testPlayers(14), 2, { seed: 2, restarts: 20 });
    expect(result.metrics.attributeImbalance).toBe(0);
    expect(result.warnings.some((w) => /FIFA-style ratings/.test(w))).toBe(false);
  });

  it("handles a squad with no goalkeeper-capable players", () => {
    const squad = Array.from({ length: 10 }, (_, i) => player(`o${i}`, i % 2 ? "DEF" : "ST", 6, flat(40 + i * 5)));
    const result = generateBalancedTeams(squad, 2, { seed: 4, restarts: 20 });
    expect(result.teams.every((t) => t.players.some((p) => p.assignedPosition === "GK"))).toBe(true);
    expect(result.warnings.some((w) => /goalkeeper/i.test(w))).toBe(true);
  });

  it("handles fewer than 14 players", () => {
    const squad = Array.from({ length: 8 }, (_, i) => player(`n${i}`, i < 2 ? "GK" : "CM", 6, flat(45 + i * 6)));
    const result = generateBalancedTeams(squad, 2, { seed: 6, restarts: 20 });
    expect(result.teams.map((t) => t.players.length)).toEqual([4, 4]);
  });

  it("is reproducible with a seed", () => {
    const squad = testPlayers(14).map((p, i) => ({ ...p, attributes: flat(40 + i * 3) }));
    const a = generateBalancedTeams(squad, 2, { seed: 9, restarts: 20 });
    const b = generateBalancedTeams(squad, 2, { seed: 9, restarts: 20 });
    expect(a.teams.map((t) => t.players.map((p) => p.playerId))).toEqual(b.teams.map((t) => t.players.map((p) => p.playerId)));
  });
});
