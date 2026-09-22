import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes } from "@/lib/players/attributes";
import {
  COVERED_CATEGORIES,
  OUTFIELD_CATEGORIES,
  PRIMARY_CATEGORY,
  type PositionCategory,
  type PositionCode,
} from "./positions";
import { attributeStrength, blendedStrength, ATTRIBUTE_SHARE } from "./strength";
import type { AssignedPlayer, GeneratorPlayer } from "./types";

/** Penalty for asking a player to play away from their stated choices (spec §10). */
export const PREFERENCE_PENALTY = { 1: 0, 2: 2, 3: 4, outside: 8 } as const;

/** How much worse we assume a player is in a position they never asked for. */
const UNFAMILIAR_POSITION_DROP = 1.5;

/** Used when a player has saved no preferences at all. */
const UNKNOWN_PLAYER_RATING = 5;

const DEFAULT_POSITION_FOR: Record<PositionCategory, PositionCode> = {
  goalkeeper: "GK",
  defensive: "DEF",
  midfield: "CM",
  attacking: "ST",
};

export interface PreparedPlayer {
  id: string;
  name: string;
  byPosition: Map<PositionCode, { rank: number; rating: number }>;
  /** Assumed rating in a position they did not choose. */
  fallbackRating: number;
  /** Best rating across their chosen positions — used for draft ordering. */
  bestRating: number;
  goalkeeperRating: number | null;
  attributes: Attributes | null;
}

export function preparePlayers(players: GeneratorPlayer[]): PreparedPlayer[] {
  return players.map((player) => {
    const byPosition = new Map<PositionCode, { rank: number; rating: number }>();
    for (const pref of player.positions) {
      const existing = byPosition.get(pref.position);
      if (!existing || pref.preferenceRank < existing.rank) {
        byPosition.set(pref.position, { rank: pref.preferenceRank, rating: pref.rating });
      }
    }

    const ratings = [...byPosition.values()].map((v) => v.rating);
    const mean = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : UNKNOWN_PLAYER_RATING;
    const attributes = player.attributes ?? null;
    const oldBest = ratings.length ? Math.max(...ratings) : UNKNOWN_PLAYER_RATING;

    return {
      id: player.id,
      name: player.name,
      byPosition,
      fallbackRating: clampRating(mean - UNFAMILIAR_POSITION_DROP),
      // Draft ordering: the best of their positions, on the blended scale.
      bestRating: attributes
        ? Math.max(
            ...(byPosition.size
              ? [...byPosition].map(([position, v]) => blendedStrength(attributes, position, v.rating))
              : [ATTRIBUTE_SHARE * attributeStrength(attributes, "CM") + (1 - ATTRIBUTE_SHARE) * UNKNOWN_PLAYER_RATING]),
          )
        : oldBest,
      goalkeeperRating: byPosition.get("GK")?.rating ?? null,
      attributes,
    };
  });
}

function clampRating(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value * 100) / 100));
}

/** The self-rated position rating alone, before attributes are blended in. */
function positionRatingIn(player: PreparedPlayer, position: PositionCode): number {
  return player.byPosition.get(position)?.rating ?? player.fallbackRating;
}

/** The strength the balancer uses: 80% attributes, 20% position rating (see `strength.ts`). */
export function ratingIn(player: PreparedPlayer, position: PositionCode): number {
  return blendedStrength(player.attributes, position, positionRatingIn(player, position));
}

export function rankIn(player: PreparedPlayer, position: PositionCode): number | null {
  return player.byPosition.get(position)?.rank ?? null;
}

export function preferencePenalty(rank: number | null): number {
  if (rank === 1) return PREFERENCE_PENALTY[1];
  if (rank === 2) return PREFERENCE_PENALTY[2];
  if (rank === 3) return PREFERENCE_PENALTY[3];
  return PREFERENCE_PENALTY.outside;
}

/** The player's best-ranked position inside a category, or the category default. */
function bestPositionIn(player: PreparedPlayer, category: PositionCategory): PositionCode {
  let best: { position: PositionCode; rank: number } | null = null;
  for (const [position, { rank }] of player.byPosition) {
    if (position === "GK") continue;
    if (PRIMARY_CATEGORY[position] !== category) continue;
    if (!best || rank < best.rank) best = { position, rank };
  }
  return best?.position ?? DEFAULT_POSITION_FOR[category];
}

function bestOutfieldPosition(player: PreparedPlayer): PositionCode {
  let best: { position: PositionCode; rank: number } | null = null;
  for (const [position, { rank }] of player.byPosition) {
    if (position === "GK") continue;
    if (!best || rank < best.rank) best = { position, rank };
  }
  return best?.position ?? "CM";
}

export interface TeamStats {
  assignments: AssignedPlayer[];
  totalRating: number;
  averageRating: number;
  hasGoalkeeper: boolean;
  /** Mean of each attribute over the team's players who have them; null if none do. */
  attributeAverages: Record<AttributeKey, number> | null;
  /** 0 when the team has a sensible defensive/midfield/attacking shape. */
  positionalImbalance: number;
  preferencePenaltySum: number;
  firstChoiceCount: number;
  outsidePreferencesCount: number;
}

/**
 * Picks who plays where inside one team: a keeper first, then everybody's best
 * available choice, then a few swaps to stop a team being all strikers.
 */
export function assignTeamPositions(members: PreparedPlayer[]): AssignedPlayer[] {
  return toAssignedPlayers(assignInternal(members));
}

export function toAssignedPlayers(
  assigned: { player: PreparedPlayer; position: PositionCode }[],
): AssignedPlayer[] {
  return assigned.map(({ player, position }) => ({
    playerId: player.id,
    name: player.name,
    assignedPosition: position,
    rating: round2(ratingIn(player, position)),
    attributes: player.attributes,
    preferenceRank: rankIn(player, position),
  }));
}

function assignInternal(
  members: PreparedPlayer[],
): { player: PreparedPlayer; position: PositionCode }[] {
  if (members.length === 0) return [];

  const remaining = [...members];

  // 1. Goalkeeper. Prefer someone who asked to play there; otherwise the player
  //    who loses the least by going in goal.
  const keepers = remaining.filter((p) => p.goalkeeperRating !== null);
  let keeper: PreparedPlayer;
  if (keepers.length > 0) {
    keeper = keepers.reduce((a, b) => (b.goalkeeperRating! > a.goalkeeperRating! ? b : a));
  } else {
    keeper = remaining.reduce((a, b) => (b.bestRating < a.bestRating ? b : a));
  }
  remaining.splice(remaining.indexOf(keeper), 1);

  const assigned: { player: PreparedPlayer; position: PositionCode }[] = [
    { player: keeper, position: "GK" },
  ];

  // 2. Everyone else takes their highest-ranked outfield position.
  for (const player of remaining) {
    assigned.push({ player, position: bestOutfieldPosition(player) });
  }

  // 3. Nudge the shape towards balance, cheapest moves first.
  rebalanceShape(assigned);

  return assigned;
}

function categoryCounts(assigned: { player: PreparedPlayer; position: PositionCode }[]) {
  return countByCategory(assigned.map(({ position }) => position));
}

function countByCategory(positions: PositionCode[]) {
  const counts: Record<PositionCategory, number> = {
    goalkeeper: 0,
    defensive: 0,
    midfield: 0,
    attacking: 0,
  };
  for (const position of positions) counts[PRIMARY_CATEGORY[position]] += 1;
  return counts;
}

export function coverageGapsOf(positions: PositionCode[]): PositionCategory[] {
  const covered = new Set<PositionCategory>();
  for (const position of positions) {
    for (const category of COVERED_CATEGORIES[position]) covered.add(category);
  }
  return OUTFIELD_CATEGORIES.filter((c) => !covered.has(c));
}

function coverageGapsOfCount(positions: PositionCode[]): number {
  return coverageGapsOf(positions).length;
}

export function shapeImbalance(assigned: { player: PreparedPlayer; position: PositionCode }[]): number {
  return shapeImbalanceOf(assigned.map(({ position }) => position));
}

/** How far a set of assigned positions is from a balanced team shape. 0 is ideal. */
export function shapeImbalanceOf(positions: PositionCode[]): number {
  const outfield = positions.filter((position) => position !== "GK");
  if (outfield.length === 0) return 0;

  const counts = countByCategory(positions);
  const target = outfield.length / OUTFIELD_CATEGORIES.length;
  const deviation = OUTFIELD_CATEGORIES.reduce((sum, c) => sum + Math.abs(counts[c] - target), 0) / 2;

  // A team with nobody at the back at all is worse than a merely lopsided one.
  return coverageGapsOfCount(positions) * 2 + deviation;
}

function rebalanceShape(assigned: { player: PreparedPlayer; position: PositionCode }[]): void {
  const outfieldCount = assigned.filter(({ position }) => position !== "GK").length;
  if (outfieldCount < 3) return;

  for (let pass = 0; pass < 6; pass++) {
    const before = shapeImbalance(assigned);
    if (before === 0) return;

    const counts = categoryCounts(assigned);

    const deficit = [...OUTFIELD_CATEGORIES].sort((a, b) => counts[a] - counts[b])[0];
    const surplus = [...OUTFIELD_CATEGORIES].sort((a, b) => counts[b] - counts[a])[0];
    if (surplus === deficit) return;

    const movable = assigned.filter(
      (entry) => entry.position !== "GK" && PRIMARY_CATEGORY[entry.position] === surplus,
    );
    if (movable.length === 0) return;

    // Move whoever gives up the least by switching category.
    let cheapest: { entry: (typeof assigned)[number]; position: PositionCode; cost: number } | null = null;
    for (const entry of movable) {
      const position = bestPositionIn(entry.player, deficit);
      const cost =
        preferencePenalty(rankIn(entry.player, position)) -
        preferencePenalty(rankIn(entry.player, entry.position));
      if (!cheapest || cost < cheapest.cost) cheapest = { entry, position, cost };
    }
    if (!cheapest) return;

    const previous = cheapest.entry.position;
    cheapest.entry.position = cheapest.position;

    if (shapeImbalance(assigned) >= before) {
      cheapest.entry.position = previous;
      return;
    }
  }
}

export function evaluateTeam(members: PreparedPlayer[]): TeamStats {
  const placed = assignInternal(members);
  const assignments = toAssignedPlayers(placed);
  const totalRating = assignments.reduce((sum, a) => sum + a.rating, 0);

  return {
    assignments,
    totalRating: round2(totalRating),
    averageRating: assignments.length ? round2(totalRating / assignments.length) : 0,
    hasGoalkeeper: members.some((m) => m.goalkeeperRating !== null),
    attributeAverages: attributeAveragesOf(members),
    positionalImbalance: shapeImbalance(placed),
    preferencePenaltySum: assignments.reduce((sum, a) => sum + preferencePenalty(a.preferenceRank), 0),
    firstChoiceCount: assignments.filter((a) => a.preferenceRank === 1).length,
    outsidePreferencesCount: assignments.filter((a) => a.preferenceRank === null).length,
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function attributeAveragesOf(members: PreparedPlayer[]): Record<AttributeKey, number> | null {
  const rated = members.filter((m) => m.attributes);
  if (rated.length === 0) return null;
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, rated.reduce((sum, m) => sum + m.attributes![key], 0) / rated.length]),
  ) as Record<AttributeKey, number>;
}
