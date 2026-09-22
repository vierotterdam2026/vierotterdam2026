import "server-only";
import { getConfirmedPlayersForGeneration } from "@/lib/data/sessions";
import { getTeams } from "@/lib/data/teams";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { kitForIndex } from "@/components/teams/team-colours";
import { autoSlots } from "./formation";
import { generateBalancedTeams } from "./generate-balanced-teams";
import { recommendTeamSizes } from "./team-sizes";
import type { GenerateTeamsResult } from "./types";

export interface PrepareOptions {
  /** How many teams. Omitted means use the app's recommendation for the turnout. */
  teamCount?: number;
  balanceAbility?: boolean;
  balancePositions?: boolean;
  respectPreferences?: boolean;
  balanceGoalkeepers?: boolean;
  /** Publish straight away, for the scheduled run. The reveal time still gates visibility. */
  publish?: boolean;
  /** Recorded as the author of the teams. */
  actorId?: string | null;
  colours?: string[];
}

export interface PrepareResult {
  result: GenerateTeamsResult;
  teamCount: number;
  published: boolean;
}

/**
 * Picks teams for a session and saves them, replacing whatever was there before.
 *
 * Shared by the admin button and the scheduled job so there is exactly one
 * definition of what generating teams means (spec §93: no duplicate business
 * logic).
 */
export async function prepareTeamsForSession(
  sessionId: string,
  options: PrepareOptions = {},
): Promise<PrepareResult> {
  const players = await getConfirmedPlayersForGeneration(sessionId);

  if (players.length === 0) {
    throw new Error("Teams cannot be generated because there are no confirmed players.");
  }

  const recommended = recommendTeamSizes(players.length).find((o) => o.recommended);
  const teamCount = options.teamCount ?? recommended?.teamCount;

  if (!teamCount) {
    throw new Error(
      `${players.length} confirmed ${players.length === 1 ? "player is" : "players are"} not enough to make teams of a sensible size.`,
    );
  }

  // Regenerating should produce a genuinely different split (spec §13).
  const existing = await getTeams(sessionId, true);
  const previousAssignment: Record<string, number> = {};
  for (const team of existing) {
    for (const member of team.members) previousAssignment[member.playerId] = team.display_order;
  }

  const result = generateBalancedTeams(players, teamCount, {
    balanceAbility: options.balanceAbility ?? true,
    balancePositions: options.balancePositions ?? true,
    respectPreferences: options.respectPreferences ?? true,
    balanceGoalkeepers: options.balanceGoalkeepers ?? true,
    previousAssignment: existing.length ? previousAssignment : undefined,
  });

  const db = supabaseAdmin();
  const publish = options.publish ?? false;

  // Teams cascade to their members, so this clears the previous attempt whole.
  await db.from("teams").delete().eq("session_id", sessionId);

  const { data: inserted, error: teamError } = await db
    .from("teams")
    .insert(
      result.teams.map((team) => {
        const colour = options.colours?.[team.index] ?? kitForIndex(team.index).key;
        return {
          session_id: sessionId,
          name: capitalise(colour),
          colour,
          display_order: team.index,
          published: publish,
          created_by: options.actorId ?? null,
        };
      }),
    )
    .select("id, display_order");

  if (teamError || !inserted) throw teamError ?? new Error("Could not save the teams.");

  const teamIdByOrder = new Map(inserted.map((t) => [t.display_order, t.id]));

  const { error: memberError } = await db.from("team_members").insert(
    result.teams.flatMap((team) => {
      // Start each team with the automatic lineup already saved; the admin can edit it.
      const slots = autoSlots(
        team.players.map((p) => ({ id: p.playerId, position: p.assignedPosition, isAvailable: true })),
      );
      return team.players.map((player) => ({
        team_id: teamIdByOrder.get(team.index)!,
        session_id: sessionId,
        player_id: player.playerId,
        assigned_position: player.assignedPosition,
        position_rating_snapshot: player.rating,
        preference_rank_snapshot: player.preferenceRank,
        attributes_snapshot: player.attributes,
        lineup_slot: slots.get(player.playerId) ?? null,
      }));
    }),
  );

  if (memberError) throw memberError;

  await db
    .from("sessions")
    .update({
      status: publish ? "teams_published" : "teams_generated",
      updated_by: options.actorId ?? null,
    })
    .eq("id", sessionId);

  return { result, teamCount, published: publish };
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
