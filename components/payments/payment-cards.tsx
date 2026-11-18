"use client";

import { useActionState } from "react";
import { setMyShareStatusAction } from "@/app/actions/payments";
import { IDLE } from "@/lib/actions/result";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

/** Everything a card shows, already formatted on the server in the group's timezone. */
export interface PaymentCardData {
  shareId: string;
  amountLabel: string;
  title: string;
  /** "Sunday 11 October", when the request belongs to a Sunday. */
  whenLabel: string | null;
  paymentUrl: string;
  paymentHost: string;
  /** "2 Dec", the last day the link works. */
  expiresLabel: string | null;
  linkLive: boolean;
  /** The player says they have paid and no organiser has confirmed it yet. */
  selfReported: boolean;
}

/**
 * The in-app request: what you owe, why, and one button to the organiser's own
 * payment page. The app never handles the money — it only points at the link and
 * remembers who says they have paid.
 */
export function PaymentCards({ cards }: { cards: PaymentCardData[] }) {
  if (cards.length === 0) return null;

  return (
    <section aria-label="Payment requests" className="flex flex-col gap-3 px-5 pb-5">
      {cards.map((card) => (
        <PaymentCard key={card.shareId} card={card} />
      ))}
    </section>
  );
}

function PaymentCard({ card }: { card: PaymentCardData }) {
  const [state, action] = useActionState(setMyShareStatusAction, IDLE);
  const isTikkie = card.paymentHost.includes("tikkie");

  return (
    <div className="overflow-hidden rounded-3xl border border-lime/40 bg-pitch-900">
      <div className="px-5 pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-lime">Payment request</p>
        <p className="mt-1 text-3xl font-black tracking-tight">
          {card.selfReported ? "You said you've paid" : `You owe ${card.amountLabel}`}
        </p>
        <p className="mt-0.5 text-sm text-chalk-dim">
          {card.title}
          {card.whenLabel ? ` · ${card.whenLabel}` : ""}
        </p>
      </div>

      {card.selfReported ? (
        <form action={action} className="px-5 pt-3 pb-5">
          <input type="hidden" name="shareId" value={card.shareId} />
          <input type="hidden" name="to" value="requested" />
          <p className="mb-3 text-sm text-chalk-dim">
            Thanks — the organisers will confirm it and this will disappear. Tapped by mistake?
          </p>
          <SubmitButton variant="secondary" size="md" pendingLabel="Undoing…">
            I haven&apos;t paid yet
          </SubmitButton>
          {state.ok === false ? (
            <div className="mt-3">
              <Alert tone="error">{state.error}</Alert>
            </div>
          ) : null}
        </form>
      ) : (
        <div className="px-5 pt-4 pb-5">
          {card.linkLive ? (
            <>
              <a
                href={card.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime px-5 text-lg
                  font-semibold tracking-tight text-pitch-950 transition-colors hover:bg-lime-dark active:bg-lime-dark
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
              >
                {isTikkie ? "Pay with Tikkie" : "Open payment page"} <span aria-hidden>→</span>
              </a>
              <p className="mt-2 text-xs text-chalk-faint">
                Opens {card.paymentHost}
                {card.expiresLabel ? ` · valid until ${card.expiresLabel}` : ""}
              </p>
            </>
          ) : (
            <Alert tone="warning">
              The payment link expired{card.expiresLabel ? ` on ${card.expiresLabel}` : ""}. Ask the organisers
              for a new one.
            </Alert>
          )}

          <form action={action} className="mt-4 flex items-center justify-between gap-3 border-t border-pitch-800 pt-4">
            <input type="hidden" name="shareId" value={card.shareId} />
            <input type="hidden" name="to" value="paid" />
            <span className="text-sm text-chalk-dim">Already paid?</span>
            <SubmitButton variant="secondary" size="md" pendingLabel="Saving…">
              I&apos;ve paid
            </SubmitButton>
          </form>

          {state.ok === false ? (
            <div className="mt-3">
              <Alert tone="error">{state.error}</Alert>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
