export const SESSION_STATUSES = [
  "draft",
  "signup_open",
  "signup_closed",
  "teams_generated",
  "teams_published",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  draft: "Draft",
  signup_open: "Signup open",
  signup_closed: "Signup closed",
  teams_generated: "Teams generated",
  teams_published: "Teams published",
  in_progress: "Match day",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Which moves an admin may make. Going backwards is allowed where it makes sense
 * — discarding generated teams, reopening signup — but never silently (spec §64).
 */
const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ["signup_open", "cancelled"],
  // Teams can be picked while signup is still open — it now runs past the game,
  // so closing it first is a choice rather than a step.
  signup_open: ["signup_closed", "teams_generated", "draft", "cancelled"],
  signup_closed: ["teams_generated", "signup_open", "cancelled"],
  teams_generated: ["teams_published", "signup_closed", "signup_open", "cancelled"],
  teams_published: ["in_progress", "teams_generated", "cancelled"],
  // Going back to picking teams on match day is a real thing that happens.
  in_progress: ["completed", "teams_published", "teams_generated", "cancelled"],
  completed: ["in_progress"],
  cancelled: ["draft", "signup_open"],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new Error(
      `A session cannot go from ${SESSION_STATUS_LABELS[from].toLowerCase()} to ${SESSION_STATUS_LABELS[
        to
      ].toLowerCase()}.`,
    );
  }
}

export function allowedTransitions(from: SessionStatus): SessionStatus[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/** The session has reached a stage where published teams exist. */
export function teamsArePublic(status: SessionStatus): boolean {
  return status === "teams_published" || status === "in_progress" || status === "completed";
}

/**
 * Whether players can see the teams yet. Teams are published when the organiser
 * is happy with them, but only revealed at the scheduled moment — by default 21:00 on
 * the Saturday before — so they can be prepared early without going out
 * days ahead of the game.
 */
export function teamsVisible(
  session: { status: SessionStatus; teams_reveal_at: string | null },
  now: Date = new Date(),
): boolean {
  if (!teamsArePublic(session.status)) return false;
  if (!session.teams_reveal_at) return true;
  return now.getTime() >= new Date(session.teams_reveal_at).getTime();
}

/** Teams are ready but still under wraps. */
export function teamsAwaitingReveal(
  session: { status: SessionStatus; teams_reveal_at: string | null },
  now: Date = new Date(),
): boolean {
  return teamsArePublic(session.status) && !teamsVisible(session, now);
}

export function isPast(status: SessionStatus): boolean {
  return status === "completed" || status === "cancelled";
}

/** Statuses where the organiser has deliberately stopped taking answers. */
const SIGNUP_BLOCKED: SessionStatus[] = ["draft", "signup_closed", "cancelled"];

/**
 * Signup runs until the deadline, which now falls *after* the game. Generating or
 * publishing teams no longer shuts it: somebody dropping out on the morning, or
 * turning up unannounced, still needs recording. The organiser can close it early
 * by moving the session to `signup_closed`.
 */
export function signupIsOpen(
  session: { status: SessionStatus; signup_deadline: string },
  now: Date = new Date(),
): boolean {
  if (SIGNUP_BLOCKED.includes(session.status)) return false;
  return now.getTime() < new Date(session.signup_deadline).getTime();
}

export function signupClosedReason(
  session: { status: SessionStatus; signup_deadline: string },
  now: Date = new Date(),
): string | null {
  if (signupIsOpen(session, now)) return null;
  if (session.status === "cancelled") return "This Sunday has been cancelled.";
  if (session.status === "draft") return "Signup has not opened yet.";
  if (session.status === "signup_closed") return "The organisers have closed signup.";
  return "Signup has closed for this Sunday.";
}

export interface NextAdminAction {
  label: string;
  /** Route fragment relative to /admin/session/[id], or "" for the dashboard. */
  href: string;
  hint: string;
}

/** What the organiser should do next, so the admin dashboard is operational (§63). */
export function nextAdminAction(status: SessionStatus): NextAdminAction | null {
  switch (status) {
    case "draft":
      return { label: "Open signup", href: "", hint: "Players cannot respond until signup opens." };
    case "signup_open":
      return { label: "Close signup", href: "", hint: "Close it once you have enough players." };
    case "signup_closed":
      return { label: "Generate teams", href: "/teams", hint: "Balance the confirmed players into teams." };
    case "teams_generated":
      return { label: "Review and publish", href: "/teams", hint: "Teams are private until you publish them." };
    case "teams_published":
      return { label: "Start match day", href: "", hint: "Everyone can see their team." };
    case "in_progress":
      return { label: "Complete Sunday", href: "", hint: "Wrap up once the last match has finished." };
    default:
      return null;
  }
}
