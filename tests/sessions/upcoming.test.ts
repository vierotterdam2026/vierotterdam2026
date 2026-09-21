import { describe, expect, it } from "vitest";
import { missingSundays, selectPast, selectUpcoming, upcomingWindow } from "@/lib/sessions/upcoming";
import type { SessionStatus } from "@/lib/sessions/state";

// A Friday, so "the coming Sunday" is two days away.
const TODAY = new Date("2026-09-18T09:00:00Z");

const session = (date: string, status: SessionStatus = "signup_open") => ({ date, status });

describe("upcomingWindow", () => {
  it("starts today before 15:00 Amsterdam time", () => {
    expect(upcomingWindow(TODAY)).toEqual({ from: "2026-09-18", to: "2026-10-16" });
  });

  it("starts tomorrow from 15:00 Amsterdam time", () => {
    // 13:00Z = 15:00 in Amsterdam summer time.
    expect(upcomingWindow(new Date("2026-09-20T13:00:00Z")).from).toBe("2026-09-21");
    expect(upcomingWindow(new Date("2026-09-20T12:59:00Z")).from).toBe("2026-09-20");
  });

  it("uses the Amsterdam date, not UTC", () => {
    // 22:30Z on the 19th is already 00:30 on the 20th in Amsterdam.
    expect(upcomingWindow(new Date("2026-09-19T22:30:00Z")).from).toBe("2026-09-20");
  });

  it("can be asked for a different horizon", () => {
    expect(upcomingWindow(TODAY, 1).to).toBe("2026-09-25");
  });
});

describe("selectUpcoming", () => {
  const all = [
    session("2026-09-13", "completed"),
    session("2026-09-20"),
    session("2026-09-27"),
    session("2026-10-04"),
    session("2026-10-11"),
    session("2026-10-18"),
  ];

  it("returns four Sundays, soonest first", () => {
    expect(selectUpcoming(all, TODAY).map((s) => s.date)).toEqual([
      "2026-09-20",
      "2026-09-27",
      "2026-10-04",
      "2026-10-11",
    ]);
  });

  it("drops anything beyond the four-week window", () => {
    expect(selectUpcoming(all, TODAY).map((s) => s.date)).not.toContain("2026-10-18");
  });

  it("drops Sundays that are well past", () => {
    expect(selectUpcoming(all, TODAY).map((s) => s.date)).not.toContain("2026-09-13");
  });

  it("keeps today's game until 15:00, then hands it to the Feed", () => {
    const games = [session("2026-09-20", "completed"), session("2026-09-27")];
    const before = new Date("2026-09-20T12:59:00Z");
    const after = new Date("2026-09-20T13:00:00Z");
    expect(selectUpcoming(games, before).map((s) => s.date)).toEqual(["2026-09-20", "2026-09-27"]);
    expect(selectUpcoming(games, after).map((s) => s.date)).toEqual(["2026-09-27"]);
    expect(selectPast(games, before)).toEqual([]);
    expect(selectPast(games, after).map((s) => s.date)).toEqual(["2026-09-20"]);
  });

  it("keeps a cancelled Sunday, because players need to know it is off", () => {
    const withCancellation = [session("2026-09-20", "cancelled"), session("2026-09-27")];
    expect(selectUpcoming(withCancellation, TODAY).map((s) => s.status)).toEqual([
      "cancelled",
      "signup_open",
    ]);
  });

  it("hides drafts the admin has not opened yet", () => {
    expect(selectUpcoming([session("2026-09-20", "draft")], TODAY)).toEqual([]);
  });

  it("includes a Sunday that is today", () => {
    const sunday = new Date("2026-09-20T09:00:00Z");
    expect(selectUpcoming([session("2026-09-20")], sunday).map((s) => s.date)).toEqual(["2026-09-20"]);
  });

  it("copes with nothing scheduled", () => {
    expect(selectUpcoming([], TODAY)).toEqual([]);
  });
});

describe("missingSundays", () => {
  it("names the next four Sundays when none exist", () => {
    expect(missingSundays([], TODAY)).toEqual([
      "2026-09-20",
      "2026-09-27",
      "2026-10-04",
      "2026-10-11",
    ]);
  });

  it("skips Sundays that are already scheduled", () => {
    expect(missingSundays(["2026-09-20", "2026-10-04"], TODAY)).toEqual(["2026-09-27", "2026-10-11"]);
  });

  it("counts today when today is a Sunday", () => {
    const sunday = new Date("2026-09-20T09:00:00Z");
    expect(missingSundays([], sunday)[0]).toBe("2026-09-20");
  });

  it("returns nothing when the next four are all scheduled", () => {
    expect(
      missingSundays(["2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11"], TODAY),
    ).toEqual([]);
  });
});

describe("reveal defaults", () => {
  it("puts the reveal on the Friday before a Sunday game", async () => {
    const { defaultTeamsRevealAt } = await import("@/lib/sessions/deadline");
    const revealed = defaultTeamsRevealAt("2026-09-20", {
      default_teams_reveal_days_before: 2,
      default_teams_reveal_time: "23:59",
      timezone: "Europe/Amsterdam",
    });
    // Friday 18 September, 23:59 Amsterdam = 21:59 UTC in summer time.
    expect(revealed).toBe("2026-09-18T21:59:00.000Z");
  });

  it("closes signup the day after the game", async () => {
    const { defaultSignupDeadline } = await import("@/lib/sessions/deadline");
    const closes = defaultSignupDeadline("2026-09-20", {
      default_signup_close_days_after: 1,
      default_signup_deadline_time: "23:59",
      timezone: "Europe/Amsterdam",
    });
    expect(closes).toBe("2026-09-21T21:59:00.000Z");
  });
});

describe("selectPast", () => {
  const all = [
    session("2026-09-06", "completed"),
    session("2026-09-13", "cancelled"),
    session("2026-08-30", "draft"),
    session("2026-09-20"),
    session("2026-09-27"),
  ];

  it("returns every past Sunday newest first, without drafts", () => {
    expect(selectPast(all, new Date("2026-09-22T09:00:00Z")).map((s) => s.date)).toEqual([
      "2026-09-20",
      "2026-09-13",
      "2026-09-06",
    ]);
  });

  it("treats a game as past from 15:00 Amsterdam time on its day", () => {
    const sunday = new Date("2026-09-20T13:00:00Z");
    expect(selectPast(all, sunday).map((s) => s.date)).toContain("2026-09-20");
    expect(selectUpcoming(all, sunday).map((s) => s.date)).not.toContain("2026-09-20");
  });

  it("never overlaps with selectUpcoming", () => {
    const today = new Date("2026-09-22T09:00:00Z");
    const up = new Set(selectUpcoming(all, today).map((s) => s.date));
    expect(selectPast(all, today).some((s) => up.has(s.date))).toBe(false);
  });

  it("is empty when nothing has passed", () => {
    expect(selectPast([session("2026-09-27")], new Date("2026-09-22T09:00:00Z"))).toEqual([]);
  });
});
