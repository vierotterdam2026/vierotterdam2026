"use client";

import { useActionState, useRef, type RefObject } from "react";
import { createVenueAction, type VenueActionState } from "@/app/actions/admin-sessions";
import { IDLE } from "@/lib/actions/result";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { VenueRow } from "@/types/database";

/**
 * Lives outside the Sunday form on purpose — a form cannot be nested in another
 * form, and the picker's "Add a venue" button opens this one as a modal instead.
 */
export function AddVenueDialog({
  dialogRef,
  onCreated,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onCreated: (venue: VenueRow) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, action] = useActionState(async (prev: VenueActionState, formData: FormData) => {
    const result = await createVenueAction(prev, formData);
    if (result.ok === true && result.venue) {
      onCreated(result.venue);
      formRef.current?.reset();
      dialogRef.current?.close();
    }
    return result;
  }, IDLE);

  const fieldErrors = state.ok === false ? state.fieldErrors : undefined;

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-pitch-700
        bg-pitch-900 p-5 text-chalk backdrop:bg-pitch-950/70"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <h2 className="mb-4 text-lg font-black tracking-tight">Add a venue</h2>

      <form ref={formRef} action={action} className="flex flex-col gap-4">
        <Field label="Name" error={fieldErrors?.name}>
          <Input name="name" required maxLength={80} placeholder="Sportpark Rotterdam" />
        </Field>
        <Field label="Address" error={fieldErrors?.address}>
          <Input name="address" maxLength={200} placeholder="Sportlaan 12, 3062 Rotterdam" />
        </Field>
        <Field label="Google Maps link" hint="Optional. Paste the share link." error={fieldErrors?.mapsUrl}>
          <Input name="mapsUrl" type="url" placeholder="https://maps.google.com/..." />
        </Field>
        <Field label="Notes" hint="e.g. Pitch 3, gate code 1234" error={fieldErrors?.notes}>
          <Input name="notes" maxLength={200} />
        </Field>

        {state.ok === false ? <Alert tone="error">{state.error}</Alert> : null}

        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Saving…">Save venue</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
        </div>
      </form>
    </dialog>
  );
}
