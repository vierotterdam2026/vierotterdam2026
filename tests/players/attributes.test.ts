import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ATTRIBUTE_ANCHORS, ATTRIBUTE_KEYS, computeOverall, defaultAttributes } from "@/lib/players/attributes";
import { attributesSchema } from "@/lib/validation/schemas";
import { createTestDb } from "../helpers/pg";

describe("computeOverall", () => {
  it("averages the six attributes", () => {
    expect(computeOverall({ pace: 80, shooting: 70, passing: 60, dribbling: 50, defending: 40, physical: 30 })).toBe(55);
  });

  it("rounds half up", () => {
    expect(computeOverall({ pace: 51, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 })).toBe(50);
    expect(computeOverall({ pace: 53, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 })).toBe(51);
  });

  it("defaults to 50 across the board", () => {
    expect(computeOverall(defaultAttributes())).toBe(50);
  });
});

describe("guidance", () => {
  it("has anchors for every attribute, ascending", () => {
    for (const key of ATTRIBUTE_KEYS) {
      const values = ATTRIBUTE_ANCHORS[key].map((a) => a.value);
      expect(values.length).toBeGreaterThan(1);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
  });
});

describe("attributesSchema", () => {
  it("accepts 1-99 and rejects the rest", () => {
    expect(attributesSchema.safeParse(defaultAttributes()).success).toBe(true);
    expect(attributesSchema.safeParse({ ...defaultAttributes(), pace: 0 }).success).toBe(false);
    expect(attributesSchema.safeParse({ ...defaultAttributes(), pace: 100 }).success).toBe(false);
    expect(attributesSchema.safeParse({ ...defaultAttributes(), pace: 50.5 }).success).toBe(false);
    expect(attributesSchema.safeParse({ pace: 50 }).success).toBe(false);
  });
});

describe("player_attributes table", () => {
  let db: PGlite;
  let playerId: string;

  beforeAll(async () => {
    db = await createTestDb({ seed: true });
    playerId = (await db.query<{ id: string }>("select id from players limit 1")).rows[0].id;
  });
  afterAll(async () => db.close());

  it("computes overall itself and matches the TypeScript formula", async () => {
    await db.exec(
      `insert into player_attributes (player_id, pace, shooting, passing, dribbling, defending, physical)
       values ('${playerId}', 53, 50, 50, 50, 50, 50)`,
    );
    const { rows } = await db.query<{ overall: number }>(`select overall from player_attributes where player_id = '${playerId}'`);
    expect(rows[0].overall).toBe(computeOverall({ pace: 53, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 }));
  });

  it("rejects out-of-range values and refuses a manual overall", async () => {
    await expect(db.exec(`update player_attributes set pace = 100 where player_id = '${playerId}'`)).rejects.toThrow();
    await expect(db.exec(`update player_attributes set overall = 99 where player_id = '${playerId}'`)).rejects.toThrow();
  });
});
