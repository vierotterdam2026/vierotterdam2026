"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { getSession } from "@/lib/data/sessions";
import { assertTransition, type SessionStatus } from "@/lib/sessions/state";
import { defaultTeamsRevealAt } from "@/lib/sessions/deadline";
import { ensureUpcomingSundays } from "@/lib/sessions/ensure-upcoming";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { localToUtcIso } from "@/lib/time/group-time";
import { sessionSchema, sessionStatusSchema, venueSchema } from "@/lib/validation/schemas";
import type { SessionRow, VenueRow } from "@/types/database";
import { toActionState, type ActionState } from "@/lib/actions/result";

export async function saveSessionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const group = await getGroup();
    if (!group) return { ok: false, error: "This football group has not been set up yet." };

    const sessionId = String(formData.get("sessionId") ?? "");
    const input = sessionSchema.parse({
      date: String(formData.get("date") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      venueId: String(formData.get("venueId") ?? "") || null,
      locationNotes: String(formData.get("locationNotes") ?? ""),
      note: String(formData.get("note") ?? ""),
      signupDeadline: String(formData.get("signupDeadline") ?? ""),
    });

    const payload = {
      group_id: group.id,
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      venue_id: input.venueId,
      location_notes: input.locationNotes || null,
      note: input.note || null,
      signup_deadline: localToUtcIso(input.signupDeadline, group.timezone),
      updated_by: admin.player.id,
    };

    const db = supabaseAdmin();

    if (sessionId) {
      const { error } = await db.from("sessions").update(payload).eq("id", sessionId);
      if (error) throw friendlier(error);
    } else {
      const { error } = await db
        .from("sessions")
        .insert({
          ...payload,
          status: "signup_open",
          teams_reveal_at: defaultTeamsRevealAt(input.date, group),
          created_by: admin.player.id,
        });
      if (error) throw friendlier(error);
    }

    revalidatePath("/admin");
    revalidatePath("/home");
    return { ok: true, message: sessionId ? "Sunday updated." : "Sunday created and signup is open." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function setSessionStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const sessionId = String(formData.get("sessionId") ?? "");
    const target = sessionStatusSchema.parse(String(formData.get("status") ?? ""));
    const reason = String(formData.get("reason") ?? "").trim();

    const session = await getSession(sessionId);
    if (!session) return { ok: false, error: "That Sunday no longer exists." };

    assertTransition(session.status, target);

    if (target === "cancelled" && !reason) {
      return { ok: false, error: "Tell the players why it is cancelled." };
    }

    const patch: Partial<SessionRow> = { status: target, updated_by: admin.player.id };

    if (target === "cancelled") patch.cancellation_reason = reason;

    // Freeze the venue details the moment the Sunday goes live (spec §58).
    if (target === "in_progress" && !session.venue_name_snapshot && session.venue) {
      patch.venue_name_snapshot = session.venue.name;
      patch.venue_address_snapshot = session.venue.address;
      patch.venue_notes_snapshot = session.location_notes ?? session.venue.notes;
    }

    const { error } = await supabaseAdmin().from("sessions").update(patch).eq("id", sessionId);
    if (error) throw error;

    revalidatePath("/admin");
    revalidatePath(`/admin/session/${sessionId}`);
    revalidatePath("/home");
    revalidatePath("/teams");
    return { ok: true, message: "Updated." };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * `createVenueAction` also hands the new row back, so a venue picker that is
 * already on screen can add it as an option and select it without a reload.
 */
export type VenueActionState = ActionState & { venue?: VenueRow };

export async function createVenueAction(
  _prev: VenueActionState,
  formData: FormData,
): Promise<VenueActionState> {
  try {
    await requireAdmin();
    const group = await getGroup();
    if (!group) return { ok: false, error: "This football group has not been set up yet." };

    const input = venueSchema.parse({
      name: String(formData.get("name") ?? ""),
      address: String(formData.get("address") ?? ""),
      mapsUrl: String(formData.get("mapsUrl") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });

    const { data, error } = await supabaseAdmin()
      .from("venues")
      .insert({
        group_id: group.id,
        name: input.name,
        address: input.address || null,
        maps_url: input.mapsUrl || null,
        notes: input.notes || null,
      })
      .select("*")
      .single();

    if (error) {
      throw error.code === "23505" ? new Error("There is already a venue with that name.") : error;
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    return { ok: true, message: "Venue saved.", venue: data };
  } catch (error) {
    return toActionState(error);
  }
}

function friendlier(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("There is already a Sunday on that date.");
  return new Error(error.message);
}

export type { SessionStatus };

/**
 * Creates any of the next four Sundays that do not exist yet, using the group's
 * default time, venue and deadline. Players can only answer for dates that
 * exist, so this keeps the list on their home screen full.
 */
export async function createUpcomingSundaysAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const group = await getGroup();
    if (!group) return { ok: false, error: "This football group has not been set up yet." };

    const dates = await ensureUpcomingSundays(group, admin.player.id);

    if (dates.length === 0) {
      return { ok: true, message: "The next four Sundays already exist." };
    }

    revalidatePath("/admin");
    revalidatePath("/home");

    return {
      ok: true,
      message: `Created ${dates.length} Sunday${dates.length === 1 ? "" : "s"}: ${dates.join(", ")}.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

