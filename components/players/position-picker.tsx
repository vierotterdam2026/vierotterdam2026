"use client";

import { useState } from "react";
import { POSITION_CODES, POSITION_LABELS, type PositionCode } from "@/lib/teams/positions";

export interface PositionChoice {
  position: PositionCode | "";
  rating: number;
}

const CHOICE_LABELS = ["First choice", "Second choice", "Third choice"];

export function positionsToPayload(choices: PositionChoice[]) {
  return choices
    .map((choice, index) => ({ ...choice, preferenceRank: index + 1 }))
    .filter((choice): choice is PositionChoice & { position: PositionCode; preferenceRank: number } =>
      choice.position !== "",
    )
    .map(({ position, rating, preferenceRank }) => ({ position, rating, preferenceRank }));
}

/**
 * Up to three positions, each with a self-rating. Ratings are private to the
 * player and the admins (spec §76), which the hint says out loud.
 */
export function PositionPicker({
  name = "positions",
  initial,
}: {
  name?: string;
  initial?: { position: PositionCode; rating: number }[];
}) {
  const [choices, setChoices] = useState<PositionChoice[]>(() =>
    [0, 1, 2].map((i) => ({
      position: initial?.[i]?.position ?? "",
      rating: initial?.[i]?.rating ?? 6,
    })),
  );

  function update(index: number, patch: Partial<PositionChoice>) {
    setChoices((current) => current.map((choice, i) => (i === index ? { ...choice, ...patch } : choice)));
  }

  const taken = new Set(choices.map((c) => c.position).filter(Boolean));

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(positionsToPayload(choices))} />

      {choices.map((choice, index) => (
        <div key={index} className="rounded-2xl border border-pitch-700 bg-pitch-900 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-chalk">{CHOICE_LABELS[index]}</span>
            {index > 0 ? <span className="text-xs text-chalk-faint">Optional</span> : null}
          </div>

          <select
            value={choice.position}
            onChange={(e) => update(index, { position: e.target.value as PositionCode | "" })}
            aria-label={`${CHOICE_LABELS[index]} position`}
            className="h-12 w-full rounded-xl border border-pitch-700 bg-pitch-850 px-3 text-chalk focus:border-lime focus:outline-none"
          >
            <option value="">Not set</option>
            {POSITION_CODES.map((code) => (
              <option key={code} value={code} disabled={taken.has(code) && choice.position !== code}>
                {code} — {POSITION_LABELS[code]}
              </option>
            ))}
          </select>

          {choice.position ? (
            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between">
                <label htmlFor={`rating-${index}`} className="text-sm text-chalk-dim">
                  How good are you there?
                </label>
                <span className="tabular text-lg font-black text-lime">{choice.rating}/10</span>
              </div>
              <input
                id={`rating-${index}`}
                type="range"
                min={1}
                max={10}
                step={1}
                value={choice.rating}
                onChange={(e) => update(index, { rating: Number(e.target.value) })}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-pitch-700 accent-lime"
              />
            </div>
          ) : null}
        </div>
      ))}

      <p className="text-xs leading-relaxed text-chalk-faint">
        The ratings are used to balance teams.
      </p>
    </div>
  );
}
