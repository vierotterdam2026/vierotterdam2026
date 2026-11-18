import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { listMyPayments } from "@/lib/data/payments";
import { countNeedingAction } from "@/lib/payments/notifications";
import { isConfigured } from "@/lib/env";
import { BottomNavigation } from "@/components/nav/bottom-navigation";
import { SetupRequired } from "@/components/ui/setup-required";

/**
 * Every page here depends on who is asking, so nothing is prerendered.
 */
export const dynamic = "force-dynamic";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) return <SetupRequired />;

  const user = await getCurrentUser();
  if (!user) redirect("/");

  // The badge on the Alerts tab. Shared with the Notifications page through a
  // per-request cache, so opening it does not ask twice.
  const group = await getGroup();
  const waiting = group ? countNeedingAction(await listMyPayments(user.player.id, group.timezone)) : 0;

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-20">
      {children}
      <BottomNavigation isAdmin={user.role === "admin"} notificationCount={waiting} />
    </div>
  );
}
