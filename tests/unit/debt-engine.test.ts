/**
 * Debt engine unit tests (SPEC §59, docs/debt-engine.md §8).
 * Written before the implementation; every change to debt maths starts here.
 */
import { describe, expect, it } from "vitest";
import { annuityPayment, generateAnnuitySchedule } from "@/lib/finance/annuity";
import { generateDifferentialSchedule } from "@/lib/finance/differential";
import { planEarlyRepayment } from "@/lib/finance/early-repayment";
import {
  generateInstallmentSchedule,
  knownTotalSchedule,
  manualSchedule,
} from "@/lib/finance/installment";
import { resolveFeeStructure } from "@/lib/finance/microloan";
import { money } from "@/lib/finance/money";
import { dueDates, periodRate, scheduleTotals, validateSchedule, type ScheduleLine } from "@/lib/finance/schedule";

const fixed = (d: { toFixed(n: number): string }) => d.toFixed(2);
const col = (lines: ScheduleLine[], key: "principal" | "interest" | "fees" | "total" | "closingPrincipal") =>
  lines.map((l) => fixed(l[key]));

describe("schedule primitives", () => {
  it("builds monthly due dates that clamp to month end and keep the payment day", () => {
    expect(dueDates("2026-01-31", 4, 31)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(dueDates("2024-01-30", 3, 30)).toEqual(["2024-01-30", "2024-02-29", "2024-03-30"]);
  });

  it("computes period rates for each day-count convention", () => {
    expect(periodRate("24", "2026-01-15", "2026-02-15", "MONTHLY_30_360").toString()).toBe("0.02");
    // 36.5% a year over 31 days = 3.1%
    expect(periodRate("36.5", "2026-01-01", "2026-02-01", "ACTUAL_365").toString()).toBe("0.031");
    expect(periodRate("36", "2026-01-01", "2026-01-31", "ACTUAL_360").toString()).toBe("0.03");
    // Leap-year split: 17 days of 2023 (/365) + 14 days of 2024 (/366)
    const actAct = periodRate("36.6", "2023-12-15", "2024-01-15", "ACTUAL_ACTUAL");
    const expected = money("0.366").times(17).div(365).plus(money("0.366").times(14).div(366));
    expect(actAct.toDecimalPlaces(12).toString()).toBe(expected.toDecimalPlaces(12).toString());
  });

  it("validates a schedule against the principal it must amortise", () => {
    const lines = generateDifferentialSchedule({
      principal: "1000",
      annualRatePercent: "12",
      count: 3,
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
    });
    expect(validateSchedule(lines, "1000")).toEqual([]);
    expect(validateSchedule(lines, "1001").length).toBeGreaterThan(0);
  });
});

describe("differential loan (SPEC §17)", () => {
  // Debt A: 85,800,000 UZS. Rate/term are placeholders until the real contract is entered.
  const lines = generateDifferentialSchedule({
    principal: "85800000",
    annualRatePercent: "24",
    count: 12,
    periodStart: "2026-01-10",
    firstDueDate: "2026-02-10",
  });

  it("splits principal equally and charges interest on the remaining balance", () => {
    expect(lines).toHaveLength(12);
    expect(new Set(col(lines, "principal"))).toEqual(new Set(["7150000.00"]));
    expect(fixed(lines[0]!.interest)).toBe("1716000.00"); // 85.8M × 2%
    expect(fixed(lines[0]!.total)).toBe("8866000.00");
    expect(fixed(lines[11]!.interest)).toBe("143000.00"); // 7.15M × 2%
    expect(fixed(lines[11]!.closingPrincipal)).toBe("0.00");
  });

  it("totals exactly", () => {
    const totals = scheduleTotals(lines);
    expect(fixed(totals.principal)).toBe("85800000.00");
    expect(fixed(totals.interest)).toBe("11154000.00"); // 2% × 7.15M × (12+…+1)
    expect(validateSchedule(lines, "85800000")).toEqual([]);
  });

  it("puts the rounding residual on the last line", () => {
    const odd = generateDifferentialSchedule({
      principal: "1000",
      annualRatePercent: "0",
      count: 3,
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
    });
    expect(col(odd, "principal")).toEqual(["333.33", "333.33", "333.34"]);
  });

  it("supports whole-sum rounding (roundingScale 0)", () => {
    const whole = generateDifferentialSchedule({
      principal: "1000000",
      annualRatePercent: "25",
      count: 3,
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
      roundingScale: 0,
    });
    expect(col(whole, "principal")).toEqual(["333333.00", "333333.00", "333334.00"]);
    expect(fixed(whole[0]!.interest)).toBe("20833.00"); // 1,000,000 × 25%/12 = 20,833.33
  });

  it("uses actual days with ACTUAL_365", () => {
    const act = generateDifferentialSchedule({
      principal: "1200000",
      annualRatePercent: "36.5",
      count: 2,
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
      dayCount: "ACTUAL_365",
    });
    expect(fixed(act[0]!.interest)).toBe("37200.00"); // 31 days
    expect(fixed(act[1]!.interest)).toBe("16800.00"); // 600,000 × 0.1% × 28 days
  });

  it("can keep a fixed principal part (reduce term)", () => {
    const shorter = generateDifferentialSchedule({
      principal: "25000",
      annualRatePercent: "12",
      principalPerPeriod: "10000",
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
    });
    expect(col(shorter, "principal")).toEqual(["10000.00", "10000.00", "5000.00"]);
  });

  it("adds per-line fees without touching principal", () => {
    const withFee = generateDifferentialSchedule({
      principal: "1000",
      annualRatePercent: "0",
      count: 2,
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
      lineFees: ["50"],
    });
    expect(col(withFee, "fees")).toEqual(["50.00", "0.00"]);
    expect(col(withFee, "total")).toEqual(["550.00", "500.00"]);
    expect(fixed(scheduleTotals(withFee).principal)).toBe("1000.00");
  });
});

describe("annuity loan (SPEC §18)", () => {
  it("matches the textbook payment", () => {
    // 10,000 at 1%/month over 12 months → 888.49
    expect(annuityPayment("10000", money("0.01"), 12).toFixed(2)).toBe("888.49");
    expect(annuityPayment("12000", money(0), 12).toFixed(2)).toBe("1000.00");
  });

  it("generates equal payments that fully amortise the principal", () => {
    const lines = generateAnnuitySchedule({
      principal: "10000",
      annualRatePercent: "12",
      count: 12,
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
    });
    expect(lines).toHaveLength(12);
    expect(col(lines, "total").slice(0, 11)).toEqual(Array(11).fill("888.49"));
    expect(fixed(lines[0]!.interest)).toBe("100.00");
    expect(fixed(lines[0]!.principal)).toBe("788.49");
    expect(fixed(lines[11]!.closingPrincipal)).toBe("0.00");
    expect(validateSchedule(lines, "10000")).toEqual([]);
    // last payment absorbs the rounding residual (a few tiyin at most)
    expect(lines[11]!.total.minus("888.49").abs().lessThan("0.10")).toBe(true);
  });

  it("handles a zero rate", () => {
    const lines = generateAnnuitySchedule({ principal: "1200", annualRatePercent: "0", count: 12, periodStart: "2026-01-01", firstDueDate: "2026-02-01" });
    expect(new Set(col(lines, "total"))).toEqual(new Set(["100.00"]));
  });

  it("can keep a fixed payment and shorten the term", () => {
    const lines = generateAnnuitySchedule({
      principal: "5000",
      annualRatePercent: "12",
      fixedPayment: "888.49",
      periodStart: "2026-01-01",
      firstDueDate: "2026-02-01",
    });
    expect(lines.length).toBe(6);
    expect(validateSchedule(lines, "5000")).toEqual([]);
  });

  it("rejects a payment that does not cover interest", () => {
    expect(() =>
      generateAnnuitySchedule({ principal: "10000", annualRatePercent: "24", fixedPayment: "100", periodStart: "2026-01-01", firstDueDate: "2026-02-01" }),
    ).toThrow(/проценты/);
  });
});

describe("interest-free installment (SPEC §19)", () => {
  it("splits the car installment remaining amount into fixed monthly payments", () => {
    // Debt B: 163,593,696 − 49,986,962.63 = 113,606,733.37 remaining
    const remaining = money("163593696").minus("49986962.63");
    expect(remaining.toFixed(2)).toBe("113606733.37");
    const lines = generateInstallmentSchedule({ principal: remaining, fixedAmount: "3500000", firstDueDate: "2026-10-15" });
    expect(lines).toHaveLength(33);
    expect(fixed(lines[0]!.total)).toBe("3500000.00");
    expect(fixed(lines[32]!.principal)).toBe("1606733.37");
    expect(new Set(col(lines, "interest"))).toEqual(new Set(["0.00"]));
    expect(validateSchedule(lines, remaining)).toEqual([]);
  });

  it("splits evenly by count with the residual last", () => {
    const lines = generateInstallmentSchedule({ principal: "100", count: 3, firstDueDate: "2026-10-15" });
    expect(col(lines, "principal")).toEqual(["33.33", "33.33", "33.34"]);
  });

  it("accepts irregular manual lines on different dates", () => {
    const lines = manualSchedule(
      [
        { dueDate: "2026-11-01", principal: "1000000" },
        { dueDate: "2026-12-20", principal: "2500000.50", interest: "10000" },
      ],
      "3500000.50",
    );
    expect(col(lines, "closingPrincipal")).toEqual(["2500000.50", "0.00"]);
    expect(col(lines, "total")).toEqual(["1000000.00", "2510000.50"]);
  });

  it("rejects manual lines that do not add up", () => {
    expect(() => manualSchedule([{ dueDate: "2026-11-01", principal: "10" }], "11")).toThrow(/должен давать в сумме/);
    expect(() =>
      manualSchedule(
        [
          { dueDate: "2026-12-01", principal: "5" },
          { dueDate: "2026-11-01", principal: "5" },
        ],
        "10",
      ),
    ).toThrow(/по порядку/);
  });
});

describe("microloan fees (SPEC §19A)", () => {
  const base = { contractPrincipal: "2000000", fee: "100000" };

  it("ADDED_ON_TOP: full principal received, fee repaid on top", () => {
    const r = resolveFeeStructure({ ...base, feeMode: "ADDED_ON_TOP" });
    expect([r.principalBasis, r.netReceived, r.scheduledFee, r.withheldFee].map(fixed)).toEqual(["2000000.00", "2000000.00", "100000.00", "0.00"]);
    expect(fixed(r.totalRepayment)).toBe("2100000.00");
  });

  it("DEDUCTED_FROM_DISBURSEMENT: net received differs from contract principal", () => {
    const r = resolveFeeStructure({ ...base, feeMode: "DEDUCTED_FROM_DISBURSEMENT" });
    expect([r.principalBasis, r.netReceived, r.scheduledFee, r.withheldFee].map(fixed)).toEqual(["2000000.00", "1900000.00", "0.00", "100000.00"]);
    expect(fixed(r.totalRepayment)).toBe("2000000.00");
  });

  it("FINANCED_INTO_DEBT: fee becomes part of the principal basis", () => {
    const r = resolveFeeStructure({ ...base, feeMode: "FINANCED_INTO_DEBT" });
    expect([r.principalBasis, r.netReceived, r.scheduledFee].map(fixed)).toEqual(["2100000.00", "2000000.00", "0.00"]);
  });

  it("CUSTOM and NONE keep what the user entered", () => {
    const custom = resolveFeeStructure({ contractPrincipal: "2000000", fee: "0", feeMode: "CUSTOM", netReceived: "1950000" });
    expect(fixed(custom.netReceived)).toBe("1950000.00");
    const none = resolveFeeStructure({ contractPrincipal: "2000000", feeMode: "NONE" });
    expect(fixed(none.totalRepayment)).toBe("2000000.00");
  });

  it("known total repayment: never invents an interest formula", () => {
    const lines = knownTotalSchedule("2000000", [{ dueDate: "2026-11-01", total: "2100000" }]);
    expect(col(lines, "principal")).toEqual(["2000000.00"]);
    expect(col(lines, "interest")).toEqual(["0.00"]);
    expect(col(lines, "fees")).toEqual(["100000.00"]); // "interest & fees (not itemised)"
  });

  it("known total repayment over several dates allocates principal pro rata", () => {
    const lines = knownTotalSchedule("1000", [
      { dueDate: "2026-11-01", total: "600" },
      { dueDate: "2026-12-01", total: "600" },
    ]);
    expect(col(lines, "principal")).toEqual(["500.00", "500.00"]);
    expect(col(lines, "fees")).toEqual(["100.00", "100.00"]);
    expect(() => knownTotalSchedule("1000", [{ dueDate: "2026-11-01", total: "900" }])).toThrow(/меньше суммы долга/);
  });
});

describe("early repayment (SPEC §24)", () => {
  const terms = {
    annualRatePercent: "12",
    periodStart: "2026-01-01",
    firstDueDate: "2026-02-01",
  };

  it("reduce term on a differential loan keeps the principal part and shortens the schedule", () => {
    const original = generateDifferentialSchedule({ ...terms, principal: "12000", count: 12 });
    const plan = planEarlyRepayment({
      repaymentType: "DIFFERENTIAL",
      strategy: "REDUCE_TERM",
      futureLines: original,
      principalAfter: "6000",
      ...terms,
    });
    expect(plan.lines).toHaveLength(6);
    expect(new Set(col(plan.lines, "principal"))).toEqual(new Set(["1000.00"]));
    expect(plan.oldPayoffDate).toBe("2027-01-01");
    expect(plan.newPayoffDate).toBe("2026-07-01");
    expect(plan.monthsReduced).toBe(6);
    expect(plan.interestSaved.greaterThan(0)).toBe(true);
  });

  it("reduce payment keeps the end date and lowers each payment", () => {
    const original = generateAnnuitySchedule({ ...terms, principal: "10000", count: 12 });
    const plan = planEarlyRepayment({
      repaymentType: "ANNUITY",
      strategy: "REDUCE_PAYMENT",
      futureLines: original,
      principalAfter: "5000",
      ...terms,
    });
    expect(plan.lines).toHaveLength(12);
    expect(plan.newPayoffDate).toBe(plan.oldPayoffDate);
    expect(plan.lines[0]!.total.lessThan(original[0]!.total)).toBe(true);
    expect(validateSchedule(plan.lines, "5000")).toEqual([]);
  });

  it("reduce term on an interest-free installment trims from the end", () => {
    const original = generateInstallmentSchedule({ principal: "113606733.37", fixedAmount: "3500000", firstDueDate: "2026-10-15" });
    const plan = planEarlyRepayment({
      repaymentType: "INTEREST_FREE",
      strategy: "REDUCE_TERM",
      futureLines: original,
      principalAfter: "103606733.37",
      firstDueDate: "2026-10-15",
    });
    expect(plan.lines).toHaveLength(30);
    expect(plan.monthsReduced).toBe(3);
    expect(validateSchedule(plan.lines, "103606733.37")).toEqual([]);
  });

  it("paying everything off leaves no future lines", () => {
    const original = generateInstallmentSchedule({ principal: "1000", count: 2, firstDueDate: "2026-10-15" });
    const plan = planEarlyRepayment({ repaymentType: "INTEREST_FREE", strategy: "REDUCE_TERM", futureLines: original, principalAfter: "0", firstDueDate: "2026-10-15" });
    expect(plan.lines).toEqual([]);
    expect(plan.newPayoffDate).toBeNull();
  });
});
