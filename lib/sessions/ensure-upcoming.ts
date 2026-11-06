import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { GroupRow } from "@/types/database";
import { buildSundayRows } from "./sunday-rows";
import { missingUpcomingSundays, upcomingWindow } from "./upcoming";

/**
 * Makes sure the Sundays players can see actually exist, creating any that are
 * missing from the group's defaults. Returns the dates it created, oldest first.
 *
 * Used by the admin button and by the daily job, so the list rolls on by itself:
 * once a game has moved to the Feed, its replacement is added the same afternoon.
 *
 * Safe to run twice at once. The unique (group, date) constraint turns a lost
 * race into a no-op rather than a duplicate or an error.
 */
export async function ensureUpcomingSundays(group: GroupRow, createdBy: string | null = null): Promise<string[]> {
  const db = supabaseAdmin();

  const { data: existing, error: readError } = await db
    .from("sessions")
    .select("date")
    .eq("group_id", group.id)
    .gte("date", upcomingWindow().from);

  if (readError) throw readError;

  const dates = missingUpcomingSundays((existing ?? []).map((row) => row.date));
  if (dates.length === 0) return [];

  const { data: created, error: writeError } = await db
    .from("sessions")
    .upsert(buildSundayRows(dates, group, createdBy), { onConflict: "group_id,date", ignoreDuplicates: true })
    .select("date");

  if (writeError) throw writeError;

  return (created ?? []).map((row) => row.date).sort();
}
