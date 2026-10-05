import { describe, expect, it } from "vitest";
import { goalProgress, monthsUntil } from "@/lib/finance/goals";

describe("savings goals", () => {
  it("counts started months", () => {
    expect(monthsUntil("2026-10-05", "2027-03-01")).toBe(5);
    expect(monthsUntil("2026-10-05", "2027-03-05")).toBe(5);
    expect(monthsUntil("2026-10-05", "2027-03-06")).toBe(6);
    expect(monthsUntil("2026-10-05", "2026-10-20")).toBe(1);
  });

  it("monthly amount rounds up so the goal is reached", () => {
    expect(goalProgress({ target: "10000000.00", saved: "2500000.00", today: "2026-10-05", targetDate: "2027-05-01" })).toEqual({
      saved: "2500000.00",
      remaining: "7500000.00",
      percent: "25.0",
      monthsLeft: 7,
      perMonth: "1071428.58",
      state: "on-track",
    });
  });

  it("achieved, no date, overdue", () => {
    expect(goalProgress({ target: "100.00", saved: "150.00", today: "2026-10-05", targetDate: "2027-01-01" })).toMatchObject({ state: "achieved", percent: "100.0", remaining: "0.00", perMonth: null });
    expect(goalProgress({ target: "100.00", saved: "33.33", today: "2026-10-05", targetDate: null })).toMatchObject({ state: "no-date", percent: "33.3" });
    expect(goalProgress({ target: "100.00", saved: "-5.00", today: "2026-10-05", targetDate: "2026-10-01" })).toMatchObject({ state: "overdue", saved: "0.00", perMonth: "100.00" });
  });
});
