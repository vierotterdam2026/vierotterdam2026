import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkPaymentUrl } from "@/lib/payments/link";
import { isSelfReported, linkIsLive } from "@/lib/payments/status";
import type { PaymentStatus } from "@/types/database";

/** One thing a player has been asked to pay, as the Notifications screen shows it. */
export interface MyPayment {
  shareId: string;
  status: PaymentStatus;
  /** Said paid by the player and not yet confirmed by an organiser. */
  selfReported: boolean;
  title: string;
  amountCents: number;
  paymentUrl: string;
  paymentHost: string;
  expiresOn: string | null;
  linkLive: boolean;
  sessionDate: string | null;
}

/**
 * Open requests for one player — and only that player. Anything an organiser has
 * confirmed or waived, and anything they have closed, is left out: once it is
 * settled it should stop asking.
 */
export const listMyPayments = cache(async function listMyPayments(
  playerId: string,
  timezone: string,
): Promise<MyPayment[]> {
  const { data } = await supabaseAdmin()
    .from("payment_shares")
    .select(
      "id, status, player_id, marked_by, request:payment_requests!inner(title, amount_cents, payment_url, expires_on, closed_at, session:sessions(date))",
    )
    .eq("player_id", playerId)
    .in("status", ["requested", "paid"]);

  const now = new Date();

  return (data ?? [])
    .map((row) => {
      const request = row.request as unknown as {
        title: string;
        amount_cents: number;
        payment_url: string;
        expires_on: string | null;
        closed_at: string | null;
        session: { date: string } | null;
      };
      return { row, request };
    })
    .filter(({ row, request }) => {
      if (request.closed_at) return false;
      const selfReported = isSelfReported({ status: row.status, playerId: row.player_id, markedBy: row.marked_by });
      // Paid and confirmed by an organiser: nothing more to ask.
      return row.status === "requested" || selfReported;
    })
    .map(({ row, request }) => {
      const checked = checkPaymentUrl(request.payment_url);
      return {
        shareId: row.id,
        status: row.status,
        selfReported: row.status === "paid",
        title: request.title,
        amountCents: request.amount_cents,
        paymentUrl: request.payment_url,
        paymentHost: checked.ok ? checked.host : "the payment page",
        expiresOn: request.expires_on,
        linkLive: linkIsLive(request.expires_on, now, timezone),
        sessionDate: request.session?.date ?? null,
      };
    });
});

export interface PaymentRequestSummary {
  id: string;
  title: string;
  amountCents: number;
  paymentUrl: string;
  paymentHost: string;
  expiresOn: string | null;
  sessionDate: string | null;
  closedAt: string | null;
  createdAt: string;
  total: number;
  paid: number;
  /** Of those paid, how many the player said themself and nobody has confirmed. */
  selfReported: number;
  waived: number;
}

interface RawShare {
  request_id: string;
  status: PaymentStatus;
  player_id: string;
  marked_by: string | null;
}

function summarise(
  request: {
    id: string;
    title: string;
    amount_cents: number;
    payment_url: string;
    expires_on: string | null;
    closed_at: string | null;
    created_at: string;
    session: { date: string } | null;
  },
  shares: RawShare[],
): PaymentRequestSummary {
  const mine = shares.filter((s) => s.request_id === request.id);
  const checked = checkPaymentUrl(request.payment_url);

  return {
    id: request.id,
    title: request.title,
    amountCents: request.amount_cents,
    paymentUrl: request.payment_url,
    paymentHost: checked.ok ? checked.host : "the payment page",
    expiresOn: request.expires_on,
    sessionDate: request.session?.date ?? null,
    closedAt: request.closed_at,
    createdAt: request.created_at,
    total: mine.length,
    paid: mine.filter((s) => s.status === "paid").length,
    selfReported: mine.filter((s) =>
      isSelfReported({ status: s.status, playerId: s.player_id, markedBy: s.marked_by }),
    ).length,
    waived: mine.filter((s) => s.status === "waived").length,
  };
}

const REQUEST_FIELDS =
  "id, title, amount_cents, payment_url, expires_on, closed_at, created_at, session:sessions(date)";

/** Every payment request for the group, newest first, with how it is going. */
export async function listPaymentRequests(groupId: string): Promise<PaymentRequestSummary[]> {
  const db = supabaseAdmin();

  const { data: requests } = await db
    .from("payment_requests")
    .select(REQUEST_FIELDS)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (!requests || requests.length === 0) return [];

  const { data: shares } = await db
    .from("payment_shares")
    .select("request_id, status, player_id, marked_by")
    .in("request_id", requests.map((r) => r.id));

  return requests.map((r) =>
    summarise({ ...r, session: r.session as unknown as { date: string } | null }, (shares ?? []) as RawShare[]),
  );
}

export interface PaymentShareLine {
  id: string;
  playerId: string;
  name: string;
  status: PaymentStatus;
  selfReported: boolean;
  paidAt: string | null;
}

export interface PaymentRequestDetail {
  summary: PaymentRequestSummary;
  shares: PaymentShareLine[];
}

/** One request and everyone on it, or null if it is not this group's. */
export async function getPaymentRequest(
  requestId: string,
  groupId: string,
): Promise<PaymentRequestDetail | null> {
  const db = supabaseAdmin();

  const { data: request } = await db
    .from("payment_requests")
    .select(REQUEST_FIELDS)
    .eq("id", requestId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (!request) return null;

  const { data: shares } = await db
    .from("payment_shares")
    .select("id, request_id, status, player_id, marked_by, paid_at, player:players!inner(name)")
    .eq("request_id", requestId);

  const lines: PaymentShareLine[] = (shares ?? [])
    .map((s) => ({
      id: s.id,
      playerId: s.player_id,
      name: (s.player as unknown as { name: string }).name,
      status: s.status,
      selfReported: isSelfReported({ status: s.status, playerId: s.player_id, markedBy: s.marked_by }),
      paidAt: s.paid_at,
    }))
    // Still owing first, then people who say they have paid, then the settled ones.
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return {
    summary: summarise(
      { ...request, session: request.session as unknown as { date: string } | null },
      (shares ?? []) as RawShare[],
    ),
    shares: lines,
  };
}

function rank(line: PaymentShareLine): number {
  if (line.status === "requested") return 0;
  if (line.selfReported) return 1;
  return 2;
}

/** A recent Sunday and who confirmed for it, to pre-fill who should pay. */
export interface PaymentSession {
  id: string;
  date: string;
  venue: string | null;
  confirmedIds: string[];
}

export async function listPaymentSessions(groupId: string, limit = 12): Promise<PaymentSession[]> {
  const db = supabaseAdmin();

  const { data: sessions } = await db
    .from("sessions")
    .select("id, date, venue:venues(name)")
    .eq("group_id", groupId)
    .neq("status", "draft")
    .order("date", { ascending: false })
    .limit(limit);

  if (!sessions || sessions.length === 0) return [];

  const { data: signups } = await db
    .from("signups")
    .select("session_id, player_id")
    .eq("status", "confirmed")
    .in("session_id", sessions.map((s) => s.id));

  const bySession = new Map<string, string[]>();
  for (const row of signups ?? []) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row.player_id);
    bySession.set(row.session_id, list);
  }

  return sessions.map((s) => ({
    id: s.id,
    date: s.date,
    venue: (s.venue as unknown as { name: string } | null)?.name ?? null,
    confirmedIds: bySession.get(s.id) ?? [],
  }));
}
