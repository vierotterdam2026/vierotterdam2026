import { requireAdmin } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { listAttributes, listGroupMembers } from "@/lib/data/players";
import { Alert } from "@/components/ui/alert";
import { PlayerAdminList } from "./player-admin-list";

export const metadata = { title: "Players — Admin" };

export default async function AdminPlayersPage() {
  const admin = await requireAdmin();
  const group = await getGroup();
  if (!group) return <Alert tone="warning">This football group has not been set up yet.</Alert>;

  const players = await listGroupMembers(group.id);
  const attributes = await listAttributes(players.map((p) => p.id));

  return (
    <>
      <h1 className="mb-1 text-2xl font-black tracking-tight">Players</h1>
      <p className="mb-6 text-sm text-chalk-dim">
        {players.filter((p) => p.is_active).length} active of {players.length}. Deactivating keeps every
        Sunday they played.
      </p>

      <PlayerAdminList
        players={players.map((p) => ({
          id: p.id,
          name: p.name,
          avatarUrl: p.avatar_url,
          role: p.role,
          isActive: p.is_active,
          positions: p.positions,
          attributes: attributes.get(p.id) ?? null,
        }))}
        currentAdminId={admin.player.id}
      />
    </>
  );
}
