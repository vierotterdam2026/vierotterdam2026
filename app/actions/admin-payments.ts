"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { formatEuro } from "@/lib/payments/money";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { paymentRequestSchema, shareStatusSchema } from "@/lib/validation/schemas";
import { toActionState, type ActionState } from "@/lib/actions/result";

function refresh(requestId?: string) {
  revalidatePath("/notifications");
  revalidatePath("/admin/payments");
  if (requestId) revalidatePath(`/admin/payments/${requestId}`);
}

/** Every action below authorises as an admin (Supabase Auth, not a PIN) first. */

export async function createPaymentRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const input = paymentRequestSchema.parse({
      title: String(formData.get("title") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      paymentUrl: String(formData.get("paymentUrl") ?? ""),
      expiresOn: String(formData.get("expiresOn") ?? ""),
      sessionId: String(formData.get("sessionId") ?? ""),
      playerIds: formData.getAll("playerId").map(String),
    });

    const db = supabaseAdmin();
    const playerIds = [...new Set(input.playerIds)];

    if (input.sessionId) {
      const { data: session } = await db
        .from("sessions")
        .select("group_id")
        .eq("id", input.sessionId)
        .maybeSingle();
      if (!session || session.group_id !== admin.groupId) {
        return { ok: false, error: "That Sunday no longer exists." };
      }
    }

    // Everyone asked to pay must be an active member of this group. The whole
    // roster is read rather than filtered in the query: a long list of ids would
    // overflow the request URL.
    const { data: members } = await db
      .from("group_members")
      .select("player_id")
      .eq("group_id", admin.groupId)
      .eq("is_active", true);
    const active = new Set((members ?? []).map((m) => m.player_id));
    if (playerIds.some((id) => !active.has(id))) {
      return { ok: false, error: "Some of those players are no longer in the group. Reload the page and try again." };
    }

    // The same link twice is a double-click or a repeat, not a second request.
    const { data: same } = await db
      .from("payment_requests")
      .select("id")
      .eq("group_id", admin.groupId)
      .eq("payment_url", input.paymentUrl)
      .is("closed_at", null)
      .maybeSingle();
    if (same) {
      return { ok: false, error: "There is already an open request with that link. Close it first, or use a new link." };
    }

    const { data: request, error: requestError } = await db
      .from("payment_requests")
      .insert({
        group_id: admin.groupId,
        session_id: input.sessionId || null,
        title: input.title,
        amount_cents: input.amount,
        payment_url: input.paymentUrl,
        expires_on: input.expiresOn || null,
        created_by: admin.player.id,
      })
      .select("id")
      .single();
    if (requestError || !request) throw requestError ?? new Error("Could not create the request.");

    const { error: sharesError } = await db
      .from("payment_shares")
      .insert(playerIds.map((playerId) => ({ request_id: request.id, player_id: playerId })));

    if (sharesError) {
      // No transaction across two inserts, so undo the first rather than leave a
      // request nobody was asked to pay.
      await db.from("payment_requests").delete().eq("id", request.id);
      throw sharesError;
    }

    refresh(request.id);
    return {
      ok: true,
      message: `Asked ${playerIds.length} ${playerIds.length === 1 ? "player" : "players"} for ${formatEuro(input.amount)} each. It is in their notifications now.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

/** Mark one person paid, unpaid or waived — the organiser's word is final. */
export async function setShareStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const shareId = String(formData.get("shareId") ?? "");
    const to = shareStatusSchema.parse(String(formData.get("to") ?? ""));

    const db = supabaseAdmin();
    const { data: share } = await db
      .from("payment_shares")
      .select("id, request_id, request:payment_requests!inner(group_id)")
      .eq("id", shareId)
      .maybeSingle();

    const groupId = (share?.request as unknown as { group_id: string } | undefined)?.group_id;
    if (!share || groupId !== admin.groupId) return { ok: false, error: "That payment no longer exists." };

    const { error } = await db
      .from("payment_shares")
      .update({
        status: to,
        paid_at: to === "paid" ? new Date().toISOString() : null,
        // An organiser marking it is what turns a claim into a confirmation.
        marked_by: admin.player.id,
      })
      .eq("id", shareId);
    if (error) throw error;

    refresh(share.request_id);
    return { ok: true };
  } catch (error) {
    return toActionState(error);
  }
}

/** Closing hides it from players; reopening brings it back. Nothing is deleted. */
export async function setRequestClosedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const requestId = String(formData.get("requestId") ?? "");
    const closed = String(formData.get("closed") ?? "") === "true";

    const { data: updated, error } = await supabaseAdmin()
      .from("payment_requests")
      .update({ closed_at: closed ? new Date().toISOString() : null })
      .eq("id", requestId)
      .eq("group_id", admin.groupId)
      .select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) return { ok: false, error: "That request no longer exists." };

    refresh(requestId);
    return { ok: true, message: closed ? "Closed. Players no longer see it." : "Reopened." };
  } catch (error) {
    return toActionState(error);
  }
}
