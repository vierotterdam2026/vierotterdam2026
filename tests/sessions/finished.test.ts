import { describe, expect, it } from "vitest";
import { COMPLETABLE, selectFinished } from "@/lib/sessions/finished";
import { canTransition } from "@/lib/sessions/state";
import type { SessionStatus } from "@/lib/sessions/state";

const at = (iso: string) => new Date(iso);
const s = (date: string, status: SessionStatus) => ({ date, status });

describe("selectFinished", () => {
  const now = at("2026-11-16T10:00:00+01:00"); // Monday

  it("picks a played Sunday from the day after", () => {
    expect(selectFinished([s("2026-11-15", "teams_published")], now)).toHaveLength(1);
    expect(selectFinished([s("2026-11-08", "in_progress")], now)).toHaveLength(1);
  });

  it("leaves game day itself alone", () => {
    const sunday = at("2026-11-15T20:00:00+01:00");
    expect(selectFinished([s("2026-11-15", "teams_published")], sunday)).toHaveLength(0);
  });

  it("leaves future Sundays alone", () => {
    expect(selectFinished([s("2026-11-22", "teams_published")], now)).toHaveLength(0);
  });

  it("only completes Sundays that were actually played", () => {
    const others: SessionStatus[] = ["draft", "signup_open", "signup_closed", "teams_generated", "cancelled", "completed"];
    for (const status of others) {
      expect(selectFinished([s("2026-11-08", status)], now)).toHaveLength(0);
    }
  });

  it("uses Amsterdam time at the day boundary", () => {
    // 23:30 UTC on Sunday is already Monday 00:30 in Amsterdam.
    const lateSunday = at("2026-11-15T23:30:00Z");
    expect(selectFinished([s("2026-11-15", "teams_published")], lateSunday)).toHaveLength(1);
  });

  it("every completable status may legally move to completed", () => {
    for (const status of COMPLETABLE) expect(canTransition(status, "completed")).toBe(true);
  });
});
