import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/current-user";
import { getGroup } from "@/lib/data/groups";
import { getPaymentRequest } from "@/lib/data/payments";
import { formatEuro } from "@/lib/payments/money";
import { linkIsLive } from "@/lib/payments/status";
import { formatSessionDate, formatShortDate } from "@/lib/time/group-time";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, SectionTitle } from "@/components/ui/card";
import { RequestClosedButton, ShareStatusButtons } from "@/components/payments/admin-forms";

export default async function PaymentRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const admin = await requireAdminPage();
  const group = await getGroup();
  if (!group) return <Alert tone="warning">This football group has not been set up yet.</Alert>;

  const detail = await getPaymentRequest(requestId, admin.groupId);
  if (!detail) notFound();

  const { summary, shares } = detail;
  const confirmed = summary.paid - summary.selfReported;
  const owing = summary.total - summary.paid - summary.waived;
  const live = linkIsLive(summary.expiresOn, new Date(), group.timezone);

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/payments" className="font-semibold text-chalk-faint underline-offset-4 hover:underline">
          ← All payments
        </Link>
      </p>

      <h1 className="text-2xl font-black tracking-tight">{summary.title}</h1>
      <p className="mt-1 text-chalk-dim">
        <span className="tabular font-bold text-chalk">{formatEuro(summary.amountCents)}</span> each
        {summary.sessionDate ? ` · ${formatSessionDate(summary.sessionDate, group.timezone)}` : ""}
      </p>
      {summary.closedAt ? (
        <p className="mt-2 inline-flex rounded-lg bg-pitch-800 px-2 py-1 text-xs font-bold text-chalk-faint">Closed</p>
      ) : null}

      {!live && !summary.closedAt ? (
        <div className="mt-4">
          <Alert tone="warning">
            The link expired on {summary.expiresOn ? formatShortDate(summary.expiresOn, group.timezone) : "—"}. Players
            can no longer pay through it. Make a new request with a fresh link.
          </Alert>
        </div>
      ) : null}

      <Card className="mt-5">
        <CardBody className="pt-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Confirmed" value={formatEuro(confirmed * summary.amountCents)} sub={`${confirmed} paid`} tone="good" />
            <Stat label="To confirm" value={formatEuro(summary.selfReported * summary.amountCents)} sub={`${summary.selfReported} say paid`} />
            <Stat label="Still owed" value={formatEuro(owing * summary.amountCents)} sub={`${owing} people`} />
          </dl>
          <p className="mt-3 text-xs text-chalk-faint">
            Link:{" "}
            <a href={summary.paymentUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-lime underline-offset-4 hover:underline">
              {summary.paymentHost}
            </a>
            {summary.expiresOn ? ` · valid until ${formatShortDate(summary.expiresOn, group.timezone)}` : ""}
          </p>
        </CardBody>
      </Card>

      <SectionTitle className="mt-8 mb-3">Everyone asked ({summary.total})</SectionTitle>
      <ul className="flex flex-col divide-y divide-pitch-800 overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-900">
        {shares.map((share) => (
          <li key={share.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">{share.name}</p>
              <StatusChip status={share.status} selfReported={share.selfReported} />
            </div>
            <ShareStatusButtons shareId={share.id} status={share.status} selfReported={share.selfReported} />
          </li>
        ))}
      </ul>

      <div className="mt-8 border-t border-pitch-800 pt-6">
        <RequestClosedButton requestId={summary.id} closed={Boolean(summary.closedAt)} />
        <p className="mt-2 text-xs text-chalk-faint">
          Closing removes it from players&apos; notifications. Nothing is deleted, and you can reopen it.
        </p>
      </div>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" }) {
  return (
    <div>
      <dd className={`tabular text-xl font-black ${tone === "good" ? "text-kit-green" : "text-chalk"}`}>{value}</dd>
      <dt className="text-xs text-chalk-faint">{label}</dt>
      <p className="text-[11px] text-chalk-faint">{sub}</p>
    </div>
  );
}

function StatusChip({ status, selfReported }: { status: "requested" | "paid" | "waived"; selfReported: boolean }) {
  if (status === "paid" && selfReported) return <span className="text-xs font-bold text-kit-yellow">Says paid</span>;
  if (status === "paid") return <span className="text-xs font-bold text-kit-green">Paid ✓</span>;
  if (status === "waived") return <span className="text-xs font-bold text-chalk-faint">Waived</span>;
  return <span className="text-xs font-bold text-chalk-dim">Owes</span>;
}
