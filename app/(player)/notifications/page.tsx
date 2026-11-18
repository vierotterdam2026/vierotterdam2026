import { requirePlayerPage } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { listMyPayments } from "@/lib/data/payments";
import { formatEuro } from "@/lib/payments/money";
import { formatSessionDate, formatShortDate } from "@/lib/time/group-time";
import { Alert } from "@/components/ui/alert";
import { PaymentCards } from "@/components/payments/payment-cards";

export const metadata = { title: "Notifications — Sunday Football" };

/**
 * Things the organisers are asking of you that are not about signing up — today,
 * payment requests. Kept off Home so that stays about which Sundays you are
 * playing, with the tab's badge saying when something is waiting here.
 */
export default async function NotificationsPage() {
  const user = await requirePlayerPage();
  const group = await getGroup();

  if (!group) {
    return (
      <main className="px-5 py-10">
        <Alert tone="warning">This football group has not been set up yet.</Alert>
      </main>
    );
  }

  const payments = await listMyPayments(user.player.id, group.timezone);

  const cards = payments.map((payment) => ({
    shareId: payment.shareId,
    amountLabel: formatEuro(payment.amountCents),
    title: payment.title,
    whenLabel: payment.sessionDate ? formatSessionDate(payment.sessionDate, group.timezone) : null,
    paymentUrl: payment.paymentUrl,
    paymentHost: payment.paymentHost,
    expiresLabel: payment.expiresOn ? formatShortDate(payment.expiresOn, group.timezone) : null,
    linkLive: payment.linkLive,
    selfReported: payment.selfReported,
  }));

  return (
    <main>
      <header className="px-5 pt-8 pb-5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-lime">{group.name}</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Notifications</h1>
      </header>

      {cards.length > 0 ? (
        <PaymentCards cards={cards} />
      ) : (
        <div className="px-5">
          <Alert tone="info">Nothing waiting for you. If the organisers ask for a payment, it will show up here.</Alert>
        </div>
      )}
    </main>
  );
}
