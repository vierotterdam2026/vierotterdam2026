import type { SessionStatus } from "./state";

/** How far ahead players may answer. Beyond this, a Sunday is not yet theirs to see. */
export const UPCOMING_WEEKS = 4;

/** At most this many dates on the home screen, however many exist in the window. */
export const UPCOMING_LIMIT = 4;

export interface DatedSession {
  date: string;
  status: SessionStatus;
}

/**
 * The window players can respond within. It starts *yesterday*, because signup
 * now runs until the day after a game: on Monday morning you can still correct
 * whether you actually played on Sunday.
 */
export function upcomingWindow(today: Date = new Date(), weeks = UPCOMING_WEEKS) {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 1);

  const to = new Date(start);
  to.setUTCDate(to.getUTCDate() + weeks * 7 + 1);
  return { from: iso(start), to: iso(to) };
}

/**
 * The Sundays a player should see, soonest first. Yesterday's game stays while
 * its signup is still open; a cancelled one stays too, because "it's off this
 * week" is information. Only drafts are hidden.
 */
export function selectUpcoming<T extends DatedSession>(
  sessions: T[],
  today: Date = new Date(),
  { weeks = UPCOMING_WEEKS, limit = UPCOMING_LIMIT }: { weeks?: number; limit?: number } = {},
): T[] {
  const { from, to } = upcomingWindow(today, weeks);

  return sessions
    .filter((s) => s.date >= from && s.date <= to)
    .filter((s) => s.status !== "draft")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/**
 * Every Sunday that has passed, newest first, for the feed. It cuts at the same
 * boundary as `selectUpcoming` (the window's `from`), so a date is never on both.
 * Drafts never went public; a cancelled Sunday stays, as "it was off" is news.
 */
export function selectPast<T extends DatedSession>(sessions: T[], today: Date = new Date()): T[] {
  const { from } = upcomingWindow(today);

  return sessions
    .filter((s) => s.date < from)
    .filter((s) => s.status !== "draft")
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The Sundays an admin should be creating, so the list is never empty. */
export function missingSundays(existing: string[], today: Date = new Date(), count = UPCOMING_LIMIT): string[] {
  const have = new Set(existing);
  const result: string[] = [];

  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  // Move to the coming Sunday (0 = Sunday); today counts if it is one.
  cursor.setUTCDate(cursor.getUTCDate() + ((7 - cursor.getUTCDay()) % 7));

  for (let i = 0; i < count; i++) {
    const date = iso(cursor);
    if (!have.has(date)) result.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return result;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
