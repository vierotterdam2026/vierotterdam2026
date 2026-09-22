import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { GeneratorPlayer } from "@/lib/teams/types";
import type { PositionCode } from "@/lib/teams/positions";
import { selectUpcoming, UPCOMING_LIMIT, upcomingWindow } from "@/lib/sessions/upcoming";
import type { SessionRow, SignupStatus, VenueRow } from "@/types/database";

export interface AttendanceSummary {
  confirmed: number;
  maybe: number;
  declined: number;
  noResponse: number;
  invited: number;
}

export interface SessionWithVenue extends SessionRow {
  venue: Pick<VenueRow, "id" | "name" | "address" | "maps_url" | "notes"> | null;
}

const VENUE_FIELDS = "id, name, address, maps_url, notes";

/** The Sunday everyone is looking at: the next one that has not finished. */
export async function getCurrentSession(groupId: string): Promise<SessionWithVenue | null> {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: upcoming } = await db
    .from("sessions")
    .select(`*, venue:venues(${VENUE_FIELDS})`)
    .eq("group_id", groupId)
    .gte("date", today)
    .not("status", "in", "(completed,cancelled)")
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (upcoming) return upcoming as unknown as SessionWithVenue;

  // Nothing scheduled: fall back to the most recent Sunday so the app is never blank.
  const { data: latest } = await db
    .from("sessions")
    .select(`*, venue:venues(${VENUE_FIELDS})`)
    .eq("group_id", groupId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (latest as unknown as SessionWithVenue) ?? null;
}

export async function getSession(sessionId: string): Promise<SessionWithVenue | null> {
  const { data } = await supabaseAdmin()
    .from("sessions")
    .select(`*, venue:venues(${VENUE_FIELDS})`)
    .eq("id", sessionId)
    .maybeSingle();
  return (data as unknown as SessionWithVenue) ?? null;
}

export async function listSessions(groupId: string, limit = 30): Promise<SessionRow[]> {
  const { data } = await supabaseAdmin()
    .from("sessions")
    .select("*")
    .eq("group_id", groupId)
    .order("date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export interface SignupEntry {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  status: SignupStatus;
}

export async function listSignups(sessionId: string): Promise<SignupEntry[]> {
  const { data } = await supabaseAdmin()
    .from("signups")
    .select("status, player:players!inner(id, name, avatar_url)")
    .eq("session_id", sessionId);

  return (data ?? [])
    .map((row) => {
      const player = row.player as unknown as { id: string; name: string; avatar_url: string | null };
      return {
        playerId: player.id,
        name: player.name,
        avatarUrl: player.avatar_url,
        status: row.status as SignupStatus,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAttendanceSummary(
  sessionId: string,
  groupId: string,
): Promise<AttendanceSummary> {
  const db = supabaseAdmin();

  const [{ data: signups }, { count: invited }] = await Promise.all([
    db.from("signups").select("status").eq("session_id", sessionId),
    db
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("is_active", true),
  ]);

  const counts = { confirmed: 0, maybe: 0, declined: 0 };
  for (const row of signups ?? []) counts[row.status as keyof typeof counts] += 1;

  const total = invited ?? 0;
  return {
    ...counts,
    invited: total,
    noResponse: Math.max(0, total - counts.confirmed - counts.maybe - counts.declined),
  };
}

export async function getMySignup(sessionId: string, playerId: string): Promise<SignupStatus | null> {
  const { data } = await supabaseAdmin()
    .from("signups")
    .select("status")
    .eq("session_id", sessionId)
    .eq("player_id", playerId)
    .maybeSingle();
  return (data?.status as SignupStatus) ?? null;
}

/** Confirmed players shaped for the balancing engine, ratings included. */
export async function getConfirmedPlayersForGeneration(sessionId: string): Promise<GeneratorPlayer[]> {
  const db = supabaseAdmin();

  const { data: signups } = await db
    .from("signups")
    .select("player_id, player:players!inner(id, name, is_active)")
    .eq("session_id", sessionId)
    .eq("status", "confirmed");

  const players = (signups ?? [])
    .map((s) => s.player as unknown as { id: string; name: string; is_active: boolean })
    .filter((p) => p.is_active);

  if (players.length === 0) return [];

  const { data: positions } = await db
    .from("player_positions")
    .select("player_id, position, preference_rank, effective_rating")
    .in("player_id", players.map((p) => p.id));

  const byPlayer = new Map<string, { position: PositionCode; preferenceRank: number; rating: number }[]>();
  for (const row of positions ?? []) {
    const list = byPlayer.get(row.player_id) ?? [];
    list.push({
      position: row.position,
      preferenceRank: row.preference_rank,
      rating: Number(row.effective_rating),
    });
    byPlayer.set(row.player_id, list);
  }

  const { data: attributes } = await db
    .from("player_attributes")
    .select("player_id, pace, shooting, passing, dribbling, defending, physical")
    .in("player_id", players.map((p) => p.id));
  const attributesByPlayer = new Map(
    (attributes ?? []).map(({ player_id, ...rest }) => [player_id, rest]),
  );

  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      positions: byPlayer.get(p.id) ?? [],
      attributes: attributesByPlayer.get(p.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface Participant {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  status: SignupStatus;
}

export interface UpcomingSession {
  session: SessionWithVenue;
  summary: AttendanceSummary;
  mySignup: SignupStatus | null;
  /** Everyone who has said yes or maybe, so players can see who is coming. */
  participants: Participant[];
}

/** Active members, so the browser can rebuild the lists when realtime fires. */
export interface RosterEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The Sundays a player can answer for: the next few inside the four-week window,
 * each with its own counts and the player's own answer (spec: one list, one tap).
 */
export async function listUpcomingSessions(
  groupId: string,
  playerId: string,
  limit = UPCOMING_LIMIT,
): Promise<UpcomingSession[]> {
  const db = supabaseAdmin();
  const { from, to } = upcomingWindow();

  const { data } = await db
    .from("sessions")
    .select(`*, venue:venues(${VENUE_FIELDS})`)
    .eq("group_id", groupId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  const sessions = selectUpcoming((data ?? []) as unknown as SessionWithVenue[], new Date(), { limit });
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);

  const [{ data: signups }, { data: members }] = await Promise.all([
    db.from("signups").select("session_id, player_id, status").in("session_id", ids),
    db
      .from("group_members")
      .select("player:players!inner(id, name, avatar_url, is_active)")
      .eq("group_id", groupId)
      .eq("is_active", true),
  ]);

  const roster = new Map<string, RosterEntry>();
  for (const row of members ?? []) {
    const player = row.player as unknown as { id: string; name: string; avatar_url: string | null; is_active: boolean };
    if (player.is_active) roster.set(player.id, { id: player.id, name: player.name, avatarUrl: player.avatar_url });
  }

  const counts = new Map<string, { confirmed: number; maybe: number; declined: number }>();
  const mine = new Map<string, SignupStatus>();
  const bySession = new Map<string, Participant[]>();

  for (const row of signups ?? []) {
    const tally = counts.get(row.session_id) ?? { confirmed: 0, maybe: 0, declined: 0 };
    tally[row.status as keyof typeof tally] += 1;
    counts.set(row.session_id, tally);

    if (row.player_id === playerId) mine.set(row.session_id, row.status as SignupStatus);

    const player = roster.get(row.player_id);
    if (player && row.status !== "declined") {
      const list = bySession.get(row.session_id) ?? [];
      list.push({
        playerId: player.id,
        name: player.name,
        avatarUrl: player.avatarUrl,
        status: row.status as SignupStatus,
      });
      bySession.set(row.session_id, list);
    }
  }

  const total = roster.size;

  return sessions.map((session) => {
    const tally = counts.get(session.id) ?? { confirmed: 0, maybe: 0, declined: 0 };
    return {
      session,
      summary: {
        ...tally,
        invited: total,
        noResponse: Math.max(0, total - tally.confirmed - tally.maybe - tally.declined),
      },
      mySignup: mine.get(session.id) ?? null,
      participants: (bySession.get(session.id) ?? []).sort(byStatusThenName),
    };
  });
}

/** Confirmed first, then maybes, each alphabetical. */
function byStatusThenName(a: Participant, b: Participant): number {
  if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** The directory the browser needs to rebuild participant lists on a realtime event. */
export async function listRoster(groupId: string): Promise<RosterEntry[]> {
  const { data } = await supabaseAdmin()
    .from("group_members")
    .select("player:players!inner(id, name, avatar_url, is_active)")
    .eq("group_id", groupId)
    .eq("is_active", true);

  return (data ?? [])
    .map((row) => row.player as unknown as { id: string; name: string; avatar_url: string | null; is_active: boolean })
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatar_url }));
}

export interface AttendanceCell {
  status: SignupStatus | null;
}

export interface AttendanceMatrix {
  sessions: { id: string; date: string; status: SessionRow["status"] }[];
  players: {
    id: string;
    name: string;
    cells: Record<string, SignupStatus | null>;
    played: number;
  }[];
}

/**
 * Who answered what, across recent Sundays. `played` counts only Sundays that
 * actually happened, so a future "yes" does not inflate anyone's record.
 */
export async function getAttendanceMatrix(groupId: string, limit = 10): Promise<AttendanceMatrix> {
  const db = supabaseAdmin();

  const { data: sessionRows } = await db
    .from("sessions")
    .select("id, date, status")
    .eq("group_id", groupId)
    .neq("status", "draft")
    .order("date", { ascending: false })
    .limit(limit);

  const sessions = (sessionRows ?? []).slice().reverse();
  if (sessions.length === 0) return { sessions: [], players: [] };

  const [{ data: members }, { data: signups }] = await Promise.all([
    db
      .from("group_members")
      .select("player:players!inner(id, name, is_active)")
      .eq("group_id", groupId)
      .eq("is_active", true),
    db.from("signups").select("session_id, player_id, status").in("session_id", sessions.map((s) => s.id)),
  ]);

  const byPlayer = new Map<string, Record<string, SignupStatus>>();
  for (const row of signups ?? []) {
    const cells = byPlayer.get(row.player_id) ?? {};
    cells[row.session_id] = row.status as SignupStatus;
    byPlayer.set(row.player_id, cells);
  }

  const completed = new Set(sessions.filter((s) => s.status === "completed").map((s) => s.id));

  const players = (members ?? [])
    .map((m) => m.player as unknown as { id: string; name: string })
    .map((player) => {
      const cells = byPlayer.get(player.id) ?? {};
      return {
        id: player.id,
        name: player.name,
        cells: Object.fromEntries(sessions.map((s) => [s.id, cells[s.id] ?? null])),
        played: sessions.filter((s) => completed.has(s.id) && cells[s.id] === "confirmed").length,
      };
    })
    .sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));

  return { sessions, players };
}

export interface SessionDetail {
  session: SessionWithVenue;
  summary: AttendanceSummary;
  mySignup: SignupStatus | null;
  confirmed: Participant[];
  maybe: Participant[];
  declined: Participant[];
  /** Active members who have not answered at all. */
  noResponse: RosterEntry[];
}

/** Everything about one Sunday, including who has not replied. */
export async function getSessionDetail(
  sessionId: string,
  groupId: string,
  playerId: string,
): Promise<SessionDetail | null> {
  const session = await getSession(sessionId);
  if (!session || session.group_id !== groupId) return null;

  const db = supabaseAdmin();
  const [{ data: signups }, roster] = await Promise.all([
    db.from("signups").select("player_id, status").eq("session_id", sessionId),
    listRoster(groupId),
  ]);

  const byId = new Map(roster.map((p) => [p.id, p]));
  const answered = new Map<string, SignupStatus>();
  for (const row of signups ?? []) answered.set(row.player_id, row.status as SignupStatus);

  const group = (status: SignupStatus): Participant[] =>
    [...answered.entries()]
      .filter(([, value]) => value === status)
      .map(([id]) => byId.get(id))
      .filter((p): p is RosterEntry => Boolean(p))
      .map((p) => ({ playerId: p.id, name: p.name, avatarUrl: p.avatarUrl, status }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const confirmed = group("confirmed");
  const maybe = group("maybe");
  const declined = group("declined");
  const noResponse = roster
    .filter((p) => !answered.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    session,
    summary: {
      confirmed: confirmed.length,
      maybe: maybe.length,
      declined: declined.length,
      invited: roster.length,
      noResponse: noResponse.length,
    },
    mySignup: answered.get(playerId) ?? null,
    confirmed,
    maybe,
    declined,
    noResponse,
  };
}

/**
 * Confirmed players who are not on any team — people who signed up after the
 * teams were picked, waiting for the organiser to place them.
 */
export async function listUnassignedConfirmed(sessionId: string): Promise<Participant[]> {
  const db = supabaseAdmin();

  const [{ data: signups }, { data: placed }] = await Promise.all([
    db
      .from("signups")
      .select("player:players!inner(id, name, avatar_url, is_active)")
      .eq("session_id", sessionId)
      .eq("status", "confirmed"),
    db.from("team_members").select("player_id").eq("session_id", sessionId),
  ]);

  const assigned = new Set((placed ?? []).map((row) => row.player_id));

  return (signups ?? [])
    .map((row) => row.player as unknown as { id: string; name: string; avatar_url: string | null; is_active: boolean })
    .filter((p) => p.is_active && !assigned.has(p.id))
    .map((p) => ({ playerId: p.id, name: p.name, avatarUrl: p.avatar_url, status: "confirmed" as const }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
