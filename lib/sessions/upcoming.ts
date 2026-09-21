import type { SessionStatus } from "./state";

/** How far ahead players may answer. Beyond this, a Sunday is not yet theirs to see. */
export const UPCOMING_WEEKS = 4;

/** At most this many dates on the home screen, however many exist in the window. */
export const UPCOMING_LIMIT = 4;

export interface DatedSession {
  date: string;
  status: SessionStatus;
}

/** Game days are read in this timezone, not UTC. */
export const SUNDAY_TIMEZONE = "Europe/Amsterdam";

/** From this local hour on game day, the Sunday leaves Home and moves to the Feed. */
export const MOVE_TO_FEED_HOUR = 15;

/** Calendar date (YYYY-MM-DD) and hour of `now` in the game timezone. */
function localDateAndHour(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SUNDAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/**
 * The window players can respond within. A Sunday stays until 15:00 Amsterdam
 * time on game day, then moves to the Feed's past Sundays: `from` is today's
 * date before 15:00 and tomorrow's from then on. `selectPast` cuts at the same
 * `from`, so a date is never on both.
 */
export function upcomingWindow(today: Date = new Date(), weeks = UPCOMING_WEEKS) {
  const { date, hour } = localDateAndHour(today);
  const start = new Date(`${date}T00:00:00Z`);
  if (hour >= MOVE_TO_FEED_HOUR) start.setUTCDate(start.getUTCDate() + 1);

  const to = new Date(start);
  to.setUTCDate(to.getUTCDate() + weeks * 7);
  return { from: iso(start), to: iso(to) };
}

/**
 * The Sundays a player should see, soonest first. A game stays until 15:00 on
 * its day; a cancelled one stays too, because "it's off this
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
