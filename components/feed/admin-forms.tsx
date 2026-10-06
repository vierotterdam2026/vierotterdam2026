"use client";

import { useActionState } from "react";
import {
  adjustPlayerStatAction,
  createFixtureAction,
  setFixtureResultAction,
  setFixtureStatusAction,
  voidAdjustmentAction,
} from "@/app/actions/admin-feed";
import { IDLE, type ActionState } from "@/lib/actions/result";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

function Status({ state }: { state: ActionState }) {
  if (state.ok === false) return <Alert tone="error">{state.error}</Alert>;
  if (state.ok === true) return <Alert tone="success">{state.message ?? "Saved."}</Alert>;
  return null;
}

export function FixtureForm({ timezone }: { timezone: string }) {
  const [state, action] = useActionState(createFixtureAction, IDLE);
  const errors = state.ok === false ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Home team" error={errors?.homeTeam}>
        <Input name="homeTeam" required maxLength={60} placeholder="Team name" />
      </Field>
      <Field label="Away team" error={errors?.awayTeam}>
        <Input name="awayTeam" required maxLength={60} placeholder="Team name" />
      </Field>
      <Field label="Competition" hint="Optional, e.g. Premier League." error={errors?.competition}>
        <Input name="competition" maxLength={60} />
      </Field>
      <Field label={`Kickoff (${timezone} time)`} error={errors?.kickoffLocal}>
        <Input name="kickoffLocal" type="datetime-local" required />
      </Field>
      <Status state={state} />
      <SubmitButton pendingLabel="Adding…">Add match</SubmitButton>
    </form>
  );
}

export function ResultForm({ fixtureId, home, away }: { fixtureId: string; home: number | null; away: number | null }) {
  const [state, action] = useActionState(setFixtureResultAction, IDLE);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <div className="flex items-end gap-2">
        <Field label="Home goals">
          <Input name="homeGoals" type="number" min={0} max={99} required defaultValue={home ?? ""} inputMode="numeric" />
        </Field>
        <Field label="Away goals">
          <Input name="awayGoals" type="number" min={0} max={99} required defaultValue={away ?? ""} inputMode="numeric" />
        </Field>
        <SubmitButton size="md" pendingLabel="…">{home === null ? "Save result" : "Correct"}</SubmitButton>
      </div>
      <Status state={state} />
    </form>
  );
}

export function FixtureStatusButtons({ fixtureId, status }: { fixtureId: string; status: string }) {
  const [state, action] = useActionState(setFixtureStatusAction, IDLE);
  const targets = status === "scheduled" ? ["postponed", "cancelled"] : ["scheduled", "cancelled"];
  return (
    <form action={action} className="mt-2 flex flex-wrap gap-2">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      {targets.map((t) => (
        <Button key={t} type="submit" name="status" value={t} size="sm" variant={t === "cancelled" ? "danger" : "secondary"}>
          {t === "scheduled" ? "Reopen" : t === "postponed" ? "Postpone" : "Cancel"}
        </Button>
      ))}
      <Status state={state} />
    </form>
  );
}

export function StatAdjustForm({ players }: { players: { id: string; name: string; goal: number; assist: number }[] }) {
  const [state, action] = useActionState(adjustPlayerStatAction, IDLE);
  const errors = state.ok === false ? state.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Player">
        <Select name="playerId" required defaultValue="">
          <option value="" disabled>Choose a player</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.goal} goals, {p.assist} assists
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Stat">
        <Select name="stat" defaultValue="goal">
          <option value="goal">Goals</option>
          <option value="assist">Assists</option>
        </Select>
      </Field>
      <Field label="New total" hint="The total you want them to have, not the amount to add." error={errors?.target}>
        <Input name="target" type="number" min={0} required inputMode="numeric" />
      </Field>
      <Field label="Reason" hint="Required. Kept in the history below." error={errors?.reason}>
        <Input name="reason" required minLength={3} maxLength={200} placeholder="Missed goals from 13 Sept" />
      </Field>
      <Status state={state} />
      <SubmitButton pendingLabel="Saving…">Update total</SubmitButton>
    </form>
  );
}

export function VoidButton({ adjustmentId }: { adjustmentId: string }) {
  const [state, action] = useActionState(voidAdjustmentAction, IDLE);
  return (
    <form action={action}>
      <input type="hidden" name="adjustmentId" value={adjustmentId} />
      <Button type="submit" size="sm" variant="ghost">Void</Button>
      {state.ok === false ? <span className="ml-2 text-xs text-kit-red">{state.error}</span> : null}
    </form>
  );
}
