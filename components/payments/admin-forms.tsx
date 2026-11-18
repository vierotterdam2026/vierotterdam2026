"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createPaymentRequestAction,
  setRequestClosedAction,
  setShareStatusAction,
} from "@/app/actions/admin-payments";
import { IDLE, type ActionState } from "@/lib/actions/result";
import { formatEuro, parseEuroToCents } from "@/lib/payments/money";
import { splitCost } from "@/lib/payments/split";
import type { PaymentStatus } from "@/types/database";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

function Status({ state }: { state: ActionState }) {
  if (state.ok === false) return <Alert tone="error">{state.error}</Alert>;
  if (state.ok === true && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export interface PaymentSessionOption {
  id: string;
  /** "Sunday 11 October · Sportcomplex Olympia · 26 joined" */
  label: string;
  venue: string | null;
  confirmedIds: string[];
}

export function PaymentRequestForm({
  sessions,
  roster,
}: {
  sessions: PaymentSessionOption[];
  roster: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createPaymentRequestAction, IDLE);
  const errors = state.ok === false ? state.fieldErrors : undefined;

  const [sessionId, setSessionId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rosterIds = useMemo(() => new Set(roster.map((p) => p.id)), [roster]);
  const session = sessions.find((s) => s.id === sessionId);
  const joined = useMemo(
    () => new Set((session?.confirmedIds ?? []).filter((id) => rosterIds.has(id))),
    [session, rosterIds],
  );

  function chooseSession(id: string) {
    setSessionId(id);
    const next = sessions.find((s) => s.id === id);
    // Everyone who joined that day is asked by default; take people off below.
    setSelected(new Set((next?.confirmedIds ?? []).filter((pid) => rosterIds.has(pid))));
    if (next?.venue && !title.trim()) setTitle(next.venue);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visible = roster.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const count = selected.size;
  const amountCents = parseEuroToCents(amount);
  const costCents = parseEuroToCents(cost);
  const split = costCents !== null ? splitCost(costCents, count) : null;
  const collected = amountCents !== null ? amountCents * count : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="playerId" value={id} />
      ))}

      <Field label="Which Sunday" hint="Optional. Choosing one asks everybody who joined it." error={errors?.sessionId}>
        <Select name="sessionId" value={sessionId} onChange={(e) => chooseSession(e.target.value)}>
          <option value="">Not linked to a Sunday</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="What it is for" error={errors?.title}>
        <Input
          name="title"
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Sportcomplex Olympia"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Each person pays" error={errors?.amount}>
          <Input
            name="amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2,50"
          />
        </Field>
        <Field label="Link valid until" hint="Optional." error={errors?.expiresOn}>
          <Input name="expiresOn" type="date" />
        </Field>
      </div>

      <Field label="Payment link" hint="The Tikkie (or bunq.me, PayPal.me …) link, as it was sent to you." error={errors?.paymentUrl}>
        <Input
          name="paymentUrl"
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="https://tikkie.me/pay/…"
        />
      </Field>

      <Field label="Total cost to cover" hint="Optional. Only used to check the amount above is enough.">
        <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="60" />
      </Field>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">
            Who pays <span className="tabular text-chalk-dim">· {count} selected</span>
          </p>
          <div className="flex gap-3 text-sm font-semibold">
            {joined.size > 0 ? (
              <button type="button" onClick={() => setSelected(new Set(joined))} className="text-lime">
                Everyone who joined
              </button>
            ) : null}
            <button type="button" onClick={() => setSelected(new Set())} className="text-chalk-faint">
              Clear
            </button>
          </div>
        </div>

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search players"
          aria-label="Search players"
          className="mb-2"
        />

        <ul className="max-h-72 divide-y divide-pitch-800 overflow-y-auto rounded-2xl border border-pitch-700 bg-pitch-900">
          {visible.map((player) => (
            <li key={player.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-pitch-850">
                <input
                  type="checkbox"
                  checked={selected.has(player.id)}
                  onChange={() => toggle(player.id)}
                  className="size-5 accent-lime"
                />
                <span className="flex-1 font-semibold">{player.name}</span>
                {joined.has(player.id) ? <span className="text-xs font-bold text-kit-green">joined</span> : null}
              </label>
            </li>
          ))}
          {visible.length === 0 ? <li className="px-4 py-3 text-sm text-chalk-faint">No player matches.</li> : null}
        </ul>
        {errors?.playerIds ? <p className="mt-1 text-xs text-kit-red">{errors.playerIds}</p> : null}
      </div>

      {amountCents !== null && count > 0 ? (
        <div className="rounded-2xl border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm">
          <p>
            <span className="tabular font-bold">
              {count} × {formatEuro(amountCents)} = {formatEuro(collected ?? 0)}
            </span>{" "}
            <span className="text-chalk-dim">collected if everyone pays</span>
          </p>
          {costCents !== null && collected !== null ? (
            collected < costCents ? (
              <p className="mt-1 text-kit-yellow">
                That is {formatEuro(costCents - collected)} short of the {formatEuro(costCents)} cost
                {split ? ` — ${formatEuro(split.perPersonCents)} each would cover it.` : "."}
              </p>
            ) : (
              <p className="mt-1 text-chalk-dim">
                {collected === costCents
                  ? "Exactly the cost."
                  : `${formatEuro(collected - costCents)} over the ${formatEuro(costCents)} cost.`}
              </p>
            )
          ) : null}
        </div>
      ) : null}

      <Status state={state} />

      <SubmitButton size="lg" disabled={count === 0} pendingLabel="Sending…">
        Ask {count} {count === 1 ? "player" : "players"} to pay
      </SubmitButton>
    </form>
  );
}

/** The few things an organiser can do to one person's share, as buttons. */
export function ShareStatusButtons({
  shareId,
  status,
  selfReported,
}: {
  shareId: string;
  status: PaymentStatus;
  selfReported: boolean;
}) {
  const [state, action] = useActionState(setShareStatusAction, IDLE);

  const buttons: { to: PaymentStatus; label: string; variant: "primary" | "secondary" | "ghost" }[] = [];
  if (status === "requested") {
    buttons.push({ to: "paid", label: "Mark paid", variant: "secondary" }, { to: "waived", label: "Waive", variant: "ghost" });
  } else if (status === "paid") {
    if (selfReported) buttons.push({ to: "paid", label: "Confirm", variant: "primary" });
    buttons.push({ to: "requested", label: "Not paid", variant: "ghost" });
  } else {
    buttons.push({ to: "requested", label: "Ask again", variant: "secondary" });
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="shareId" value={shareId} />
      {buttons.map((button) => (
        <SubmitButton key={button.to + button.label} size="sm" variant={button.variant} name="to" value={button.to} pendingLabel="…">
          {button.label}
        </SubmitButton>
      ))}
      {state.ok === false ? <span className="w-full text-xs text-kit-red">{state.error}</span> : null}
    </form>
  );
}

export function RequestClosedButton({ requestId, closed }: { requestId: string; closed: boolean }) {
  const [state, action] = useActionState(setRequestClosedAction, IDLE);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="closed" value={closed ? "false" : "true"} />
      <SubmitButton variant={closed ? "secondary" : "danger"} pendingLabel="…">
        {closed ? "Reopen this request" : "Close this request"}
      </SubmitButton>
      <Status state={state} />
    </form>
  );
}
