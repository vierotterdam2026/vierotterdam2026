/** FIFA-style player attributes. Pure: no React, no Supabase. */

export const ATTRIBUTE_KEYS = ["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type Attributes = Record<AttributeKey, number>;

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 99;
export const DEFAULT_ATTRIBUTE = 50;

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  pace: "Pace",
  shooting: "Shooting",
  passing: "Passing",
  dribbling: "Dribbling",
  defending: "Defending",
  physical: "Physical",
};

export const ATTRIBUTE_SHORT: Record<AttributeKey, string> = {
  pace: "PAC",
  shooting: "SHO",
  passing: "PAS",
  dribbling: "DRI",
  defending: "DEF",
  physical: "PHY",
};

export interface Anchor {
  value: number;
  text: string;
}

/**
 * Anchors so everyone rates against the same yardstick: our Sunday group, not
 * professional football. 50 is the typical player in the group.
 */
export const ATTRIBUTE_ANCHORS: Record<AttributeKey, Anchor[]> = {
  pace: [
    { value: 25, text: "Walks back; gets outrun by most" },
    { value: 50, text: "Average speed for the group" },
    { value: 75, text: "Among the quicker players" },
    { value: 95, text: "Nobody here catches you" },
  ],
  shooting: [
    { value: 25, text: "Rarely hits the target" },
    { value: 50, text: "Scores the odd goal" },
    { value: 75, text: "Reliable finisher, good from range" },
    { value: 95, text: "Clinical from anywhere" },
  ],
  passing: [
    { value: 25, text: "Passes often go astray" },
    { value: 50, text: "Finds a teammate most of the time" },
    { value: 75, text: "Accurate, sees the killer ball" },
    { value: 95, text: "Runs the game with your passing" },
  ],
  dribbling: [
    { value: 25, text: "Loses it under pressure" },
    { value: 50, text: "Keeps it when not pressed" },
    { value: 75, text: "Beats a defender regularly" },
    { value: 95, text: "Impossible to dispossess" },
  ],
  defending: [
    { value: 25, text: "Stays up front; rarely tracks back" },
    { value: 50, text: "Does the job when needed" },
    { value: 75, text: "Wins tackles and reads the game" },
    { value: 95, text: "A wall; nothing gets past" },
  ],
  physical: [
    { value: 25, text: "Tires quickly, easily pushed off the ball" },
    { value: 50, text: "Lasts the game, holds your own" },
    { value: 75, text: "Strong and still fresh at the end" },
    { value: 95, text: "Powerhouse; wins every duel and never tires" },
  ],
};

/** Mean of the six attributes, rounded half up. Mirrors the generated `overall` column. */
export function computeOverall(attrs: Attributes): number {
  const sum = ATTRIBUTE_KEYS.reduce((total, key) => total + attrs[key], 0);
  return Math.round(sum / ATTRIBUTE_KEYS.length);
}

export function defaultAttributes(): Attributes {
  return Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, DEFAULT_ATTRIBUTE])) as Attributes;
}
