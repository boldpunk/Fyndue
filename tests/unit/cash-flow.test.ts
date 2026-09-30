/**
 * Cash-flow calculations (SPEC §13, §14, §37). Written before the
 * implementation.
 */
import { describe, expect, it } from "vitest";
import { debtToIncomeRatio, monthChange, projectedBalance, safeToSpend } from "@/lib/finance/cash-flow";

const today = "2026-10-10";
const monthEnd = "2026-10-31";

describe("safe to spend (SPEC §13)", () => {
  const obligations = [
    { dueDate: "2026-10-08", amount: "500000" }, // overdue — still mandatory
    { dueDate: "2026-10-15", amount: "3500000" },
    { dueDate: "2026-10-22", amount: "4099333.33" },
    { dueDate: "2026-11-15", amount: "3500000" },
  ];

  it("subtracts payments due before the next expected income", () => {
    const r = safeToSpend({
      balance: "12000000",
      obligations,
      expectedIncome: [
        { date: "2026-10-05", amount: "1000" }, // in the past: not "next"
        { date: "2026-10-20", amount: "8000000" },
        { date: "2026-10-25", amount: "500000" },
      ],
      today,
      monthEnd,
    });
    expect(r.basis).toBe("NEXT_INCOME");
    expect(r.horizonDate).toBe("2026-10-20");
    expect(r.obligationsTotal.toFixed(2)).toBe("4000000.00");
    expect(r.amount.toFixed(2)).toBe("8000000.00");
    expect(r.obligationCount).toBe(2);
  });

  it("falls back to the remaining payments of the month when no income is expected", () => {
    const r = safeToSpend({ balance: "12000000", obligations, expectedIncome: [], today, monthEnd });
    expect(r.basis).toBe("MONTH_END");
    expect(r.horizonDate).toBe(monthEnd);
    expect(r.obligationsTotal.toFixed(2)).toBe("8099333.33");
    expect(r.amount.toFixed(2)).toBe("3900666.67");
  });

  it("can go negative, and says so", () => {
    const r = safeToSpend({ balance: "1000000", obligations, expectedIncome: [], today, monthEnd });
    expect(r.amount.toFixed(2)).toBe("-7099333.33");
    expect(r.isShort).toBe(true);
  });

  it("income due today counts as next income (payments due today are included)", () => {
    const r = safeToSpend({
      balance: "100",
      obligations: [{ dueDate: "2026-10-10", amount: "30" }],
      expectedIncome: [{ date: "2026-10-10", amount: "50" }],
      today,
      monthEnd,
    });
    expect(r.horizonDate).toBe("2026-10-10");
    expect(r.obligationsTotal.toFixed(2)).toBe("30.00");
  });
});

describe("projected balance (SPEC §14)", () => {
  it("current balance + expected income − planned expenses − scheduled debt payments", () => {
    const r = projectedBalance({
      balance: "12000000",
      expectedIncome: [
        { date: "2026-10-20", amount: "8000000" },
        { date: "2026-11-02", amount: "8000000" }, // after the horizon
      ],
      plannedExpenses: [{ date: "2026-10-12", amount: "150000" }],
      obligations: [
        { dueDate: "2026-10-08", amount: "500000" },
        { dueDate: "2026-10-15", amount: "3500000" },
        { dueDate: "2026-11-15", amount: "3500000" },
      ],
      until: monthEnd,
    });
    expect(r.expectedIncomeTotal.toFixed(2)).toBe("8000000.00");
    expect(r.plannedExpensesTotal.toFixed(2)).toBe("150000.00");
    expect(r.obligationsTotal.toFixed(2)).toBe("4000000.00");
    expect(r.projected.toFixed(2)).toBe("15850000.00");
  });

  it("with nothing planned it equals the current balance", () => {
    const r = projectedBalance({ balance: "49986962.63", expectedIncome: [], plannedExpenses: [], obligations: [], until: monthEnd });
    expect(r.projected.toFixed(2)).toBe("49986962.63");
  });
});

describe("month comparison", () => {
  it("returns the change and percentage", () => {
    const c = monthChange("1200000", "1000000");
    expect(c.delta.toFixed(2)).toBe("200000.00");
    expect(c.percent?.toFixed(1)).toBe("20.0");
    expect(monthChange("800", "1000").percent?.toFixed(1)).toBe("-20.0");
  });

  it("has no percentage when the previous month is zero", () => {
    expect(monthChange("500", "0").percent).toBeNull();
  });
});

describe("debt-to-income ratio (SPEC §37)", () => {
  it("monthly debt payments / monthly actual income × 100", () => {
    expect(debtToIncomeRatio("3500000", "10000000")?.toFixed(2)).toBe("35.00");
  });

  it("is N/A (null) when income is zero — never divides by zero", () => {
    expect(debtToIncomeRatio("3500000", "0")).toBeNull();
  });
});
