"use client";

import { useActionState, useState } from "react";
import { updateAttributesAction } from "@/app/actions/profile";
import { IDLE } from "@/lib/actions/result";
import {
  ATTRIBUTE_ANCHORS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  ATTRIBUTE_SHORT,
  computeOverall,
  type Attributes,
} from "@/lib/players/attributes";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";

/** Six FIFA-style ratings with a live Overall. Private: only you and the admins see them. */
export function AttributesForm({ initial }: { initial: Attributes }) {
  const [state, action] = useActionState(updateAttributesAction, IDLE);
  const [values, setValues] = useState<Attributes>(initial);
  const overall = computeOverall(values);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="attributes" value={JSON.stringify(values)} />

      <div className="flex items-center justify-between rounded-2xl border border-pitch-700 bg-pitch-900 p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-chalk-faint">Overall</p>
          <p className="text-xs text-chalk-dim">Average of the six, worked out for you.</p>
        </div>
        <p className="text-4xl font-black tabular-nums text-lime" aria-live="polite">
          {overall}
        </p>
      </div>

      {ATTRIBUTE_KEYS.map((key) => {
        const anchors = ATTRIBUTE_ANCHORS[key];
        const value = values[key];
        // The closest anchor to the current value, as a reminder of what it means.
        const nearest = anchors.reduce((best, a) => (Math.abs(a.value - value) < Math.abs(best.value - value) ? a : best));
        return (
          <div key={key} className="rounded-2xl border border-pitch-700 bg-pitch-900 p-3">
            <div className="flex items-center justify-between">
              <label htmlFor={`attr-${key}`} className="text-sm font-bold text-chalk">
                {ATTRIBUTE_LABELS[key]} <span className="text-xs font-semibold text-chalk-faint">{ATTRIBUTE_SHORT[key]}</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={ATTRIBUTE_MIN}
                max={ATTRIBUTE_MAX}
                value={value}
                aria-label={`${ATTRIBUTE_LABELS[key]} value`}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (Number.isFinite(n)) setValues((v) => ({ ...v, [key]: Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, n)) }));
                }}
                className="h-9 w-16 rounded-lg border border-pitch-700 bg-pitch-850 px-2 text-center font-black tabular-nums text-chalk focus:border-lime focus:outline-none"
              />
            </div>
            <input
              id={`attr-${key}`}
              type="range"
              min={ATTRIBUTE_MIN}
              max={ATTRIBUTE_MAX}
              value={value}
              onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
              className="mt-2 w-full accent-lime"
            />
            <p className="mt-1 text-xs text-chalk-dim">
              <span className="font-bold text-chalk">Around {nearest.value}:</span> {nearest.text}
            </p>
            <details className="mt-1 text-xs text-chalk-faint">
              <summary className="cursor-pointer">What the numbers mean</summary>
              <ul className="mt-1 space-y-0.5">
                {anchors.map((a) => (
                  <li key={a.value}>
                    <span className="font-bold text-chalk-dim">{a.value}</span> — {a.text}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        );
      })}

      {state.ok === false ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok === true ? <Alert tone="success">{state.message}</Alert> : null}

      <SubmitButton pendingLabel="Saving…">Save ratings</SubmitButton>
    </form>
  );
}
