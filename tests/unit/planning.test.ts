import { describe, expect, it } from "vitest";
import { budgetStatus } from "@/lib/finance/budget";
import { combineInBase, convert, findRate } from "@/lib/finance/fx";
import { nextOccurrence, occurrencesBetween } from "@/lib/finance/recurrence";

describe("recurrence", () => {
  it("monthly on the 31st clamps to short months and keeps the day", () => {
    const rule = { frequency: "MONTHLY" as const, interval: 1, startDate: "2026-01-31" };
    expect(occurrencesBetween(rule, "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("monthly on the 29th in a leap year", () => {
    const rule = { frequency: "MONTHLY" as const, interval: 1, startDate: "2024-01-29" };
    expect(occurrencesBetween(rule, "2024-02-01", "2024-03-31")).toEqual(["2024-02-29", "2024-03-29"]);
  });

  it("respects interval, range bounds and start/end dates", () => {
    const quarterly = { frequency: "MONTHLY" as const, interval: 3, startDate: "2026-01-15", endDate: "2026-12-31" };
    expect(occurrencesBetween(quarterly, "2026-03-01", "2027-12-31")).toEqual(["2026-04-15", "2026-07-15", "2026-10-15"]);
    expect(occurrencesBetween(quarterly, "2025-01-01", "2026-01-14")).toEqual([]);
    expect(occurrencesBetween(quarterly, "2026-01-15", "2026-01-15")).toEqual(["2026-01-15"]);
  });

  it("weekly and every other week", () => {
    const weekly = { frequency: "WEEKLY" as const, interval: 1, startDate: "2026-10-02" };
    expect(occurrencesBetween(weekly, "2026-10-01", "2026-10-20")).toEqual(["2026-10-02", "2026-10-09", "2026-10-16"]);
    const biweekly = { frequency: "WEEKLY" as const, interval: 2, startDate: "2026-10-02" };
    expect(occurrencesBetween(biweekly, "2026-10-10", "2026-11-01")).toEqual(["2026-10-16", "2026-10-30"]);
  });

  it("yearly on 29 February falls on 28 February in other years", () => {
    const rule = { frequency: "YEARLY" as const, interval: 1, startDate: "2024-02-29" };
    expect(occurrencesBetween(rule, "2024-01-01", "2028-12-31")).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("finds the next occurrence", () => {
    const rule = { frequency: "MONTHLY" as const, interval: 1, startDate: "2026-01-05" };
    expect(nextOccurrence(rule, "2026-10-06")).toBe("2026-11-05");
    expect(nextOccurrence(rule, "2026-10-05")).toBe("2026-10-05");
    expect(nextOccurrence({ ...rule, endDate: "2026-10-01" }, "2026-10-06")).toBeNull();
  });

  it("stays fast for rules that started long ago", () => {
    const rule = { frequency: "WEEKLY" as const, interval: 1, startDate: "2000-01-03" };
    expect(occurrencesBetween(rule, "2026-10-01", "2026-10-31")).toHaveLength(4);
  });
});

describe("budget status (SPEC §38)", () => {
  it("Fuel — 800,000 / 1,500,000 — 53%", () => {
    const s = budgetStatus({ spent: "800000", limit: "1500000" });
    expect(s.percent.toFixed(0)).toBe("53");
    expect(s.remaining.toFixed(2)).toBe("700000.00");
    expect(s.state).toBe("UNDER");
  });

  it("warns near the limit and flags overspending", () => {
    expect(budgetStatus({ spent: "1200000", limit: "1500000" }).state).toBe("NEAR");
    const over = budgetStatus({ spent: "1650000", limit: "1500000" });
    expect(over.state).toBe("OVER");
    expect(over.remaining.toFixed(2)).toBe("-150000.00");
    expect(over.percent.toFixed(0)).toBe("110");
  });
});

describe("manual exchange rates (SPEC §46)", () => {
  const rates = [
    { fromCurrency: "USD", toCurrency: "UZS", rate: "12650", effectiveDate: "2026-09-01" },
    { fromCurrency: "USD", toCurrency: "UZS", rate: "12700", effectiveDate: "2026-09-20" },
    { fromCurrency: "UZS", toCurrency: "EUR", rate: "0.0000725", effectiveDate: "2026-09-20" },
  ];

  it("uses the latest rate on or before the date", () => {
    expect(findRate(rates, "USD", "UZS", "2026-09-10")?.rate.toString()).toBe("12650");
    expect(findRate(rates, "USD", "UZS", "2026-09-30")?.rate.toString()).toBe("12700");
    expect(findRate(rates, "USD", "UZS", "2026-08-01")).toBeNull();
  });

  it("inverts a reverse rate, never invents one", () => {
    const eur = findRate(rates, "EUR", "UZS", "2026-09-30");
    expect(eur?.rate.toDecimalPlaces(2).toString()).toBe("13793.1");
    expect(findRate(rates, "RUB", "UZS", "2026-09-30")).toBeNull();
    expect(convert("1000.00", findRate(rates, "USD", "UZS", "2026-09-30")!.rate).toFixed(2)).toBe("12700000.00");
  });

  it("combines totals only when every currency has a rate", () => {
    const ok = combineInBase([{ currency: "UZS", amount: "1000000" }, { currency: "USD", amount: "100" }], "UZS", rates, "2026-09-30");
    expect(ok.total?.toFixed(2)).toBe("2270000.00");
    expect(ok.missing).toEqual([]);
    const missing = combineInBase([{ currency: "UZS", amount: "1" }, { currency: "RUB", amount: "100" }], "UZS", rates, "2026-09-30");
    expect(missing.total).toBeNull();
    expect(missing.missing).toEqual(["RUB"]);
  });
});

describe("monthly equivalent of recurring items", () => {
  it("normalises weekly, monthly and yearly amounts", async () => {
    const { monthlyEquivalent } = await import("@/lib/finance/recurrence");
    expect(monthlyEquivalent("150000", "MONTHLY", 1).toFixed(2)).toBe("150000.00");
    expect(monthlyEquivalent("300000", "MONTHLY", 3).toFixed(2)).toBe("100000.00");
    expect(monthlyEquivalent("1200000", "YEARLY", 1).toFixed(2)).toBe("100000.00");
    expect(monthlyEquivalent("12000", "WEEKLY", 1).toFixed(2)).toBe("52000.00");
  });
});
