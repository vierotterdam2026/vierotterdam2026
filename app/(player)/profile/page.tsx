import { requirePlayer } from "@/lib/auth/current-user";
import { getPlayerAttributes, getPlayerProfile } from "@/lib/data/players";
import { AvatarForm } from "./avatar-form";
import { AttributesForm } from "./attributes-form";
import { ProfileForm } from "./profile-form";
import { ChangePinForm } from "./change-pin-form";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PlayerCard } from "@/components/players/player-card";
import { SectionTitle } from "@/components/ui/card";
import { defaultAttributes } from "@/lib/players/attributes";

export const metadata = { title: "Profile — Sunday Football" };

export default async function ProfilePage() {
  const user = await requirePlayer();
  const [profile, attributes] = await Promise.all([
    getPlayerProfile(user.player.id),
    getPlayerAttributes(user.player.id),
  ]);

  return (
    <main className="px-5 py-8">
      <div className="flex items-start justify-between gap-3">
        <h1 className="mb-1 text-3xl font-black tracking-tight">Your profile</h1>
        <ThemeToggle />
      </div>
      <p className="mb-6 text-sm text-chalk-dim">
        Your positions and ratings are used whenever teams get picked next — including this Sunday, if the
        teams are not out yet. Teams that have already gone up keep the ratings they were picked with.
      </p>

      <div className="mb-8">
        <SectionTitle className="mb-3">Card</SectionTitle>
        <PlayerCard
          name={user.player.name}
          avatarUrl={profile?.avatar_url ?? null}
          positions={profile?.positions.map((p) => p.position) ?? []}
          attributes={attributes}
        />
      </div>

      <AvatarForm name={user.player.name} avatarUrl={profile?.avatar_url ?? null} />

      <ProfileForm
        name={user.player.name}
        positions={profile?.positions.map((p) => ({ position: p.position, rating: Math.round(p.rating) })) ?? []}
      />

      <div className="mt-10">
        <SectionTitle className="mb-1">Your ratings</SectionTitle>
        <p className="mb-3 text-sm text-chalk-dim">
          Rate yourself like a FIFA card, against our Sunday group: 50 is a typical player here. Only you and the
          admins can see these.
        </p>
        <AttributesForm initial={attributes ?? defaultAttributes()} />
      </div>

      <div className="mt-10">
        <SectionTitle className="mb-3">Change your PIN</SectionTitle>
        <ChangePinForm />
      </div>

      <div className="mt-10 border-t border-pitch-800 pt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
