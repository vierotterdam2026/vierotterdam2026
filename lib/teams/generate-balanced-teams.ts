import { ATTRIBUTE_KEYS } from "@/lib/players/attributes";
import { evaluateTeam, preparePlayers, round2, type PreparedPlayer, type TeamStats } from "./evaluate";
import { computeTeamSizes } from "./team-sizes";
import type {
  BalanceMetrics,
  GeneratedTeam,
  GenerateTeamsOptions,
  GenerateTeamsResult,
  GeneratorPlayer,
} from "./types";

/**
 * Objective weights (spec §11). Each component is normalised to roughly the same
 * scale first, so these read as relative importance: one team left without a
 * goalkeeper costs about as much as a 0.5 spread in team average rating.
 */
const WEIGHTS = {
  ability: 4,
  /** Spread of each attribute across teams, so no side gets all the pace and none of the defending. */
  attributes: 2,
  goalkeeper: 10,
  shape: 6,
  preference: 3,
  /** Only used when regenerating: pressure to differ from the last arrangement. */
  novelty: 8,
} as const;

const DEFAULT_RESTARTS = 120;
const ABILITY_SCALE = 5;

/** Small, fast, seedable PRNG so a generation can be reproduced exactly. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Arrangement {
  /** Team index for each player, indexed the same way as `players`. */
  assignment: number[];
  members: number[][];
  stats: TeamStats[];
  penalty: number;
}

/**
 * Splits confirmed players into balanced teams.
 *
 * Pure: no database, no React, no side effects beyond the RNG it owns. The caller
 * persists the result (spec §81).
 */
export function generateBalancedTeams(
  players: GeneratorPlayer[],
  teamCount: number,
  options: GenerateTeamsOptions = {},
): GenerateTeamsResult {
  assertGeneratable(players, teamCount);

  const {
    balanceAbility = true,
    balancePositions = true,
    respectPreferences = true,
    balanceGoalkeepers = true,
    seed = Math.floor(Math.random() * 2 ** 31),
    restarts = DEFAULT_RESTARTS,
    previousAssignment,
    minimumChangeRatio = 0.25,
  } = options;

  const prepared = preparePlayers(players);
  const sizes = computeTeamSizes(prepared.length, teamCount);
  const random = mulberry32(seed);

  const weights = {
    ability: balanceAbility ? WEIGHTS.ability : 0,
    attributes: balanceAbility ? WEIGHTS.attributes : 0,
    goalkeeper: balanceGoalkeepers ? WEIGHTS.goalkeeper : 0,
    shape: balancePositions ? WEIGHTS.shape : 0,
    preference: respectPreferences ? WEIGHTS.preference : 0,
  };

  const goalkeeperCapable = prepared.filter((p) => p.goalkeeperRating !== null);
  // Shortfall nothing can fix — excluded from the score so the admin is not told
  // an arrangement is poor when there simply are not enough keepers.
  const unavoidableKeeperGap = Math.max(0, teamCount - goalkeeperCapable.length);

  const previousByIndex = previousAssignment
    ? prepared.map((p) => previousAssignment[p.id] ?? -1)
    : null;

  const score = (members: number[][], stats: TeamStats[]) =>
    penaltyOf(members, stats, {
      weights,
      unavoidableKeeperGap,
      previousByIndex,
      minimumChangeRatio,
      playerCount: prepared.length,
    });

  let best: Arrangement | null = null;

  for (let restart = 0; restart < restarts; restart++) {
    const candidate = buildCandidate(prepared, sizes, random, goalkeeperCapable);
    const arrangement = optimise(candidate, prepared, score);
    if (!best || arrangement.penalty < best.penalty) best = arrangement;
  }

  const winner = best!;
  const teams: GeneratedTeam[] = winner.stats.map((stat, index) => ({
    index,
    players: stat.assignments,
    totalRating: stat.totalRating,
    averageRating: stat.averageRating,
    hasGoalkeeper: stat.hasGoalkeeper,
  }));

  return {
    teams,
    metrics: metricsOf(winner.stats, prepared.length, goalkeeperCapable.length, unavoidableKeeperGap),
    penalty: round2(winner.penalty),
    warnings: warningsFor(prepared, teamCount, goalkeeperCapable.length, sizes),
  };
}

function assertGeneratable(players: GeneratorPlayer[], teamCount: number): void {
  if (players.length === 0) {
    throw new Error("Teams cannot be generated because there are no confirmed players.");
  }
  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new Error("Choose at least two teams.");
  }
  if (players.length < teamCount * 2) {
    throw new Error(
      `There are only ${players.length} confirmed players, which is not enough for ${teamCount} teams.`,
    );
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) {
    throw new Error("The same player appears twice in the confirmed list.");
  }
}

/**
 * A quick, sensible starting point: spread the keepers out first, then snake-draft
 * everybody else strongest-first with a little jitter so restarts differ.
 */
function buildCandidate(
  players: PreparedPlayer[],
  sizes: number[],
  random: () => number,
  goalkeeperCapable: PreparedPlayer[],
): number[][] {
  const members: number[][] = sizes.map(() => []);
  const indexOf = new Map(players.map((p, i) => [p.id, i]));
  const taken = new Set<number>();

  const teamOrder = shuffle(
    sizes.map((_, i) => i),
    random,
  );

  const keepers = [...goalkeeperCapable]
    .sort((a, b) => b.goalkeeperRating! - a.goalkeeperRating! + (random() - 0.5))
    .slice(0, sizes.length);

  keepers.forEach((keeper, i) => {
    const team = teamOrder[i];
    const index = indexOf.get(keeper.id)!;
    members[team].push(index);
    taken.add(index);
  });

  const rest = players
    .map((player, index) => ({ index, key: player.bestRating + (random() - 0.5) * 1.5 }))
    .filter((entry) => !taken.has(entry.index))
    .sort((a, b) => b.key - a.key);

  // Snake draft: team order reverses each round so the first pick does not
  // compound into the strongest team.
  let pointer = 0;
  let round = 0;
  while (pointer < rest.length) {
    const order = round % 2 === 0 ? teamOrder : [...teamOrder].reverse();
    let placedThisRound = false;
    for (const team of order) {
      if (pointer >= rest.length) break;
      if (members[team].length >= sizes[team]) continue;
      members[team].push(rest[pointer++].index);
      placedThisRound = true;
    }
    if (!placedThisRound) break;
    round += 1;
  }

  return members;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Hill climbing: keep swapping pairs of players while it makes things better. */
function optimise(
  members: number[][],
  players: PreparedPlayer[],
  score: (members: number[][], stats: TeamStats[]) => number,
): Arrangement {
  const stats = members.map((team) => evaluateTeam(team.map((i) => players[i])));
  let penalty = score(members, stats);

  let improved = true;
  let passes = 0;
  while (improved && passes < 40) {
    improved = false;
    passes += 1;

    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        for (let i = 0; i < members[a].length; i++) {
          for (let j = 0; j < members[b].length; j++) {
            const playerA = members[a][i];
            const playerB = members[b][j];

            members[a][i] = playerB;
            members[b][j] = playerA;

            const statsA = evaluateTeam(members[a].map((k) => players[k]));
            const statsB = evaluateTeam(members[b].map((k) => players[k]));
            const trial = stats.slice();
            trial[a] = statsA;
            trial[b] = statsB;
            const trialPenalty = score(members, trial);

            if (trialPenalty < penalty - 1e-9) {
              stats[a] = statsA;
              stats[b] = statsB;
              penalty = trialPenalty;
              improved = true;
            } else {
              members[a][i] = playerA;
              members[b][j] = playerB;
            }
          }
        }
      }
    }
  }

  const assignment = new Array<number>(players.length).fill(-1);
  members.forEach((team, teamIndex) => {
    for (const playerIndex of team) assignment[playerIndex] = teamIndex;
  });

  return { assignment, members, stats, penalty };
}

interface PenaltyContext {
  weights: { ability: number; attributes: number; goalkeeper: number; shape: number; preference: number };
  unavoidableKeeperGap: number;
  previousByIndex: number[] | null;
  minimumChangeRatio: number;
  playerCount: number;
}

function penaltyOf(members: number[][], stats: TeamStats[], ctx: PenaltyContext): number {
  const averages = stats.map((s) => s.averageRating);
  const abilityComponent = standardDeviation(averages) * ABILITY_SCALE;

  const attributeComponent = attributeImbalanceOf(stats);

  const teamsWithoutKeeper = stats.filter((s) => !s.hasGoalkeeper).length;
  const keeperComponent = Math.max(0, teamsWithoutKeeper - ctx.unavoidableKeeperGap);

  const shapeComponent = mean(stats.map((s) => s.positionalImbalance));

  const totalPreference = stats.reduce((sum, s) => sum + s.preferencePenaltySum, 0);
  const preferenceComponent = ctx.playerCount ? totalPreference / ctx.playerCount : 0;

  let penalty =
    ctx.weights.ability * abilityComponent +
    ctx.weights.attributes * attributeComponent +
    ctx.weights.goalkeeper * keeperComponent +
    ctx.weights.shape * shapeComponent +
    ctx.weights.preference * preferenceComponent;

  if (ctx.previousByIndex) {
    let moved = 0;
    members.forEach((team, teamIndex) => {
      for (const playerIndex of team) {
        if (ctx.previousByIndex![playerIndex] !== teamIndex) moved += 1;
      }
    });
    const changeRatio = ctx.playerCount ? moved / ctx.playerCount : 1;
    const shortfall = Math.max(0, ctx.minimumChangeRatio - changeRatio);
    penalty += WEIGHTS.novelty * shortfall * 10;
  }

  return penalty;
}

function metricsOf(
  stats: TeamStats[],
  playerCount: number,
  goalkeeperCapableCount: number,
  unavoidableKeeperGap: number,
): BalanceMetrics {
  const averages = stats.map((s) => s.averageRating);
  const teamsWithoutGoalkeeper = stats.filter((s) => !s.hasGoalkeeper).length;
  const avoidable = Math.max(0, teamsWithoutGoalkeeper - unavoidableKeeperGap);
  const positionalImbalance = mean(stats.map((s) => s.positionalImbalance));
  const attributeImbalance = attributeImbalanceOf(stats);
  const preferencePenalty = playerCount
    ? stats.reduce((sum, s) => sum + s.preferencePenaltySum, 0) / playerCount
    : 0;

  // An indicator for the admin, not a scientific measure (spec §12).
  const indicativePenalty =
    WEIGHTS.ability * standardDeviation(averages) * ABILITY_SCALE +
    WEIGHTS.attributes * attributeImbalance +
    WEIGHTS.goalkeeper * avoidable +
    WEIGHTS.shape * positionalImbalance +
    WEIGHTS.preference * preferencePenalty;

  return {
    averageRatingSpread: round2(Math.max(...averages) - Math.min(...averages)),
    ratingStandardDeviation: round2(standardDeviation(averages)),
    teamsWithoutGoalkeeper,
    avoidableTeamsWithoutGoalkeeper: avoidable,
    goalkeeperCapableCount,
    attributeImbalance: round2(attributeImbalance),
    positionalImbalance: round2(positionalImbalance),
    preferencePenalty: round2(preferencePenalty),
    firstChoiceCount: stats.reduce((sum, s) => sum + s.firstChoiceCount, 0),
    outsidePreferencesCount: stats.reduce((sum, s) => sum + s.outsidePreferencesCount, 0),
    balanceScore: Math.max(0, Math.min(100, Math.round(100 - indicativePenalty * 2.5))),
  };
}

function warningsFor(
  players: PreparedPlayer[],
  teamCount: number,
  goalkeeperCapableCount: number,
  sizes: number[],
): string[] {
  const warnings: string[] = [];

  if (goalkeeperCapableCount < teamCount) {
    warnings.push(
      `Only ${goalkeeperCapableCount} goalkeeper-capable ${
        goalkeeperCapableCount === 1 ? "player is" : "players are"
      } available for ${teamCount} teams. Some teams will need a stand-in keeper.`,
    );
  }

  const withoutPreferences = players.filter((p) => p.byPosition.size === 0).length;
  if (withoutPreferences > 0) {
    warnings.push(
      `${withoutPreferences} ${
        withoutPreferences === 1 ? "player has" : "players have"
      } no saved positions, so they were rated at a default 5.`,
    );
  }

  const withoutAttributes = players.filter((p) => !p.attributes).length;
  if (withoutAttributes > 0 && withoutAttributes < players.length) {
    warnings.push(
      `${withoutAttributes} ${
        withoutAttributes === 1 ? "player has" : "players have"
      } not set their FIFA-style ratings yet, so only their position ratings count for them.`,
    );
  }

  if (new Set(sizes).size > 1) {
    warnings.push(`Teams are uneven: ${sizes.join(" / ")}.`);
  }

  return warnings;
}

/**
 * Mean, over the six attributes, of how much the teams' averages differ, scaled
 * like the ability term (÷10 to the 1-10 scale, ×ABILITY_SCALE). Teams with no
 * rated players are skipped; with fewer than two comparable teams it is 0.
 */
function attributeImbalanceOf(stats: TeamStats[]): number {
  const rated = stats.filter((s) => s.attributeAverages !== null);
  if (rated.length < 2) return 0;
  const perAttribute = ATTRIBUTE_KEYS.map((key) => standardDeviation(rated.map((s) => s.attributeAverages![key])));
  return (mean(perAttribute) / 10) * ABILITY_SCALE;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}
