"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlayer } from "@/lib/auth/current-user";
import { playerMayChange } from "@/lib/payments/status";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toActionState, type ActionState } from "@/lib/actions/result";

const playerChoice = z.enum(["paid", "requested"]);

/**
 * A player saying "I've paid", or taking that back. It only ever touches their own
 * share, and only for as long as the organisers have not settled it: the app
 * cannot see a bank account, so this is a claim for an organiser to confirm.
 */
export async function setMyShareStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePlayer();
    const shareId = String(formData.get("shareId") ?? "");
    const to = playerChoice.parse(String(formData.get("to") ?? ""));

    const db = supabaseAdmin();
    const { data: share } = await db
      .from("payment_shares")
      .select("id, status, player_id, marked_by, request:payment_requests!inner(closed_at)")
      .eq("id", shareId)
      .maybeSingle();

    // Somebody else's share looks exactly like one that does not exist.
    if (!share || share.player_id !== user.player.id) {
      return { ok: false, error: "That payment is no longer there." };
    }

    const closedAt = (share.request as unknown as { closed_at: string | null }).closed_at;
    if (closedAt) return { ok: false, error: "The organisers have closed this request." };

    const verdict = playerMayChange(
      { status: share.status, playerId: share.player_id, markedBy: share.marked_by },
      to,
    );
    if (!verdict.ok) return { ok: false, error: verdict.reason };

    const { error } = await db
      .from("payment_shares")
      .update({
        status: to,
        paid_at: to === "paid" ? new Date().toISOString() : null,
        marked_by: user.player.id,
      })
      .eq("id", shareId)
      // If an organiser changed it a moment ago, this finds nothing to update
      // rather than overwriting their decision.
      .eq("status", share.status);
    if (error) throw error;

    revalidatePath("/notifications");
    revalidatePath(`/admin/payments`);
    return {
      ok: true,
      message: to === "paid" ? "Thanks — the organisers will confirm it." : "Marked as not paid yet.",
    };
  } catch (error) {
    return toActionState(error);
  }
}
