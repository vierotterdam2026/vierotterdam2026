import { describe, expect, it } from "vitest";
import {
  expectedUpcomingSundays,
  missingUpcomingSundays,
  selectUpcoming,
} from "@/lib/sessions/upcoming";
import { buildSundayRows, type SundayDefaults } from "@/lib/sessions/sunday-rows";

// All times below are UTC. Amsterdam is UTC+1 in winter and UTC+2 in summer, and
// Home hands a Sunday over to the Feed at 15:00 Amsterdam time on game day.
const at = (iso: string) => new Date(iso);

describe("expectedUpcomingSundays", () => {
  it("starts with the coming Sunday on a Friday", () => {
    expect(expectedUpcomingSundays(at("2026-11-06T10:00:00Z"))).toEqual([
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
  });

  it("still includes today's game on Sunday morning", () => {
    expect(expectedUpcomingSundays(at("2026-11-08T09:00:00Z"))[0]).toBe("2026-11-08");
  });

  it("drops today's game once it has moved to the Feed, and adds the next one", () => {
    // 16:00 UTC is 17:00 in Amsterdam, after the 15:00 hand-over.
    expect(expectedUpcomingSundays(at("2026-11-08T16:00:00Z"))).toEqual([
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
      "2026-12-06",
    ]);
  });

  it("moves on at 15:00 Amsterdam time, not 15:00 UTC", () => {
    // 13:59 UTC is 14:59 in Amsterdam in winter: the game is still on Home.
    expect(expectedUpcomingSundays(at("2026-11-08T13:59:00Z"))[0]).toBe("2026-11-08");
    // 14:00 UTC is 15:00 in Amsterdam: it has gone.
    expect(expectedUpcomingSundays(at("2026-11-08T14:00:00Z"))[0]).toBe("2026-11-15");
  });

  it("returns the requested number of Sundays", () => {
    expect(expectedUpcomingSundays(at("2026-11-06T10:00:00Z"), 2)).toHaveLength(2);
  });
});

describe("missingUpcomingSundays", () => {
  const friday = at("2026-11-06T10:00:00Z");

  it("names everything when nothing exists", () => {
    expect(missingUpcomingSundays([], friday)).toHaveLength(4);
  });

  it("names only the gaps", () => {
    expect(missingUpcomingSundays(["2026-11-08", "2026-11-22"], friday)).toEqual([
      "2026-11-15",
      "2026-11-29",
    ]);
  });

  it("returns nothing when the next four exist", () => {
    const all = expectedUpcomingSundays(friday);
    expect(missingUpcomingSundays(all, friday)).toEqual([]);
  });

  it("ignores Sundays that are already past", () => {
    expect(missingUpcomingSundays(["2026-11-01", "2026-10-25"], friday)).toHaveLength(4);
  });
});

describe("rolling on its own", () => {
  // The scheduled job runs at 15:00 UTC every day. Simulate a long stretch of it,
  // creating whatever is missing each run, and check what a player would see.
  function simulate(startIso: string, days: number) {
    const sessions = new Map<string, string>(); // date -> status
    const seen: { day: string; visible: string[] }[] = [];

    for (let d = 0; d < days; d++) {
      const now = new Date(new Date(startIso).getTime() + d * 24 * 60 * 60 * 1000);

      for (const date of missingUpcomingSundays([...sessions.keys()], now)) {
        sessions.set(date, "signup_open");
      }

      const visible = selectUpcoming(
        [...sessions.entries()].map(([date, status]) => ({ date, status: status as "signup_open" })),
        now,
      ).map((s) => s.date);

      seen.push({ day: now.toISOString().slice(0, 10), visible });
    }
    return seen;
  }

  const year = simulate("2026-10-01T15:00:00Z", 450);

  it("always shows exactly four Sundays, from the very first run", () => {
    for (const { day, visible } of year) {
      expect(visible, day).toHaveLength(4);
    }
  });

  it("only ever shows Sundays", () => {
    for (const { visible } of year) {
      for (const date of visible) expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });

  it("shows them in order, with no gaps between weeks", () => {
    for (const { day, visible } of year) {
      for (let i = 1; i < visible.length; i++) {
        const gap = (Date.parse(visible[i]) - Date.parse(visible[i - 1])) / (24 * 60 * 60 * 1000);
        expect(gap, day).toBe(7);
      }
    }
  });

  it("replaces a Sunday the same afternoon it moves to the Feed", () => {
    const sunday = year.find((entry) => entry.day === "2026-11-08")!;
    expect(sunday.visible).toEqual(["2026-11-15", "2026-11-22", "2026-11-29", "2026-12-06"]);
  });

  it("copes with both clock changes", () => {
    for (const day of ["2026-10-25", "2027-03-28"]) {
      expect(year.find((entry) => entry.day === day)!.visible, day).toHaveLength(4);
    }
  });

  it("catches up after the job misses several days", () => {
    const sessions = ["2026-11-08"];
    const later = at("2026-11-20T15:00:00Z");
    const created = missingUpcomingSundays(sessions, later);
    expect(created).toEqual(["2026-11-22", "2026-11-29", "2026-12-06", "2026-12-13"]);
  });
});

describe("buildSundayRows", () => {
  const group: SundayDefaults = {
    id: "group-1",
    default_start_time: "10:00:00",
    default_end_time: "12:30:00",
    default_venue_id: "venue-1",
    default_signup_close_days_after: 0,
    default_signup_deadline_time: "15:00:00",
    default_teams_reveal_days_before: 1,
    default_teams_reveal_time: "21:00:00",
    timezone: "Europe/Amsterdam",
  };

  const [row] = buildSundayRows(["2026-11-08"], group);

  it("copies kickoff times and venue from the group", () => {
    expect(row).toMatchObject({
      group_id: "group-1",
      date: "2026-11-08",
      start_time: "10:00:00",
      end_time: "12:30:00",
      venue_id: "venue-1",
      status: "signup_open",
    });
  });

  it("closes signup at 15:00 on game day, Amsterdam time", () => {
    expect(row.signup_deadline).toBe("2026-11-08T14:00:00.000Z");
  });

  it("reveals teams at 21:00 on the Saturday before", () => {
    expect(row.teams_reveal_at).toBe("2026-11-07T20:00:00.000Z");
  });

  it("follows the clock change in summer", () => {
    const [summer] = buildSundayRows(["2027-06-06"], group);
    expect(summer.signup_deadline).toBe("2027-06-06T13:00:00.000Z");
    expect(summer.teams_reveal_at).toBe("2027-06-05T19:00:00.000Z");
  });

  it("records who made it, or nobody for the scheduled job", () => {
    expect(buildSundayRows(["2026-11-08"], group, "admin-1")[0].created_by).toBe("admin-1");
    expect(row.created_by).toBeNull();
  });

  it("builds one row per date", () => {
    expect(buildSundayRows(["2026-11-08", "2026-11-15"], group)).toHaveLength(2);
    expect(buildSundayRows([], group)).toEqual([]);
  });
});
