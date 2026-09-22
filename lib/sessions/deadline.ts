import { localToUtcIso } from "@/lib/time/group-time";

export interface DeadlineDefaults {
  default_signup_close_days_after: number;
  default_signup_deadline_time: string;
  timezone: string;
}

export interface RevealDefaults {
  default_teams_reveal_days_before: number;
  default_teams_reveal_time: string;
  timezone: string;
}

/**
 * When answers stop being accepted for a given Sunday. Defaults to 15:00 on the
 * day of the game (group time).
 */
export function defaultSignupDeadline(date: string, group: DeadlineDefaults): string {
  const close = new Date(`${date}T00:00:00Z`);
  close.setUTCDate(close.getUTCDate() + group.default_signup_close_days_after);

  const local = `${close.toISOString().slice(0, 10)}T${group.default_signup_deadline_time.slice(0, 5)}`;
  return localToUtcIso(local, group.timezone);
}

/** The same thing as a local "YYYY-MM-DDTHH:mm" string, for prefilling a form. */
export function defaultSignupDeadlineLocal(date: string, group: DeadlineDefaults): string {
  const close = new Date(`${date}T00:00:00Z`);
  close.setUTCDate(close.getUTCDate() + group.default_signup_close_days_after);
  return `${close.toISOString().slice(0, 10)}T${group.default_signup_deadline_time.slice(0, 5)}`;
}

/**
 * When published teams become visible to players — by default 21:00 on the
 * Saturday before kickoff (1 day before, group time).
 */
export function defaultTeamsRevealAt(date: string, group: RevealDefaults): string {
  const reveal = new Date(`${date}T00:00:00Z`);
  reveal.setUTCDate(reveal.getUTCDate() - group.default_teams_reveal_days_before);

  const local = `${reveal.toISOString().slice(0, 10)}T${group.default_teams_reveal_time.slice(0, 5)}`;
  return localToUtcIso(local, group.timezone);
}
