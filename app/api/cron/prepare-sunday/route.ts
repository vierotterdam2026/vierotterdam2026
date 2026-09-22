import { NextResponse, type NextRequest } from "next/server";
import { getGroup } from "@/lib/data/groups";
import { getTeams } from "@/lib/data/teams";
import { prepareTeamsForSession } from "@/lib/teams/prepare";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SessionStatus } from "@/lib/sessions/state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How far ahead of the reveal the job is willing to pick teams. */
const LOOKAHEAD_HOURS = 18;

/** Statuses where picking teams is still the right thing to do. */
const PREPARABLE: SessionStatus[] = ["draft", "signup_open", "signup_closed", "teams_generated"];

/**
 * Picks and publishes teams for any Sunday whose reveal is due.
 *
 * Runs once a day — the most a Hobby plan allows — which is enough because the
 * reveal time, not this job, decides when players see the teams. The job does
 * the work in the afternoon; `teams_reveal_at` keeps them hidden until Saturday
 * 21:00.
 *
 * Safe to run repeatedly: a Sunday that already has teams is skipped.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = request.headers.get("authorization");
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  const group = await getGroup();
  if (!group) return NextResponse.json({ error: "No group configured" }, { status: 500 });

  const db = supabaseAdmin();
  const horizon = new Date(Date.now() + LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const { data: sessions, error } = await db
    .from("sessions")
    .select("id, date, status, teams_reveal_at")
    .eq("group_id", group.id)
    .gte("date", today)
    .not("teams_reveal_at", "is", null)
    .lte("teams_reveal_at", horizon)
    .in("status", PREPARABLE)
    .order("date");

  if (error) {
    console.error("[cron] could not list sessions", error);
    return NextResponse.json({ error: "Could not list sessions" }, { status: 500 });
  }

  const handled: Record<string, string>[] = [];

  for (const session of sessions ?? []) {
    // Somebody may have picked teams by hand already; leave those alone.
    const existing = await getTeams(session.id, false);
    if (existing.length > 0) {
      handled.push({ date: session.date, outcome: "skipped: teams already exist" });
      continue;
    }

    try {
      const { result, teamCount } = await prepareTeamsForSession(session.id, {
        publish: true,
        colours: group.team_colours,
      });

      handled.push({
        date: session.date,
        outcome: `picked ${teamCount} teams, balance ${result.metrics.balanceScore}/100`,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(`[cron] ${session.date}: ${message}`);
      handled.push({ date: session.date, outcome: `skipped: ${message}` });
    }
  }

  return NextResponse.json({ ran: new Date().toISOString(), sessions: handled });
}
