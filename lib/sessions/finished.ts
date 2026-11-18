import { localDateAndHour } from "./upcoming";
import type { SessionStatus } from "./state";

/**
 * Statuses a Sunday can be in when it has actually been played. A Sunday that was
 * never picked, never opened or was cancelled is not "finished" — it simply did
 * not happen — and a completed one is already done.
 */
export const COMPLETABLE: SessionStatus[] = ["teams_published", "in_progress"];

export interface DatedSession {
  date: string;
  status: SessionStatus;
}

/**
 * The Sundays that are over and should be marked completed. A game day counts as
 * over from the next calendar day in Amsterdam, so the afternoon of the game —
 * when signup is still open until 15:00 — is left alone.
 */
export function selectFinished<T extends DatedSession>(sessions: T[], now: Date = new Date()): T[] {
  const today = localDateAndHour(now).date;
  return sessions.filter((s) => s.date < today && COMPLETABLE.includes(s.status));
}
