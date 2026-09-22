"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { getSession } from "@/lib/data/sessions";
import { getTeams } from "@/lib/data/teams";
import { assertTransition } from "@/lib/sessions/state";
import { prepareTeamsForSession } from "@/lib/teams/prepare";
import { defaultTeamsRevealAt } from "@/lib/sessions/deadline";
import { autoSlots, SLOT_COUNT } from "@/lib/teams/formation";
import { isPositionCode } from "@/lib/teams/positions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateTeamsSchema } from "@/lib/validation/schemas";
import { toActionState, type ActionState } from "@/lib/actions/result";

export async function generateTeamsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const sessionId = String(formData.get("sessionId") ?? "");

    const options = generateTeamsSchema.parse({
      teamCount: Number(formData.get("teamCount") ?? 0),
      balanceAbility: formData.get("balanceAbility") !== null,
      balancePositions: formData.get("balancePositions") !== null,
      respectPreferences: formData.get("respectPreferences") !== null,
      balanceGoalkeepers: formData.get("balanceGoalkeepers") !== null,
    });

    const session = await getSession(sessionId);
    if (!session) return { ok: false, error: "That Sunday no longer exists." };

    // Signup now runs past the game, so waiting for it to close would mean never
    // generating. Teams can be picked at any point before they go out.
    if (session.status === "teams_published") {
      return {
        ok: false,
        error: "These teams are already published. Hide them first if you want to start again.",
      };
    }
    if (session.status === "cancelled") {
      return { ok: false, error: "This Sunday is cancelled." };
    }
    if (session.status === "completed") {
      return { ok: false, error: "This Sunday is finished. Reopen it first if you need to change the teams." };
    }

    const group = await getGroup();

    const { result } = await prepareTeamsForSession(sessionId, {
      teamCount: options.teamCount,
      balanceAbility: options.balanceAbility,
      balancePositions: options.balancePositions,
      respectPreferences: options.respectPreferences,
      balanceGoalkeepers: options.balanceGoalkeepers,
      actorId: admin.player.id,
      colours: group?.team_colours,
    });

    revalidatePath(`/admin/session/${sessionId}/teams`);
    revalidatePath("/admin");

    return {
      ok: true,
      message: `${result.teams.length} teams generated — balance ${result.metrics.balanceScore}/100.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

const moveSchema = z.object({
  memberId: z.uuid(),
  targetTeamId: z.uuid(),
});

const addSchema = z.object({
  playerId: z.uuid(),
  targetTeamId: z.uuid(),
});

export async function movePlayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const input = moveSchema.parse({
      memberId: String(formData.get("memberId") ?? ""),
      targetTeamId: String(formData.get("targetTeamId") ?? ""),
    });

    const db = supabaseAdmin();
    const { data: member } = await db
      .from("team_members")
      .select("id, session_id, team_id")
      .eq("id", input.memberId)
      .maybeSingle();

    if (!member) return { ok: false, error: "That player is no longer in this Sunday's teams." };
    if (member.team_id === input.targetTeamId) return { ok: true };

    const { data: target } = await db
      .from("teams")
      .select("id, session_id, published")
      .eq("id", input.targetTeamId)
      .maybeSingle();

    if (!target || target.session_id !== member.session_id) {
      return { ok: false, error: "That team belongs to a different Sunday." };
    }

    const { error } = await db
      .from("team_members")
      // A slot on the old team's board means nothing on the new one.
      .update({ team_id: input.targetTeamId, lineup_slot: null })
      .eq("id", input.memberId);

    if (error) throw error;

    void admin;
    revalidatePath(`/admin/session/${member.session_id}/teams`);
    revalidatePath("/teams");
    return { ok: true, message: "Player moved." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function setAssignedPositionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdmin();
    const memberId = String(formData.get("memberId") ?? "");
    const position = String(formData.get("position") ?? "");

    if (!isPositionCode(position)) return { ok: false, error: "That is not a position." };

    const db = supabaseAdmin();
    const { data: member } = await db
      .from("team_members")
      .select("id, session_id")
      .eq("id", memberId)
      .maybeSingle();

    if (!member) return { ok: false, error: "That player is no longer in this Sunday's teams." };

    // Changing the Sunday's position never touches the player's own preferences.
    const { error } = await db
      .from("team_members")
      .update({ assigned_position: position })
      .eq("id", memberId);

    if (error) throw error;

    revalidatePath(`/admin/session/${member.session_id}/teams`);
    revalidatePath("/teams");
    return { ok: true, message: "Position updated." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function setMemberAvailabilityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAdmin();
    const memberId = String(formData.get("memberId") ?? "");
    const available = String(formData.get("available") ?? "") === "true";

    const db = supabaseAdmin();
    const { data: member } = await db
      .from("team_members")
      .select("id, session_id")
      .eq("id", memberId)
      .maybeSingle();

    if (!member) return { ok: false, error: "That player is no longer in this Sunday's teams." };

    const { error } = await db.from("team_members").update({ is_available: available }).eq("id", memberId);
    if (error) throw error;

    revalidatePath(`/admin/session/${member.session_id}/teams`);
    revalidatePath("/teams");
    return { ok: true, message: available ? "Marked as playing." : "Marked as dropped out." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function publishTeamsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const sessionId = String(formData.get("sessionId") ?? "");

    const session = await getSession(sessionId);
    if (!session) return { ok: false, error: "That Sunday no longer exists." };

    const teams = await getTeams(sessionId, true);
    if (teams.length === 0) return { ok: false, error: "Generate the teams before publishing them." };

    assertTransition(session.status, "teams_published");

    const db = supabaseAdmin();
    const { error } = await db.from("teams").update({ published: true }).eq("session_id", sessionId);
    if (error) throw error;

    await db
      .from("sessions")
      .update({
        status: "teams_published",
        // A manual publish is the organiser saying "show them now"; the scheduled
        // reveal only applies to the cron job's early picks.
        teams_reveal_at: new Date().toISOString(),
        updated_by: admin.player.id,
      })
      .eq("id", sessionId);

    revalidatePath(`/admin/session/${sessionId}/teams`);
    revalidatePath("/home");
    revalidatePath("/teams");
    return { ok: true, message: "Teams published. Everyone can see them now." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function unpublishTeamsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const sessionId = String(formData.get("sessionId") ?? "");

    const session = await getSession(sessionId);
    if (!session) return { ok: false, error: "That Sunday no longer exists." };

    assertTransition(session.status, "teams_generated");

    const db = supabaseAdmin();
    await db.from("teams").update({ published: false }).eq("session_id", sessionId);
    await db
      .from("sessions")
      .update({ status: "teams_generated", updated_by: admin.player.id })
      .eq("id", sessionId);

    revalidatePath(`/admin/session/${sessionId}/teams`);
    revalidatePath("/home");
    revalidatePath("/teams");
    return { ok: true, message: "Teams hidden from players again." };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Brings the reveal forward to now, or pushes it back to the scheduled time.
 * Publishing decides the teams are final; this decides when players see them.
 */
export async function setTeamsRevealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const sessionId = String(formData.get("sessionId") ?? "");
    const when = String(formData.get("when") ?? "");

    const session = await getSession(sessionId);
    if (!session) return { ok: false, error: "That Sunday no longer exists." };

    const group = await getGroup();
    if (!group) return { ok: false, error: "This football group has not been set up yet." };

    const revealAt =
      when === "now" ? new Date().toISOString() : defaultTeamsRevealAt(session.date, group);

    const { error } = await supabaseAdmin()
      .from("sessions")
      .update({ teams_reveal_at: revealAt, updated_by: admin.player.id })
      .eq("id", sessionId);

    if (error) throw error;

    revalidatePath(`/admin/session/${sessionId}/teams`);
    revalidatePath("/home");
    revalidatePath("/teams");

    return {
      ok: true,
      message: when === "now" ? "Teams are visible to players now." : "Reveal put back to the usual time.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Slots a player into an existing team without touching anybody else — the fix
 * for somebody signing up after teams went out (spec §27: assign manually,
 * rather than regenerating and reshuffling everyone).
 */
export async function addPlayerToTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const input = addSchema.parse({
      playerId: String(formData.get("playerId") ?? ""),
      targetTeamId: String(formData.get("targetTeamId") ?? ""),
    });

    const db = supabaseAdmin();

    const { data: team } = await db
      .from("teams")
      .select("id, session_id, name")
      .eq("id", input.targetTeamId)
      .maybeSingle();

    if (!team) return { ok: false, error: "That team no longer exists." };

    const { data: signup } = await db
      .from("signups")
      .select("status, player:players!inner(name)")
      .eq("session_id", team.session_id)
      .eq("player_id", input.playerId)
      .maybeSingle();

    if (!signup) return { ok: false, error: "They have not answered for this Sunday." };

    const { data: existing } = await db
      .from("team_members")
      .select("id")
      .eq("session_id", team.session_id)
      .eq("player_id", input.playerId)
      .maybeSingle();

    if (existing) return { ok: false, error: "They are already on a team this Sunday." };

    const { data: position } = await db
      .from("player_positions")
      .select("position, preference_rank, effective_rating")
      .eq("player_id", input.playerId)
      .order("preference_rank")
      .limit(1)
      .maybeSingle();

    const { data: attributes } = await db
      .from("player_attributes")
      .select("pace, shooting, passing, dribbling, defending, physical")
      .eq("player_id", input.playerId)
      .maybeSingle();

    const { error } = await db.from("team_members").insert({
      team_id: team.id,
      session_id: team.session_id,
      player_id: input.playerId,
      assigned_position: position?.position ?? "CM",
      position_rating_snapshot: position ? Number(position.effective_rating) : null,
      preference_rank_snapshot: position?.preference_rank ?? null,
      attributes_snapshot: attributes,
      is_available: signup.status === "confirmed",
    });

    if (error) throw error;

    const name = (signup.player as unknown as { name: string })?.name ?? "Player";

    revalidatePath(`/admin/session/${team.session_id}/teams`);
    revalidatePath("/teams");
    return { ok: true, message: `${name} added to ${team.name}.` };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Takes somebody off the team sheet entirely — for a dropout you want to replace
 * rather than leave struck through. Their signup is untouched.
 */
export async function removeFromTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const memberId = String(formData.get("memberId") ?? "");

    const db = supabaseAdmin();
    const { data: member } = await db
      .from("team_members")
      .select("id, session_id, player:players!inner(name)")
      .eq("id", memberId)
      .maybeSingle();

    if (!member) return { ok: false, error: "They are no longer on a team." };

    const { error } = await db.from("team_members").delete().eq("id", memberId);
    if (error) throw error;

    const name = (member.player as unknown as { name: string })?.name ?? "Player";

    revalidatePath(`/admin/session/${member.session_id}/teams`);
    revalidatePath("/teams");
    return { ok: true, message: `${name} taken off the team sheet.` };
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Saves the starting eight for one team. `slot0`…`slot7` each hold a team member
 * id (or nothing for an open slot); everyone else becomes a substitute.
 */
export async function setLineupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const teamId = z.uuid().parse(String(formData.get("teamId") ?? ""));

    const picks = Array.from({ length: SLOT_COUNT }, (_, slot) => String(formData.get(`slot${slot}`) ?? ""));
    const chosen = picks.filter((id) => id !== "");
    // An empty board would read as "automatic", which is the reset button's job.
    if (chosen.length === 0) return { ok: false, error: "Pick at least one starter, or use Re-pick automatically." };
    if (new Set(chosen).size !== chosen.length) {
      return { ok: false, error: "A player can only start in one spot." };
    }

    const db = supabaseAdmin();
    const { data: team } = await db.from("teams").select("id, session_id").eq("id", teamId).maybeSingle();
    if (!team) return { ok: false, error: "That team no longer exists." };

    const { data: members } = await db
      .from("team_members")
      .select("id, is_available")
      .eq("team_id", teamId);
    const available = new Map((members ?? []).map((m) => [m.id, m.is_available]));

    for (const id of chosen) {
      if (!available.has(id)) return { ok: false, error: "That player is not on this team." };
      if (!available.get(id)) return { ok: false, error: "A player who dropped out cannot start." };
    }

    // Clear first so swapping two players never trips the one-per-slot index.
    const cleared = await db.from("team_members").update({ lineup_slot: null }).eq("team_id", teamId);
    if (cleared.error) throw cleared.error;

    for (const [slot, id] of picks.entries()) {
      if (id === "") continue;
      const { error } = await db.from("team_members").update({ lineup_slot: slot }).eq("id", id);
      if (error) throw error;
    }

    revalidatePath(`/admin/session/${team.session_id}/teams`);
    revalidatePath("/teams");
    return { ok: true, message: "Lineup saved." };
  } catch (error) {
    return toActionState(error);
  }
}

/** Re-runs the automatic pick from assigned positions and saves it. */
export async function resetLineupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const teamId = z.uuid().parse(String(formData.get("teamId") ?? ""));

    const db = supabaseAdmin();
    const { data: team } = await db.from("teams").select("id, session_id").eq("id", teamId).maybeSingle();
    if (!team) return { ok: false, error: "That team no longer exists." };

    const { data: members, error: readError } = await db
      .from("team_members")
      .select("id, assigned_position, is_available")
      .eq("team_id", teamId);
    if (readError) throw readError;

    const slots = autoSlots(
      (members ?? []).map((m) => ({ id: m.id, position: m.assigned_position, isAvailable: m.is_available })),
    );

    // Clear first so the one-per-slot index is never hit mid-way.
    const cleared = await db.from("team_members").update({ lineup_slot: null }).eq("team_id", teamId);
    if (cleared.error) throw cleared.error;

    for (const [id, slot] of slots) {
      const { error } = await db.from("team_members").update({ lineup_slot: slot }).eq("id", id);
      if (error) throw error;
    }

    revalidatePath(`/admin/session/${team.session_id}/teams`);
    revalidatePath("/teams");
    return { ok: true, message: "Lineup picked again from positions." };
  } catch (error) {
    return toActionState(error);
  }
}
