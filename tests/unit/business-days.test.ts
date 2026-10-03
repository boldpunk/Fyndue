import { describe, expect, it } from "vitest";
import { isBusinessDay, nextBusinessDay } from "@/lib/finance/business-days";
import { buildDebtPlan } from "@/lib/finance/debt-plan";
import { planEarlyRepayment } from "@/lib/finance/early-repayment";
import { generateInstallmentSchedule } from "@/lib/finance/installment";

describe("bank working days", () => {
  it("moves Saturdays, Sundays and public holidays to the next working day", () => {
    expect(nextBusinessDay("2027-01-23")).toBe("2027-01-25"); // Saturday → Monday
    expect(nextBusinessDay("2027-05-23")).toBe("2027-05-24"); // Sunday → Monday
    expect(nextBusinessDay("2026-10-23")).toBe("2026-10-23"); // Friday stays
    expect(nextBusinessDay("2029-03-21")).toBe("2029-03-22"); // Navruz (Wednesday)
    expect(nextBusinessDay("2026-08-29")).toBe("2026-08-31"); // Saturday → Monday 31 Aug (1 Sep is a holiday, not reached)
    expect(nextBusinessDay("2026-12-31")).toBe("2026-12-31");
    expect(nextBusinessDay("2028-12-30")).toBe("2029-01-02"); // Sat, Sun, 1 Jan → Tuesday
    expect(isBusinessDay("2026-10-01")).toBe(false); // Teachers' Day
  });
});

/** The bank's schedule for the 38 % differential loan (contract MKO-2026-32249), lines 1–35. */
const bank: [string, string][] = [
  ["2026-09-23", "3841019.18"], ["2026-10-23", "2605342.46"], ["2026-11-23", "2615267.58"], ["2026-12-23", "2456465.76"],
  ["2027-01-25", "2461428.31"], ["2027-02-23", "2389471.23"], ["2027-03-23", "2084273.98"], ["2027-04-23", "2230669.40"],
  ["2027-05-24", "2084273.98"], ["2027-06-23", "2079311.41"], ["2027-07-23", "1935397.26"], ["2027-08-23", "1922990.87"],
  ["2027-09-23", "1846071.24"], ["2027-10-25", "1712082.19"], ["2027-11-23", "1697194.52"], ["2027-12-23", "1563205.48"],
  ["2028-01-24", "1538392.70"], ["2028-02-23", "1463954.34"], ["2028-03-23", "1295227.40"], ["2028-04-24", "1307633.79"],
  ["2028-05-23", "1193494.98"], ["2028-06-23", "1153794.52"], ["2028-07-24", "1042136.99"], ["2028-08-23", "1002436.53"],
  ["2028-09-25", "923035.62"], ["2028-10-23", "823784.48"], ["2028-11-23", "769196.35"], ["2028-12-25", "669945.21"],
  ["2029-01-23", "620319.63"], ["2029-02-23", "538437.45"], ["2029-03-23", "416854.80"], ["2029-04-23", "384598.17"],
  ["2029-05-23", "297753.43"], ["2029-06-25", "230758.91"], ["2029-07-23", "153839.27"],
];

describe("schedule with payments moved off weekends", () => {
  const plan = buildDebtPlan({
    repaymentType: "DIFFERENTIAL",
    originalPrincipal: "85800000",
    annualInterestRate: "38",
    dayCountConvention: "ACTUAL_365",
    startDate: "2026-08-11",
    firstPaymentDate: "2026-09-23",
    termMonths: 36,
    shiftWeekends: true,
  });

  it("matches the bank's dates and interest to the tiyin: interest to the 23rd, plus the days a moved payment stayed unpaid", () => {
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const lines = plan.plan.lines.slice(0, 35);
    expect(lines.map((l) => l.dueDate)).toEqual(bank.map(([d]) => d));
    lines.forEach((l, i) => expect(Math.abs(l.interest.minus(bank[i]![1]).toNumber()), `line ${i + 1}`).toBeLessThanOrEqual(0.01));
    expect(lines[4]).toMatchObject({ dueDate: "2027-01-25", accrualDate: "2027-01-23" });
    expect(lines[5]!.accrualDate).toBeUndefined();
  });

  it("without the option keeps the contract dates", () => {
    const plain = buildDebtPlan({
      repaymentType: "DIFFERENTIAL",
      originalPrincipal: "85800000",
      annualInterestRate: "38",
      dayCountConvention: "ACTUAL_365",
      startDate: "2026-08-11",
      firstPaymentDate: "2026-09-23",
      termMonths: 36,
    });
    if (!plan.ok || !plain.ok) throw new Error("plan failed");
    expect(plain.plan.lines[4]!.dueDate).toBe("2027-01-23");
    // The principal parts are the same; a payment made two days late adds two days of interest on its principal to the next line.
    expect(plain.plan.lines.map((l) => l.principal.toFixed(2))).toEqual(plan.plan.lines.map((l) => l.principal.toFixed(2)));
    expect(plan.plan.lines[5]!.interest.minus(plain.plan.lines[5]!.interest).toFixed(2)).toBe("4962.55"); // 2 383 333.33 × 38% × 2 / 365
    expect(plan.plan.lines[6]!.interest.toFixed(2)).toBe(plain.plan.lines[6]!.interest.toFixed(2));
  });

  it("annuity and interest-free installments move their dates too", () => {
    const annuity = buildDebtPlan({ repaymentType: "ANNUITY", originalPrincipal: "12000000", annualInterestRate: "24", startDate: "2026-12-23", firstPaymentDate: "2027-01-23", termMonths: 12, shiftWeekends: true });
    if (!annuity.ok) throw new Error(annuity.error);
    expect(annuity.plan.lines[0]!.dueDate).toBe("2027-01-25");
    const car = generateInstallmentSchedule({ principal: "36000000", firstDueDate: "2026-11-01", count: 36, shiftWeekends: true });
    expect(car[0]).toMatchObject({ dueDate: "2026-11-02", accrualDate: "2026-11-01" }); // Sunday
    expect(car[2]!.dueDate).toBe("2027-01-04"); // 1 Jan holiday, then weekend
  });

  it("early repayment regenerates from the contract dates, not the moved ones", () => {
    if (!plan.ok) throw new Error("plan failed");
    const future = plan.plan.lines.slice(4); // from the line moved to 25 Jan 2027
    const result = planEarlyRepayment({
      repaymentType: "DIFFERENTIAL",
      strategy: "REDUCE_PAYMENT",
      futureLines: future,
      principalAfter: future[0]!.openingPrincipal.minus("10000000"),
      annualRatePercent: "38",
      periodStart: "2026-12-23",
      dayCount: "ACTUAL_365",
      shiftWeekends: true,
    });
    expect(result.lines[0]).toMatchObject({ dueDate: "2027-01-25", accrualDate: "2027-01-23" });
    expect(result.lines[1]!.dueDate).toBe("2027-02-23");
    expect(result.lines[4]!.dueDate).toBe("2027-05-24");
  });
});
