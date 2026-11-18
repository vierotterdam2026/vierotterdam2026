import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { GroupRow } from "@/types/database";
import { COMPLETABLE, selectFinished } from "./finished";
import { assertTransition } from "./state";

/**
 * Marks every played Sunday that is now over as completed, and returns their dates.
 *
 * Nobody here runs a live match day, so without this no Sunday ever reaches
 * "completed": attendance shows nobody as having played, and the check that stops
 * an organiser deleting a player who has played — which counts completed Sundays —
 * protects nobody.
 *
 * It also freezes the venue as it was, which entering match day normally does, so
 * renaming a venue later cannot rewrite where an old game was played.
 *
 * Safe to run repeatedly, and to catch up after missed days: only Sundays still
 * in a played state are touched, and the update re-checks that state.
 */
export async function completeFinishedSundays(group: GroupRow, now: Date = new Date()): Promise<string[]> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("sessions")
    .select(
      "id, date, status, location_notes, venue_name_snapshot, venue_address_snapshot, venue_notes_snapshot, venue:venues(name, address, notes)",
    )
    .eq("group_id", group.id)
    .in("status", COMPLETABLE);

  if (error) throw error;

  const finished = selectFinished(data ?? [], now);
  const completed: string[] = [];

  for (const session of finished) {
    // The state machine decides what is allowed, rather than this job.
    assertTransition(session.status, "completed");

    const venue = session.venue as unknown as { name: string; address: string | null; notes: string | null } | null;

    const { data: updated, error: updateError } = await db
      .from("sessions")
      .update({
        status: "completed",
        venue_name_snapshot: session.venue_name_snapshot ?? venue?.name ?? null,
        venue_address_snapshot: session.venue_address_snapshot ?? venue?.address ?? null,
        venue_notes_snapshot: session.venue_notes_snapshot ?? session.location_notes ?? venue?.notes ?? null,
      })
      .eq("id", session.id)
      // If an organiser moved it a moment ago, this finds nothing rather than
      // overwriting their change.
      .eq("status", session.status)
      .select("date");

    if (updateError) throw updateError;
    if (updated && updated.length > 0) completed.push(session.date);
  }

  return completed.sort();
}
