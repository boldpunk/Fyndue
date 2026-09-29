import { describe, expect, it } from "vitest";
import { debtProgress } from "@/lib/finance/debt-progress";
import { debtCost } from "@/lib/finance/debt-cost";
import {
  itemRemaining,
  paymentTotals,
  suggestBreakdown,
  validatePaymentBreakdown,
} from "@/lib/finance/payment-allocation";
import { displayPaymentStatus } from "@/lib/finance/payment-status";

const zero = { principal: "0", interest: "0", originationFee: "0", processingFee: "0", penalty: "0", otherFee: "0" };

describe("payment breakdown (SPEC §19A, §22)", () => {
  it("separates amount applied to the debt from the actual account debit", () => {
    const totals = paymentTotals({ ...zero, principal: "2000000", originationFee: "100000", processingFee: "15000" });
    expect(totals.amountAppliedToDebt.toFixed(2)).toBe("2100000.00");
    expect(totals.actualAccountDebit.toFixed(2)).toBe("2115000.00");
  });

  it("rejects negative components, empty payments and principal above the balance", () => {
    expect(validatePaymentBreakdown({ ...zero, principal: "-1" }, { currentPrincipal: "100" })).toHaveProperty("principal");
    expect(validatePaymentBreakdown({ ...zero }, { currentPrincipal: "100" })).toHaveProperty("form");
    expect(validatePaymentBreakdown({ ...zero, principal: "101" }, { currentPrincipal: "100" })).toHaveProperty("principal");
    expect(validatePaymentBreakdown({ ...zero, principal: "100", processingFee: "5" }, { currentPrincipal: "100" })).toEqual({});
  });

  it("rejects paying more than a schedule line is owed (the extra is an early repayment)", () => {
    const remaining = itemRemaining({ plannedPrincipal: "1000", plannedInterest: "100", plannedFees: "0", paidPrincipal: "0", paidInterest: "0", paidFees: "0" });
    expect(validatePaymentBreakdown({ ...zero, principal: "1001" }, { currentPrincipal: "5000", item: remaining })).toHaveProperty("principal");
    expect(validatePaymentBreakdown({ ...zero, principal: "1000", interest: "100", penalty: "50" }, { currentPrincipal: "5000", item: remaining })).toEqual({});
  });

  it("suggests the remaining line amounts, or splits a smaller amount fees → interest → principal", () => {
    const remaining = itemRemaining({ plannedPrincipal: "1000", plannedInterest: "100", plannedFees: "50", paidPrincipal: "0", paidInterest: "0", paidFees: "0" });
    const full = suggestBreakdown(remaining);
    expect([full.principal, full.interest, full.fees].map((d) => d.toFixed(2))).toEqual(["1000.00", "100.00", "50.00"]);
    const partial = suggestBreakdown(remaining, "400");
    expect([partial.principal, partial.interest, partial.fees].map((d) => d.toFixed(2))).toEqual(["250.00", "100.00", "50.00"]);
  });
});

describe("payment status (SPEC §12)", () => {
  const today = "2026-10-10";
  const status = (dueDate: string, stored: Parameters<typeof displayPaymentStatus>[0]["status"] = "SCHEDULED") =>
    displayPaymentStatus({ status: stored, dueDate, today }).status;

  it("derives time-based statuses from today", () => {
    expect(status("2026-10-25")).toBe("UPCOMING");
    expect(status("2026-10-17")).toBe("DUE_SOON");
    expect(status("2026-10-13")).toBe("DUE_SOON");
    expect(status("2026-10-12")).toBe("URGENT");
    expect(status("2026-10-11")).toBe("URGENT");
    expect(status("2026-10-10")).toBe("DUE_TODAY");
    expect(status("2026-10-09")).toBe("OVERDUE");
  });

  it("keeps settled statuses and shows partial payments", () => {
    expect(status("2026-10-01", "PAID")).toBe("PAID");
    expect(status("2026-10-01", "SKIPPED")).toBe("SKIPPED");
    expect(status("2026-10-20", "PARTIALLY_PAID")).toBe("PARTIALLY_PAID");
    expect(status("2026-10-01", "PARTIALLY_PAID")).toBe("OVERDUE");
  });

  it("reports days remaining and respects custom thresholds", () => {
    expect(displayPaymentStatus({ status: "SCHEDULED", dueDate: "2026-10-15", today }).days).toBe(5);
    expect(displayPaymentStatus({ status: "SCHEDULED", dueDate: "2026-10-20", today, dueSoonDays: 14 }).status).toBe("DUE_SOON");
  });
});

describe("debt progress (SPEC §11)", () => {
  it("computes Debt B: 30.56% paid, 69.44% remaining", () => {
    const p = debtProgress({
      principalBasis: "163593696",
      currentPrincipal: "113606733.37",
      items: [],
      today: "2026-10-01",
    });
    expect(p.paidPrincipal.toFixed(2)).toBe("49986962.63");
    expect(p.paidPercent.toFixed(2)).toBe("30.56");
    expect(p.remainingPercent.toFixed(2)).toBe("69.44");
  });

  it("finds the next payment, counts payments and projects payoff", () => {
    const items = [
      { dueDate: "2026-09-15", status: "PAID" as const, plannedPrincipal: "100", plannedInterest: "10", plannedFees: "0", plannedTotal: "110", paidPrincipal: "100", paidInterest: "10", paidFees: "0", paidTotal: "110" },
      { dueDate: "2026-10-15", status: "PARTIALLY_PAID" as const, plannedPrincipal: "100", plannedInterest: "5", plannedFees: "0", plannedTotal: "105", paidPrincipal: "0", paidInterest: "5", paidFees: "0", paidTotal: "5" },
      { dueDate: "2026-11-15", status: "SCHEDULED" as const, plannedPrincipal: "100", plannedInterest: "2", plannedFees: "0", plannedTotal: "102", paidPrincipal: "0", paidInterest: "0", paidFees: "0", paidTotal: "0" },
    ];
    const p = debtProgress({ principalBasis: "300", currentPrincipal: "200", items, today: "2026-10-10" });
    expect(p.paymentsCompleted).toBe(1);
    expect(p.paymentsRemaining).toBe(2);
    expect(p.nextPayment?.dueDate).toBe("2026-10-15");
    expect(p.nextPayment?.amountDue.toFixed(2)).toBe("100.00");
    expect(p.nextPayment?.daysUntil).toBe(5);
    expect(p.projectedPayoffDate).toBe("2026-11-15");
    expect(p.remainingInterestEstimate.toFixed(2)).toBe("2.00");
    expect(p.plannedFutureTotal.toFixed(2)).toBe("202.00");
  });

  it("handles a fully paid debt and a zero basis without dividing by zero", () => {
    const paid = debtProgress({ principalBasis: "1000", currentPrincipal: "0", items: [], today: "2026-10-10" });
    expect(paid.paidPercent.toFixed(2)).toBe("100.00");
    expect(paid.nextPayment).toBeNull();
    const empty = debtProgress({ principalBasis: "0", currentPrincipal: "0", items: [], today: "2026-10-10" });
    expect(empty.paidPercent.toFixed(2)).toBe("0.00");
  });
});

describe("debt cost (SPEC §19A Total Cost of Debt)", () => {
  it("separates cost above principal from actual cash outflow", () => {
    const cost = debtCost([
      { principal: "2000000", interest: "0", originationFee: "100000", processingFee: "15000", penalty: "0", otherFee: "0", actualAccountDebit: "2115000" },
      { principal: "0", interest: "5000", originationFee: "0", processingFee: "0", penalty: "2000", otherFee: "1000", actualAccountDebit: "8000" },
    ]);
    expect(cost.costAbovePrincipal.toFixed(2)).toBe("123000.00");
    expect(cost.cashOutflow.toFixed(2)).toBe("2123000.00");
    expect(cost.principalPaid.toFixed(2)).toBe("2000000.00");
    expect(cost.feesPaid.toFixed(2)).toBe("116000.00");
  });
});
