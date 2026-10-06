"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { saveSessionAction } from "@/app/actions/admin-sessions";
import { IDLE } from "@/lib/actions/result";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { VenueRow } from "@/types/database";
import { AddVenueDialog } from "./add-venue-dialog";

export interface SessionFormValues {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  venueId: string | null;
  locationNotes: string;
  note: string;
  /** Local wall-clock, e.g. "2026-09-19T18:00". */
  signupDeadline: string;
}

export function SessionForm({ venues, initial }: { venues: VenueRow[]; initial: SessionFormValues }) {
  const [state, action] = useActionState(saveSessionAction, IDLE);
  const fieldErrors = state.ok === false ? state.fieldErrors : undefined;

  // A venue added from here joins the list straight away, so the organiser can
  // pick it without leaving the Sunday they are halfway through editing.
  const [options, setOptions] = useState(venues);
  const [venueId, setVenueId] = useState(initial.venueId ?? "");
  const addVenue = useRef<HTMLDialogElement>(null);

  function onVenueCreated(venue: VenueRow) {
    setOptions((current) =>
      [...current, venue].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setVenueId(venue.id);
  }

  return (
    <>
      <form action={action} className="flex flex-col gap-5">
        {initial.id ? <input type="hidden" name="sessionId" value={initial.id} /> : null}

        <Field label="Date" error={fieldErrors?.date}>
          <Input type="date" name="date" defaultValue={initial.date} required />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start" error={fieldErrors?.startTime}>
            <Input type="time" name="startTime" defaultValue={initial.startTime} required />
          </Field>
          <Field label="End" error={fieldErrors?.endTime}>
            <Input type="time" name="endTime" defaultValue={initial.endTime} required />
          </Field>
        </div>

        <Field
          label="Venue"
          error={fieldErrors?.venueId}
          hint={options.length === 0 ? "No venues yet — add the pitch you play on." : undefined}
        >
          <div className="flex items-center gap-2">
            <Select name="venueId" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              <option value="">Not set</option>
              {options.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={() => addVenue.current?.showModal()}
            >
              Add
            </Button>
          </div>
        </Field>

        <Field label="Pitch or note for this week" hint="e.g. Pitch 5 this week">
          <Input name="locationNotes" defaultValue={initial.locationNotes} maxLength={200} />
        </Field>

        <Field
          label="Signup closes"
          error={fieldErrors?.signupDeadline}
          hint="Players cannot change their answer after this."
        >
          <Input
            type="datetime-local"
            name="signupDeadline"
            defaultValue={initial.signupDeadline}
            required
          />
        </Field>

        <Field label="Message to players" error={fieldErrors?.note}>
          <Textarea name="note" defaultValue={initial.note} rows={2} maxLength={500} />
        </Field>

        {state.ok === false ? <Alert tone="error">{state.error}</Alert> : null}
        {state.ok === true ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="flex items-center gap-4">
          <SubmitButton pendingLabel="Saving…">{initial.id ? "Save Sunday" : "Create Sunday"}</SubmitButton>
          <Link href="/admin" className="text-sm font-semibold text-chalk-faint underline-offset-4 hover:underline">
            Cancel
          </Link>
        </div>
      </form>

      <AddVenueDialog dialogRef={addVenue} onCreated={onVenueCreated} />
    </>
  );
}
