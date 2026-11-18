import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { listPaymentRequests, listPaymentSessions } from "@/lib/data/payments";
import { listRoster } from "@/lib/data/sessions";
import { formatEuro } from "@/lib/payments/money";
import { formatSessionDate, formatShortDate } from "@/lib/time/group-time";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, SectionTitle } from "@/components/ui/card";
import { PaymentRequestForm } from "@/components/payments/admin-forms";

export const metadata = { title: "Payments — Admin" };

export default async function AdminPaymentsPage() {
  await requireAdminPage();
  const group = await getGroup();
  if (!group) return <Alert tone="warning">This football group has not been set up yet.</Alert>;

  const [requests, sessions, roster] = await Promise.all([
    listPaymentRequests(group.id),
    listPaymentSessions(group.id),
    listRoster(group.id),
  ]);

  // "Everyone who joined that day" only makes sense for a Sunday that has happened.
  const today = new Date().toISOString().slice(0, 10);
  const options = sessions
    .filter((s) => s.date <= today)
    .map((s) => ({
      id: s.id,
      venue: s.venue,
      confirmedIds: s.confirmedIds,
      label: `${formatSessionDate(s.date, group.timezone)}${s.venue ? ` · ${s.venue}` : ""} · ${s.confirmedIds.length} joined`,
    }));

  const open = requests.filter((r) => !r.closedAt);
  const closed = requests.filter((r) => r.closedAt);

  return (
    <>
      <h1 className="mb-1 text-2xl font-black tracking-tight">Payments</h1>
      <p className="mb-6 text-sm text-chalk-dim">
        Ask people to pay their share. Each person sees their own request under Alerts, with a button to
        your payment link. The app never touches the money — you confirm who has paid.
      </p>

      <SectionTitle className="mb-3">New request</SectionTitle>
      <Card className="mb-8">
        <CardBody className="pt-4">
          <PaymentRequestForm
            sessions={options}
            roster={roster.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name))}
          />
        </CardBody>
      </Card>

      <SectionTitle className="mb-3">Open requests</SectionTitle>
      <RequestList requests={open} timezone={group.timezone} empty="Nothing open." />

      {closed.length > 0 ? (
        <>
          <SectionTitle className="mt-8 mb-3">Closed</SectionTitle>
          <RequestList requests={closed} timezone={group.timezone} empty="" />
        </>
      ) : null}
    </>
  );
}

function RequestList({
  requests,
  timezone,
  empty,
}: {
  requests: Awaited<ReturnType<typeof listPaymentRequests>>;
  timezone: string;
  empty: string;
}) {
  if (requests.length === 0) return empty ? <p className="text-sm text-chalk-faint">{empty}</p> : null;

  return (
    <ul className="flex flex-col gap-3">
      {requests.map((r) => {
        const owing = r.total - r.paid - r.waived;
        return (
          <li key={r.id}>
            <Link
              href={`/admin/payments/${r.id}`}
              className="block rounded-2xl border border-pitch-700 bg-pitch-900 px-4 py-3 hover:bg-pitch-850"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold">{r.title}</p>
                <p className="tabular font-bold">{formatEuro(r.amountCents)}</p>
              </div>
              <p className="mt-0.5 text-sm text-chalk-dim">
                {r.sessionDate ? `${formatSessionDate(r.sessionDate, timezone)} · ` : ""}
                {r.paid} of {r.total} paid
                {r.selfReported > 0 ? ` (${r.selfReported} to confirm)` : ""}
                {owing > 0 ? ` · ${owing} still owe` : ""}
              </p>
              {r.expiresOn ? (
                <p className="mt-0.5 text-xs text-chalk-faint">Link valid until {formatShortDate(r.expiresOn, timezone)}</p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
