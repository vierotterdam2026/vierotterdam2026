import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PositionCode } from "@/lib/teams/positions";
import type { Attributes } from "@/lib/players/attributes";
import type { MemberRole, PlayerRow } from "@/types/database";

export interface PlayerPosition {
  position: PositionCode;
  preferenceRank: number;
  rating: number;
}

export interface PlayerProfile extends PlayerRow {
  role: MemberRole;
  positions: PlayerPosition[];
}

/** Names only — this feeds the login picker, so it must not leak anything else. */
export const listPlayerNames = cache(
  async (groupId: string): Promise<{ id: string; name: string; avatar_url: string | null }[]> => {
    const { data } = await supabaseAdmin()
      .from("group_members")
      .select("player:players!inner(id, name, avatar_url, is_active)")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("name", { referencedTable: "players" });

    return (data ?? [])
      .map((row) => row.player as unknown as PlayerRow)
      .filter((p) => p?.is_active)
      .map(({ id, name, avatar_url }) => ({ id, name, avatar_url }));
  },
);

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  const db = supabaseAdmin();

  const { data: player } = await db.from("players").select("*").eq("id", playerId).maybeSingle();
  if (!player) return null;

  const [{ data: positions }, { data: membership }] = await Promise.all([
    db
      .from("player_positions")
      .select("position, preference_rank, effective_rating")
      .eq("player_id", playerId)
      .order("preference_rank"),
    db.from("group_members").select("role").eq("player_id", playerId).maybeSingle(),
  ]);

  return {
    ...player,
    role: membership?.role ?? "player",
    positions: (positions ?? []).map((p) => ({
      position: p.position,
      preferenceRank: p.preference_rank,
      rating: Number(p.effective_rating),
    })),
  };
}

export async function listGroupMembers(groupId: string): Promise<PlayerProfile[]> {
  const db = supabaseAdmin();

  const { data: members } = await db
    .from("group_members")
    .select("role, is_active, player:players!inner(*)")
    .eq("group_id", groupId);

  const rows = (members ?? []).map((m) => ({
    ...(m.player as unknown as PlayerRow),
    role: m.role as MemberRole,
    memberActive: m.is_active,
  }));

  const { data: positions } = await db
    .from("player_positions")
    .select("player_id, position, preference_rank, effective_rating")
    .in("player_id", rows.map((r) => r.id).length ? rows.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("preference_rank");

  const byPlayer = new Map<string, PlayerPosition[]>();
  for (const p of positions ?? []) {
    const list = byPlayer.get(p.player_id) ?? [];
    list.push({ position: p.position, preferenceRank: p.preference_rank, rating: Number(p.effective_rating) });
    byPlayer.set(p.player_id, list);
  }

  return rows
    .map(({ memberActive, ...player }) => ({
      ...player,
      is_active: player.is_active && memberActive,
      positions: byPlayer.get(player.id) ?? [],
    }))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
}

/** A player's own FIFA-style ratings, or null before they have set any. Server-only: never sent to other players. */
export async function getPlayerAttributes(playerId: string): Promise<(Attributes & { overall: number }) | null> {
  const { data } = await supabaseAdmin()
    .from("player_attributes")
    .select("pace, shooting, passing, dribbling, defending, physical, overall")
    .eq("player_id", playerId)
    .maybeSingle();
  return data;
}

/** Attributes for many players, keyed by player id. Admin pages only. */
export async function listAttributes(playerIds: string[]): Promise<Map<string, Attributes & { overall: number }>> {
  if (playerIds.length === 0) return new Map();
  const { data } = await supabaseAdmin()
    .from("player_attributes")
    .select("player_id, pace, shooting, passing, dribbling, defending, physical, overall")
    .in("player_id", playerIds);
  return new Map((data ?? []).map(({ player_id, ...rest }) => [player_id, rest]));
}
