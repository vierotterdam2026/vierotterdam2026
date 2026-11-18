import { describe, expect, it } from "vitest";
import { formatEuro, parseEuroToCents } from "@/lib/payments/money";
import { splitCost } from "@/lib/payments/split";
import { checkPaymentUrl } from "@/lib/payments/link";
import { countNeedingAction } from "@/lib/payments/notifications";
import { adminMayChange, isSelfReported, linkIsLive, playerMayChange, type ShareState } from "@/lib/payments/status";

describe("parseEuroToCents", () => {
  it.each([
    ["2,50", 250],
    ["2.50", 250],
    ["2", 200],
    ["2,5", 250],
    ["0,10", 10],
    ["€ 2,50", 250],
    ["€2.50", 250],
    ["  60  ", 6000],
    ["1000", 100000],
  ])("reads %s as %i cents", (input, cents) => {
    expect(parseEuroToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-2", "2,505", "2,", ",50", "1.000,50", "2 euro", "2,50,1", "€", "999999"])(
    "refuses %j",
    (input) => {
      expect(parseEuroToCents(input)).toBeNull();
    },
  );

  it("never goes through a float", () => {
    // 0.1 + 0.2 style trouble cannot happen with whole cents.
    expect(parseEuroToCents("0,07")! + parseEuroToCents("0,03")!).toBe(10);
  });
});

describe("formatEuro", () => {
  it("formats cents as euros", () => {
    expect(formatEuro(250)).toBe("€2.50");
    expect(formatEuro(6006)).toBe("€60.06");
    expect(formatEuro(5)).toBe("€0.05");
  });
});

describe("splitCost", () => {
  it("rounds up so the cost is always covered", () => {
    // €60 across 26 people is €2.3077 each.
    expect(splitCost(6000, 26)).toEqual({ perPersonCents: 231, collectedCents: 6006, surplusCents: 6 });
  });

  it("has no surplus when it divides exactly", () => {
    expect(splitCost(6000, 20)).toEqual({ perPersonCents: 300, collectedCents: 6000, surplusCents: 0 });
  });

  it("never collects less than the cost", () => {
    for (let people = 1; people <= 60; people++) {
      const split = splitCost(6000, people)!;
      expect(split.collectedCents).toBeGreaterThanOrEqual(6000);
      expect(split.surplusCents).toBeLessThan(people);
    }
  });

  it("splits between one person as the whole cost", () => {
    expect(splitCost(6000, 1)!.perPersonCents).toBe(6000);
  });

  it.each([[0, 5], [-100, 5], [6000, 0], [6000, -1], [60.5, 5], [6000, 2.5]])(
    "has nothing to split for %s across %s",
    (total, people) => {
      expect(splitCost(total, people)).toBeNull();
    },
  );
});

describe("checkPaymentUrl", () => {
  it("accepts the Tikkie link and reports the host", () => {
    const result = checkPaymentUrl("https://tikkie.me/pay/example-request-id");
    expect(result).toEqual({ ok: true, url: "https://tikkie.me/pay/example-request-id", host: "tikkie.me" });
  });

  it("trims whitespace and drops a leading www", () => {
    const result = checkPaymentUrl("  https://www.paypal.me/someone/2.50  ");
    expect(result).toMatchObject({ ok: true, host: "paypal.me" });
  });

  it.each([
    ["", "Paste"],
    ["http://tikkie.me/pay/abc", "https"],
    ["javascript:alert(1)", "https"],
    ["data:text/html,hi", "https"],
    ["ftp://tikkie.me/x", "https"],
    ["tikkie.me/pay/abc", "does not look"],
    ["https://tikkie.me/pay/a b", "space"],
    ["https://tikkie.me@evil.example/pay", "login"],
    ["https://user:pass@tikkie.me/pay", "login"],
  ])("refuses %j", (input, reason) => {
    const result = checkPaymentUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });

  it("refuses an absurdly long link", () => {
    expect(checkPaymentUrl(`https://tikkie.me/${"a".repeat(600)}`).ok).toBe(false);
  });
});

describe("who may change a share", () => {
  const me = "player-1";
  const requested: ShareState = { status: "requested", playerId: me, markedBy: null };
  const selfPaid: ShareState = { status: "paid", playerId: me, markedBy: me };
  const confirmed: ShareState = { status: "paid", playerId: me, markedBy: "admin-1" };
  const waived: ShareState = { status: "waived", playerId: me, markedBy: "admin-1" };

  it("tells a claim from a confirmation by who marked it", () => {
    expect(isSelfReported(selfPaid)).toBe(true);
    expect(isSelfReported(confirmed)).toBe(false);
    expect(isSelfReported(requested)).toBe(false);
  });

  it("lets a player say they have paid", () => {
    expect(playerMayChange(requested, "paid")).toEqual({ ok: true });
  });

  it("lets a player take that back if they tapped it by mistake", () => {
    expect(playerMayChange(selfPaid, "requested")).toEqual({ ok: true });
  });

  it("does not let a player undo an organiser's confirmation", () => {
    const result = playerMayChange(confirmed, "requested");
    expect(result.ok).toBe(false);
  });

  it("does not let a player touch a waived share", () => {
    expect(playerMayChange(waived, "paid").ok).toBe(false);
    expect(playerMayChange(waived, "requested").ok).toBe(false);
  });

  it("does not let a player waive anything, even their own", () => {
    expect(playerMayChange(requested, "waived").ok).toBe(false);
  });

  it("explains rather than silently ignoring a repeat", () => {
    const result = playerMayChange(selfPaid, "paid");
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("already") });
  });

  it("lets an organiser do anything", () => {
    expect(adminMayChange()).toEqual({ ok: true });
  });
});

describe("linkIsLive", () => {
  const tz = "Europe/Amsterdam";

  it("is live when there is no expiry", () => {
    expect(linkIsLive(null, new Date("2030-01-01T12:00:00Z"), tz)).toBe(true);
  });

  it("is live before the last day and on it", () => {
    expect(linkIsLive("2026-12-02", new Date("2026-12-01T12:00:00Z"), tz)).toBe(true);
    expect(linkIsLive("2026-12-02", new Date("2026-12-02T12:00:00Z"), tz)).toBe(true);
  });

  it("has expired the day after", () => {
    expect(linkIsLive("2026-12-02", new Date("2026-12-03T12:00:00Z"), tz)).toBe(false);
  });

  it("reads the day in group time, not UTC", () => {
    // 23:30 UTC on the 2nd is already 00:30 on the 3rd in Amsterdam.
    expect(linkIsLive("2026-12-02", new Date("2026-12-02T23:30:00Z"), tz)).toBe(false);
    // 22:30 UTC on the 2nd is still 23:30 on the 2nd in Amsterdam.
    expect(linkIsLive("2026-12-02", new Date("2026-12-02T22:30:00Z"), tz)).toBe(true);
  });
});

describe("countNeedingAction", () => {
  it("counts requests that are still waiting on the player", () => {
    expect(countNeedingAction([{ status: "requested" }, { status: "requested" }])).toBe(2);
  });

  it("does not count one the player says they have paid", () => {
    // It is waiting on an organiser to confirm, not on them.
    expect(countNeedingAction([{ status: "paid" }, { status: "requested" }])).toBe(1);
  });

  it("is zero when there is nothing to do", () => {
    expect(countNeedingAction([])).toBe(0);
    expect(countNeedingAction([{ status: "paid" }, { status: "waived" }])).toBe(0);
  });
});
