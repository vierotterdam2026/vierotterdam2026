import {
  defaultSignupDeadline,
  defaultTeamsRevealAt,
  type DeadlineDefaults,
  type RevealDefaults,
} from "./deadline";

/** The part of a group that decides what a freshly created Sunday looks like. */
export interface SundayDefaults extends DeadlineDefaults, RevealDefaults {
  id: string;
  default_start_time: string;
  default_end_time: string;
  default_venue_id: string | null;
}

/**
 * Session rows for the given dates, filled in from the group's defaults: kickoff
 * times, venue, when signup closes and when teams are revealed. Pure, so the
 * admin button and the scheduled job cannot disagree about what a new Sunday is.
 */
export function buildSundayRows(dates: string[], group: SundayDefaults, createdBy: string | null = null) {
  return dates.map((date) => ({
    group_id: group.id,
    date,
    start_time: group.default_start_time,
    end_time: group.default_end_time,
    venue_id: group.default_venue_id,
    signup_deadline: defaultSignupDeadline(date, group),
    teams_reveal_at: defaultTeamsRevealAt(date, group),
    status: "signup_open" as const,
    created_by: createdBy,
  }));
}
