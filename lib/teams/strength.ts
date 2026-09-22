import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes } from "@/lib/players/attributes";
import type { PositionCode } from "./positions";

/** Share of a player's strength that comes from attributes; the rest is their self-rated position rating. */
export const ATTRIBUTE_SHARE = 0.8;

/** How much each attribute matters in each position. Each row sums to 1. */
export const POSITION_ATTRIBUTE_WEIGHTS: Record<PositionCode, Record<AttributeKey, number>> = {
  GK: { pace: 0.1, shooting: 0, passing: 0.2, dribbling: 0, defending: 0.4, physical: 0.3 },
  DEF: { pace: 0.15, shooting: 0, passing: 0.1, dribbling: 0, defending: 0.45, physical: 0.3 },
  DM: { pace: 0.05, shooting: 0, passing: 0.25, dribbling: 0.1, defending: 0.35, physical: 0.25 },
  CM: { pace: 0.1, shooting: 0.1, passing: 0.35, dribbling: 0.2, defending: 0.1, physical: 0.15 },
  AM: { pace: 0.1, shooting: 0.25, passing: 0.3, dribbling: 0.25, defending: 0, physical: 0.1 },
  WING: { pace: 0.3, shooting: 0.15, passing: 0.15, dribbling: 0.3, defending: 0, physical: 0.1 },
  ST: { pace: 0.2, shooting: 0.4, passing: 0.05, dribbling: 0.2, defending: 0, physical: 0.15 },
};

/** A player's attribute-based strength in a position, on the same 1-10 scale as self-ratings. */
export function attributeStrength(attributes: Attributes, position: PositionCode): number {
  const weights = POSITION_ATTRIBUTE_WEIGHTS[position];
  const value = ATTRIBUTE_KEYS.reduce((sum, key) => sum + attributes[key] * weights[key], 0);
  return Math.min(10, Math.max(1, value / 10));
}

/** 80% attributes, 20% self-rated position rating. Without attributes, the position rating alone. */
export function blendedStrength(
  attributes: Attributes | null | undefined,
  position: PositionCode,
  positionRating: number,
): number {
  if (!attributes) return positionRating;
  return ATTRIBUTE_SHARE * attributeStrength(attributes, position) + (1 - ATTRIBUTE_SHARE) * positionRating;
}
