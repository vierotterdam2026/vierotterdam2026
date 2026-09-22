import type { Attributes } from "@/lib/players/attributes";
import type { PositionCode } from "./positions";

export interface PositionPreference {
  position: PositionCode;
  /** 1 = first choice, 2 = second, 3 = third. */
  preferenceRank: number;
  /** 1-10. The effective rating: a calculated one if it exists, else self-rated. */
  rating: number;
}

export interface GeneratorPlayer {
  id: string;
  name: string;
  /** May be empty: a player who never finished onboarding still has to be placed. */
  positions: PositionPreference[];
  /** FIFA-style self-ratings. Absent for players who have not set any: they fall back to `positions` alone. */
  attributes?: Attributes | null;
}

export interface GenerateTeamsOptions {
  /** Weight ability balance in the objective. Default true. */
  balanceAbility?: boolean;
  /** Weight defensive/midfield/attacking shape. Default true. */
  balancePositions?: boolean;
  /** Weight how often players get their first-choice position. Default true. */
  respectPreferences?: boolean;
  /** Weight spreading goalkeeper-capable players across teams. Default true. */
  balanceGoalkeepers?: boolean;
  /** Seed the RNG so a generation can be reproduced. Default: random. */
  seed?: number;
  /** Independent restarts. More restarts, better arrangement, slower. Default 120. */
  restarts?: number;
  /**
   * A previous arrangement (team index per player id) that the new one should
   * differ from — this is what makes "Regenerate" produce something new.
   */
  previousAssignment?: Record<string, number>;
  /** Fraction of players that should move versus `previousAssignment`. Default 0.25. */
  minimumChangeRatio?: number;
}

export interface AssignedPlayer {
  playerId: string;
  name: string;
  /** The position this player is being asked to play on Sunday. */
  assignedPosition: PositionCode;
  /**
   * Their strength in that position (1-10): 80% attributes and 20% self-rated
   * position rating, or the position rating alone without attributes.
   */
  rating: number;
  /** The attributes this pick was based on, for the snapshot. Null if they have none. */
  attributes: Attributes | null;
  /** 1, 2 or 3 if the assignment is one of their choices; null if it is not. */
  preferenceRank: number | null;
}

export interface GeneratedTeam {
  index: number;
  players: AssignedPlayer[];
  totalRating: number;
  averageRating: number;
  hasGoalkeeper: boolean;
}

export interface BalanceMetrics {
  /** Highest team average minus lowest. The number an organiser actually reads. */
  averageRatingSpread: number;
  ratingStandardDeviation: number;
  teamsWithoutGoalkeeper: number;
  /** Teams left without a keeper that a better arrangement could have avoided. */
  avoidableTeamsWithoutGoalkeeper: number;
  goalkeeperCapableCount: number;
  /** How unevenly the six attributes are spread across teams, 0 if identical. Ignores players without attributes. */
  attributeImbalance: number;
  /** Mean per-team deviation from a balanced defensive/midfield/attacking shape. */
  positionalImbalance: number;
  /** Mean preference penalty per player: 0 if everyone got their first choice. */
  preferencePenalty: number;
  firstChoiceCount: number;
  outsidePreferencesCount: number;
  /** 0-100 indicator derived from the penalty. Not a scientific measure. */
  balanceScore: number;
}

export interface GenerateTeamsResult {
  teams: GeneratedTeam[];
  metrics: BalanceMetrics;
  /** Lower is better. Only comparable between runs with the same options. */
  penalty: number;
  /** Warnings the admin should see, e.g. too few goalkeepers. */
  warnings: string[];
}
