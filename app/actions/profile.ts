"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth/current-user";
import { hashPin, verifyPin } from "@/lib/auth/pin";
import { clearAvatar, storeAvatar } from "@/lib/players/avatar-storage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { attributesSchema, changePinSchema, positionPreferencesSchema, profileSchema } from "@/lib/validation/schemas";
import { toActionState, type ActionState } from "@/lib/actions/result";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePlayer();

    const positions = positionPreferencesSchema.parse(JSON.parse(String(formData.get("positions") ?? "[]")));
    const input = profileSchema.parse({ name: String(formData.get("name") ?? ""), positions });

    const db = supabaseAdmin();

    const { data: clash } = await db
      .from("players")
      .select("id")
      .ilike("name", input.name)
      .neq("id", user.player.id)
      .eq("is_active", true)
      .maybeSingle();

    if (clash) {
      return { ok: false, error: "Another player already uses that name.", fieldErrors: { name: "Taken." } };
    }

    await db.from("players").update({ name: input.name }).eq("id", user.player.id);

    // Replace rather than patch: ranks are unique, so a partial update can collide.
    await db.from("player_positions").delete().eq("player_id", user.player.id);
    if (input.positions.length > 0) {
      const { error } = await db.from("player_positions").insert(
        input.positions.map((p) => ({
          player_id: user.player.id,
          position: p.position,
          preference_rank: p.preferenceRank,
          self_rating: p.rating,
        })),
      );
      if (error) throw error;
    }

    revalidatePath("/profile");
    revalidatePath(`/player/${user.player.id}`);
    // The generator reads live ratings, so a change counts for the next teams
    // picked — including this Sunday. Teams already picked keep their snapshot.
    return { ok: true, message: "Saved. This is what the next teams will be picked from." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateAttributesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePlayer();
    const input = attributesSchema.parse(JSON.parse(String(formData.get("attributes") ?? "{}")));

    const { error } = await supabaseAdmin()
      .from("player_attributes")
      .upsert({ player_id: user.player.id, ...input }, { onConflict: "player_id" });
    if (error) throw error;

    revalidatePath("/profile");
    return { ok: true, message: "Ratings saved." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function changePinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePlayer();
    const input = changePinSchema.parse({
      currentPin: String(formData.get("currentPin") ?? ""),
      newPin: String(formData.get("newPin") ?? ""),
      confirmPin: String(formData.get("confirmPin") ?? ""),
    });

    const db = supabaseAdmin();
    const { data: credential } = await db
      .from("player_credentials")
      .select("pin_hash")
      .eq("player_id", user.player.id)
      .maybeSingle();

    if (!credential || !(await verifyPin(input.currentPin, credential.pin_hash))) {
      return { ok: false, error: "That is not your current PIN.", fieldErrors: { currentPin: "Incorrect." } };
    }

    await db
      .from("player_credentials")
      .update({ pin_hash: await hashPin(input.newPin), failed_attempts: 0, locked_until: null })
      .eq("player_id", user.player.id);

    return { ok: true, message: "PIN changed." };
  } catch (error) {
    return toActionState(error);
  }
}

function revalidateAvatar(playerId: string) {
  revalidatePath("/", "layout");
  revalidatePath(`/player/${playerId}`);
}

export async function updateAvatarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePlayer();
    const file = formData.get("avatar");
    if (!(file instanceof File)) return { ok: false, error: "Choose a picture first." };

    await storeAvatar(user.player.id, file);
    revalidateAvatar(user.player.id);
    return { ok: true, message: "Picture updated." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function removeAvatarAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePlayer();
    await clearAvatar(user.player.id);
    revalidateAvatar(user.player.id);
    return { ok: true, message: "Picture removed." };
  } catch (error) {
    return toActionState(error);
  }
}
