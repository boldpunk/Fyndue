import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  dbToLocalDate,
  isLocalDate,
  localDateToDb,
  monthBounds,
  parseYearMonth,
  shiftYearMonth,
  todayIn,
} from "@/lib/finance/dates";

describe("dates", () => {
  it("validates calendar dates including leap years", () => {
    expect(isLocalDate("2024-02-29")).toBe(true);
    expect(isLocalDate("2025-02-29")).toBe(false);
    expect(isLocalDate("2100-02-29")).toBe(false);
    expect(isLocalDate("2000-02-29")).toBe(true);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-1-01")).toBe(false);
  });

  it("round-trips through the database representation without shifting", () => {
    for (const d of ["2026-01-01", "2026-10-15", "2024-02-29", "2026-12-31"]) {
      expect(dbToLocalDate(localDateToDb(d))).toBe(d);
    }
  });

  it("computes today in Asia/Tashkent (UTC+5) across the UTC day boundary", () => {
    // 20:30 UTC on 14 Oct is already 01:30 on 15 Oct in Tashkent.
    expect(todayIn("Asia/Tashkent", new Date("2026-10-14T20:30:00Z"))).toBe("2026-10-15");
    expect(todayIn("UTC", new Date("2026-10-14T20:30:00Z"))).toBe("2026-10-14");
  });

  it("clamps month-end dates", () => {
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonthsClamped("2025-03-31", 1)).toBe("2025-04-30");
    expect(addMonthsClamped("2025-12-15", 1)).toBe("2026-01-15");
    expect(addMonthsClamped("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonthsClamped("2025-02-28", 1, 31)).toBe("2025-03-31");
  });

  it("counts days across month and year boundaries", () => {
    expect(daysBetween("2026-10-01", "2026-10-15")).toBe(14);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-10-15", "2026-10-14")).toBe(-1);
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("builds month bounds and parses year-month params", () => {
    expect(monthBounds({ year: 2026, month: 12 })).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
    expect(parseYearMonth("2026-09")).toEqual({ year: 2026, month: 9 });
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth(undefined)).toBeNull();
    expect(shiftYearMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});
