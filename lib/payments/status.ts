export type ShareStatus = "requested" | "paid" | "waived";

export interface ShareState {
  status: ShareStatus;
  playerId: string;
  /** Who last changed it. The player themself means they reported it. */
  markedBy: string | null;
}

export type ShareChange = { ok: true } | { ok: false; reason: string };

/**
 * A player saying "I've paid" is a claim, not a fact — the app cannot see the bank.
 * It is told apart from an organiser's confirmation by who marked it.
 */
export function isSelfReported(share: ShareState): boolean {
  return share.status === "paid" && share.markedBy === share.playerId;
}

/**
 * What a player may do to their own share: say they have paid, and take that back
 * if they tapped it by mistake. Once an organiser has confirmed it, or waived it,
 * it is no longer theirs to change.
 */
export function playerMayChange(share: ShareState, to: ShareStatus): ShareChange {
  if (to === "paid") {
    if (share.status === "requested") return { ok: true };
    if (share.status === "paid") return { ok: false, reason: "That is already marked as paid." };
    return { ok: false, reason: "The organisers have settled this one." };
  }

  if (to === "requested") {
    if (isSelfReported(share)) return { ok: true };
    if (share.status === "requested") return { ok: true };
    return { ok: false, reason: "The organisers have already confirmed this, so only they can change it." };
  }

  return { ok: false, reason: "Only the organisers can waive a payment." };
}

/** Organisers can put any share into any state. */
export function adminMayChange(): ShareChange {
  return { ok: true };
}

/** Calendar date (YYYY-MM-DD) of `now` in the given timezone. */
function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Whether the payment link still works. `expiresOn` is the last day it is valid,
 * in group time, so on that day it is still live and the day after it is not.
 * No expiry means it never lapses.
 */
export function linkIsLive(expiresOn: string | null, now: Date, timeZone: string): boolean {
  if (!expiresOn) return true;
  return localDate(now, timeZone) <= expiresOn;
}
