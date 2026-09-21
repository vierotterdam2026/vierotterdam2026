import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildLeaderboard, type LeaderboardRow } from "@/lib/feed/leaderboard";
import { picksRevealed, type Pick as Choice } from "@/lib/feed/fixture-state";
import { rankTotals, type StatTotal } from "@/lib/feed/top-stats";
import { selectPast, upcomingWindow } from "@/lib/sessions/upcoming";
import type { SessionStatus } from "@/lib/sessions/state";
import type { FixtureRow, PlayerStatAdjustmentRow } from "@/types/database";

/** Only what the Feed shows. No ratings, positions or contact details. */
export type FeedFixture = Pick<FixtureRow, "id" | "home_team" | "away_team" | "competition" | "kickoff_at" | "status" | "home_goals" | "away_goals">;

export interface FixtureWithPicks extends FeedFixture {
  myPick: Choice | null;
  /** Null until kickoff: nobody can copy a pick that is still open. */
  revealed: { name: string; pick: Choice }[] | null;
}

/** A Sunday that has gone by. Only a count of confirmed players: no names, no ratings. */
export interface PastSunday {
  id: string;
  date: string;
  status: SessionStatus;
  confirmed: number;
}

export interface FeedData {
  pastSundays: PastSunday[];
  topScorers: StatTotal[];
  topAssists: StatTotal[];
  upcoming: FixtureWithPicks[];
  results: FixtureWithPicks[];
  leaderboard: LeaderboardRow[];
}

const FIXTURE_COLUMNS = "id, home_team, away_team, competition, kickoff_at, status, home_goals, away_goals";

async function activePlayers(groupId: string) {
  const { data } = await supabaseAdmin()
    .from("group_members")
    .select("player:players!inner(id, name, avatar_url, is_active)")
    .eq("group_id", groupId)
    .eq("is_active", true);

  return (data ?? [])
    .map((row) => row.player as unknown as { id: string; name: string; avatar_url: string | null; is_active: boolean })
    .filter((p) => p?.is_active)
    .map(({ id, name, avatar_url }) => ({ id, name, avatar_url }));
}

export async function getStatTotals(groupId: string) {
  const db = supabaseAdmin();
  const [players, { data: events }, { data: adjustments }] = await Promise.all([
    activePlayers(groupId),
    db.from("match_events").select("player_id, assist_player_id").is("deleted_at", null),
    db
      .from("player_stat_adjustments")
      .select("player_id, stat, delta")
      .eq("group_id", groupId)
      .is("voided_at", null),
  ]);

  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string | null, by = 1) => {
    if (id) m.set(id, (m.get(id) ?? 0) + by);
  };
  for (const e of events ?? []) {
    bump(goals, e.player_id);
    bump(assists, e.assist_player_id);
  }
  const goalDeltas = new Map<string, number>();
  const assistDeltas = new Map<string, number>();
  for (const a of adjustments ?? []) bump(a.stat === "goal" ? goalDeltas : assistDeltas, a.player_id, a.delta);

  return {
    players,
    topScorers: rankTotals(players, goals, goalDeltas),
    topAssists: rankTotals(players, assists, assistDeltas),
    /** Full, unfiltered totals for the admin form. */
    totals: {
      goal: new Map(players.map((p) => [p.id, (goals.get(p.id) ?? 0) + (goalDeltas.get(p.id) ?? 0)])),
      assist: new Map(players.map((p) => [p.id, (assists.get(p.id) ?? 0) + (assistDeltas.get(p.id) ?? 0)])),
    },
  };
}

/** Every past Sunday, newest first, each with its confirmed-signup count. */
export async function listPastSundays(groupId: string): Promise<PastSunday[]> {
  const db = supabaseAdmin();
  const { from } = upcomingWindow();

  const { data } = await db
    .from("sessions")
    .select("id, date, status")
    .eq("group_id", groupId)
    .lt("date", from)
    .neq("status", "draft");

  const past = selectPast((data ?? []) as { id: string; date: string; status: SessionStatus }[]);
  if (past.length === 0) return [];

  const { data: signups } = await db
    .from("signups")
    .select("session_id")
    .eq("status", "confirmed")
    .in("session_id", past.map((s) => s.id));

  const confirmed = new Map<string, number>();
  for (const row of signups ?? []) confirmed.set(row.session_id, (confirmed.get(row.session_id) ?? 0) + 1);

  return past.map((s) => ({ ...s, confirmed: confirmed.get(s.id) ?? 0 }));
}

export async function getFeed(groupId: string, viewerId: string): Promise<FeedData> {
  const db = supabaseAdmin();
  const [stats, pastSundays, { data: fixtures }] = await Promise.all([
    getStatTotals(groupId),
    listPastSundays(groupId),
    db.from("fixtures").select(FIXTURE_COLUMNS).eq("group_id", groupId).order("kickoff_at", { ascending: true }),
  ]);

  const all = (fixtures ?? []) as FeedFixture[];
  const ids = all.map((f) => f.id);
  const { data: picks } = ids.length
    ? await db.from("fixture_predictions").select("fixture_id, player_id, pick").in("fixture_id", ids)
    : { data: [] };

  const names = new Map(stats.players.map((p) => [p.id, p.name]));
  const now = new Date();

  const withPicks = (f: FeedFixture): FixtureWithPicks => {
    const mine = (picks ?? []).find((p) => p.fixture_id === f.id && p.player_id === viewerId);
    const revealed = picksRevealed(f, now)
      ? (picks ?? [])
          .filter((p) => p.fixture_id === f.id && names.has(p.player_id))
          .map((p) => ({ name: names.get(p.player_id)!, pick: p.pick as Choice }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : null;
    return { ...f, myPick: (mine?.pick as Choice | undefined) ?? null, revealed };
  };

  return {
    pastSundays,
    topScorers: stats.topScorers,
    topAssists: stats.topAssists,
    upcoming: all.filter((f) => f.status === "scheduled" || f.status === "postponed").map(withPicks),
    results: all
      .filter((f) => f.status === "finished")
      .reverse()
      .slice(0, 10)
      .map(withPicks),
    leaderboard: buildLeaderboard(
      all,
      (picks ?? []).map((p) => ({ fixtureId: p.fixture_id, playerId: p.player_id, pick: p.pick as Choice })),
      names,
    ),
  };
}

export async function getFixture(id: string): Promise<FixtureRow | null> {
  const { data } = await supabaseAdmin().from("fixtures").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function listAdjustments(groupId: string, limit = 20) {
  const { data } = await supabaseAdmin()
    .from("player_stat_adjustments")
    .select("id, player:players(name), stat, delta, reason, created_at, voided_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as (Pick<PlayerStatAdjustmentRow, "id" | "stat" | "delta" | "reason" | "created_at" | "voided_at"> & {
    player: { name: string } | null;
  })[];
}
