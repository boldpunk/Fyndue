import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { recomputeAccountBalance } from "@/lib/services/accounts";
import { getMonthOverview } from "@/lib/services/dashboard";
import {
  previewEarlyRepayment,
  recomputeItemPaidTotal,
  recordDebtPayment,
  recordEarlyRepayment,
  reverseDebtPayment,
} from "@/lib/services/debt-payments";
import { replaceOpenSchedule } from "@/lib/services/debt-schedule";
import { getDebtDetail, getScheduleSnapshot, listUpcomingPayments, recomputeDebtPrincipal } from "@/lib/services/debts";
import { balanceOf, createTestAccount, createUser, resetDatabase } from "../support/factories";
import { createTestDebt, zeroBreakdown } from "../support/debt-factories";

async function expectConsistent(userId: string, debtId: string, accountIds: string[] = []) {
  const debt = await prisma.debt.findUniqueOrThrow({ where: { id: debtId } });
  expect(await recomputeDebtPrincipal(userId, debtId)).toBe(debt.currentPrincipal.toFixed(2));
  const items = await prisma.debtScheduleItem.findMany({ where: { debtId, isCurrent: true } });
  for (const item of items) expect(await recomputeItemPaidTotal(userId, item.id)).toBe(item.paidTotal.toFixed(2));
  for (const id of accountIds) expect(await recomputeAccountBalance(userId, id)).toBe(await balanceOf(id));
}

const pay = (userId: string, debtId: string, accountId: string, fields: Partial<typeof zeroBreakdown> & { scheduleItemId?: string; settlesItem?: boolean; clientRequestId?: string }) =>
  recordDebtPayment(userId, {
    clientRequestId: randomUUID(),
    debtId,
    accountId,
    paymentDate: "2026-10-10",
    settlesItem: false,
    note: undefined,
    ...zeroBreakdown,
    ...fields,
  });

describe("debt creation", () => {
  beforeEach(resetDatabase);

  it("creates Debt B (interest-free car installment) with 30.56% already paid", async () => {
    const user = await createUser();
    const { id } = await createTestDebt(user.id, {
      type: "CAR_LOAN",
      name: "Car Installment",
      repaymentType: "INTEREST_FREE",
      originalPrincipal: "163593696.00",
      paidBeforeTracking: "49986962.63",
      annualInterestRate: undefined,
      termMonths: undefined,
      installmentAmount: "3500000.00",
      firstPaymentDate: "2026-10-15",
    });
    const debt = await getDebtDetail(user.id, id);
    expect(debt.currentPrincipal).toBe("113606733.37");
    expect(debt.paidPercent).toBe("30.56");
    expect(debt.remainingPercent).toBe("69.44");
    expect(debt.schedule).toHaveLength(33);
    expect(debt.versions).toHaveLength(1);
    expect(debt.nextPayment?.amountDue).toBe("3500000.00");
    // No account moved for money paid before tracking.
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it("records a microloan disbursement as LOAN_DISBURSEMENT, not income (fee deducted)", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id);
    const { id } = await createTestDebt(user.id, {
      type: "MICROLOAN",
      name: "MFO",
      repaymentType: "INTEREST_FREE",
      originalPrincipal: "2000000",
      feeMode: "DEDUCTED_FROM_DISBURSEMENT",
      originationFee: "100000",
      annualInterestRate: undefined,
      termMonths: 1,
      firstPaymentDate: "2026-11-01",
      disbursementAccountId: card.id,
    });
    expect(await balanceOf(card.id)).toBe("1900000.00");
    const debt = await getDebtDetail(user.id, id);
    expect(debt.netAmountReceived).toBe("1900000.00");
    expect(debt.principalBasis).toBe("2000000.00");
    const overview = await getMonthOverview(user.id, { year: 2026, month: 1 });
    expect(overview.income).toEqual([]);
  });

  it("rejects a disbursement account in another currency, atomically", async () => {
    const user = await createUser();
    const usd = await createTestAccount(user.id, { name: "USD", currency: "USD" });
    await expect(createTestDebt(user.id, { disbursementAccountId: usd.id })).rejects.toThrow(DomainError);
    expect(await prisma.debt.count()).toBe(0);
    expect(await prisma.debtScheduleItem.count()).toBe(0);
  });

  it("is idempotent per clientRequestId", async () => {
    const user = await createUser();
    const clientRequestId = randomUUID();
    const [a, b] = await Promise.all([createTestDebt(user.id, { clientRequestId }), createTestDebt(user.id, { clientRequestId })]);
    expect(a.id).toBe(b.id);
    expect(await prisma.debt.count()).toBe(1);
  });
});

describe("payments", () => {
  beforeEach(resetDatabase);

  it("microloan: 2,100,000 applied, 15,000 processing fee, 2,115,000 debited (SPEC §19A)", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "5000000" });
    const { id } = await createTestDebt(user.id, {
      type: "MICROLOAN",
      name: "Microloan",
      repaymentType: "INTEREST_FREE",
      originalPrincipal: "2000000",
      feeMode: "ADDED_ON_TOP",
      originationFee: "100000",
      annualInterestRate: undefined,
      termMonths: 1,
      firstPaymentDate: "2026-11-01",
    });
    const before = await getDebtDetail(user.id, id);
    expect(before.schedule[0]!.plannedTotal).toBe("2100000.00");

    await pay(user.id, id, card.id, { scheduleItemId: before.schedule[0]!.id, principal: "2000000", originationFee: "100000", processingFee: "15000" });

    expect(await balanceOf(card.id)).toBe("2885000.00");
    const after = await getDebtDetail(user.id, id);
    expect(after.currentPrincipal).toBe("0.00");
    expect(after.status).toBe("PAID_OFF");
    expect(after.schedule[0]!.status).toBe("PAID");
    expect(after.cost.costAbovePrincipal).toBe("115000.00");
    expect(after.cost.cashOutflow).toBe("2115000.00");
    expect(after.cost.principalPaid).toBe("2000000.00");
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId: user.id, type: "DEBT_PAYMENT" } });
    expect(tx.amount.toFixed(2)).toBe("2115000.00");
    // Not double-counted as an expense.
    const overview = await getMonthOverview(user.id, { year: 2026, month: 10 });
    expect(overview.expenses).toEqual([]);
    await expectConsistent(user.id, id, [card.id]);
  });

  it("partial payment, then a later payment completes the installment (SPEC §23)", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id);
    const item = (await getDebtDetail(user.id, id)).schedule[0]!;
    expect(item.plannedTotal).toBe("1120.00"); // 1000 + 12000 × 1%

    await pay(user.id, id, card.id, { scheduleItemId: item.id, interest: "120", principal: "400" });
    let detail = await getDebtDetail(user.id, id);
    expect(detail.schedule[0]!.status).toBe("PARTIALLY_PAID");
    expect(detail.schedule[0]!.remainingTotal).toBe("600.00");
    expect(detail.nextPayment?.itemId).toBe(item.id);

    await pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "600" });
    detail = await getDebtDetail(user.id, id);
    expect(detail.schedule[0]!.status).toBe("PAID");
    expect(detail.currentPrincipal).toBe("11000.00");
    expect(detail.paymentsCompleted).toBe(1);
    await expectConsistent(user.id, id, [card.id]);
  });

  it("rejects overpaying an installment's principal, wrong currency and settled lines", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const usd = await createTestAccount(user.id, { name: "USD", currency: "USD", openingBalance: "100" });
    const { id } = await createTestDebt(user.id);
    const item = (await getDebtDetail(user.id, id)).schedule[0]!;
    await expect(pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "1000.01" })).rejects.toThrow(/early repayment/);
    await expect(pay(user.id, id, usd.id, { scheduleItemId: item.id, principal: "1" })).rejects.toThrow(/UZS/);
    await pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "1000", interest: "120" });
    await expect(pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "1" })).rejects.toThrow(/settled/);
    expect(await balanceOf(card.id)).toBe("98880.00");
  });

  it("settlesItem closes a line when the bank charged less interest than estimated", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id);
    const item = (await getDebtDetail(user.id, id)).schedule[0]!;
    await pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "1000", interest: "115", settlesItem: true });
    expect((await getDebtDetail(user.id, id)).schedule[0]!.status).toBe("PAID");
  });

  it("is idempotent per clientRequestId (double click)", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id);
    const item = (await getDebtDetail(user.id, id)).schedule[0]!;
    const clientRequestId = randomUUID();
    await Promise.allSettled([
      pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "1000", interest: "120", clientRequestId }),
      pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "1000", interest: "120", clientRequestId }),
    ]);
    expect(await prisma.debtPayment.count()).toBe(1);
    expect(await balanceOf(card.id)).toBe("98880.00");
  });

  it("database rejects a debit inconsistent with the breakdown", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id);
    const { id } = await createTestDebt(user.id);
    await expect(
      prisma.debtPayment.create({
        data: { userId: user.id, debtId: id, accountId: card.id, paymentDate: new Date("2026-10-10"), amountAppliedToDebt: "100", actualAccountDebit: "90", principalAmount: "100" },
      }),
    ).rejects.toThrow();
  });
});

describe("reversal (SPEC §25)", () => {
  beforeEach(resetDatabase);

  it("round-trips every balance back to where it was", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id);
    const item = (await getDebtDetail(user.id, id)).schedule[0]!;
    const { id: paymentId } = await pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "1000", interest: "120", processingFee: "5" });
    expect(await balanceOf(card.id)).toBe("98875.00");

    await reverseDebtPayment(user.id, { paymentId, reason: "Entered twice" });
    const detail = await getDebtDetail(user.id, id);
    expect(await balanceOf(card.id)).toBe("100000.00");
    expect(detail.currentPrincipal).toBe("12000.00");
    expect(detail.schedule[0]!.status).toBe("SCHEDULED");
    expect(detail.payments[0]!.isReversed).toBe(true);
    expect(detail.payments[0]!.reversalReason).toBe("Entered twice");
    const tx = await prisma.transaction.findFirstOrThrow({ where: { debtPaymentId: paymentId } });
    expect(tx.voidedAt).not.toBeNull();
    await expect(reverseDebtPayment(user.id, { paymentId, reason: "again" })).rejects.toThrow(/already reversed/);
    await expectConsistent(user.id, id, [card.id]);
  });

  it("reopens a paid-off debt", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "10000" });
    const { id } = await createTestDebt(user.id, { repaymentType: "INTEREST_FREE", originalPrincipal: "500", annualInterestRate: undefined, termMonths: 1 });
    const item = (await getDebtDetail(user.id, id)).schedule[0]!;
    const { id: paymentId } = await pay(user.id, id, card.id, { scheduleItemId: item.id, principal: "500" });
    expect((await getDebtDetail(user.id, id)).status).toBe("PAID_OFF");
    await reverseDebtPayment(user.id, { paymentId, reason: "Bank bounced it" });
    expect((await getDebtDetail(user.id, id)).status).toBe("ACTIVE");
  });
});

describe("early repayment and versioning (SPEC §24, §52)", () => {
  beforeEach(resetDatabase);

  it("reduces term, keeps version 1, and can be reversed into a correction version", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id);
    const first = (await getDebtDetail(user.id, id)).schedule[0]!;
    await pay(user.id, id, card.id, { scheduleItemId: first.id, principal: "1000", interest: "120" });

    const preview = await previewEarlyRepayment(user.id, { debtId: id, amount: "5000", strategy: "REDUCE_TERM" });
    expect(preview.oldPayoffDate).toBe("2027-01-01");
    expect(preview.newPayoffDate).toBe("2026-08-01");
    expect(preview.monthsReduced).toBe(5);
    expect(Number(preview.interestSavedEstimate)).toBeGreaterThan(0);

    const { id: earlyId } = await recordEarlyRepayment(user.id, {
      clientRequestId: randomUUID(),
      debtId: id,
      accountId: card.id,
      paymentDate: "2026-02-15",
      amount: "5000",
      processingFee: "0",
      strategy: "REDUCE_TERM",
      note: undefined,
    });

    let detail = await getDebtDetail(user.id, id);
    expect(detail.currentPrincipal).toBe("6000.00");
    expect(detail.versions.map((v) => v.reason)).toEqual(["EARLY_REPAYMENT", "INITIAL"]);
    expect(detail.schedule).toHaveLength(7); // 1 paid + 6 regenerated
    expect(detail.schedule[0]!.status).toBe("PAID");
    expect(detail.projectedPayoffDate).toBe("2026-08-01");
    // History is intact: version 1 still shows all 12 original lines.
    const v1 = await getScheduleSnapshot(user.id, id, 1);
    expect(v1).toHaveLength(12);
    expect(v1.at(-1)!.dueDate).toBe("2027-01-01");
    await expectConsistent(user.id, id, [card.id]);

    await reverseDebtPayment(user.id, { paymentId: earlyId, reason: "Wrong debt" });
    detail = await getDebtDetail(user.id, id);
    expect(detail.currentPrincipal).toBe("11000.00");
    expect(detail.versions.map((v) => v.reason)).toEqual(["CORRECTION", "EARLY_REPAYMENT", "INITIAL"]);
    expect(detail.schedule).toHaveLength(12);
    expect(detail.projectedPayoffDate).toBe("2027-01-01");
    expect(await balanceOf(card.id)).toBe("98880.00");
    await expectConsistent(user.id, id, [card.id]);
  });

  it("refuses to reverse an early repayment once the new schedule has payments", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id);
    const { id: earlyId } = await recordEarlyRepayment(user.id, {
      clientRequestId: randomUUID(), debtId: id, accountId: card.id, paymentDate: "2026-01-15", amount: "6000", processingFee: "0", strategy: "REDUCE_PAYMENT", note: undefined,
    });
    const next = (await getDebtDetail(user.id, id)).schedule[0]!;
    expect(next.plannedPrincipal).toBe("500.00");
    await pay(user.id, id, card.id, { scheduleItemId: next.id, principal: next.plannedPrincipal, interest: next.plannedInterest });
    await expect(reverseDebtPayment(user.id, { paymentId: earlyId, reason: "oops" })).rejects.toThrow(/Reverse those first/);
  });

  it("paying off everything early marks the debt paid off", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id);
    await recordEarlyRepayment(user.id, {
      clientRequestId: randomUUID(), debtId: id, accountId: card.id, paymentDate: "2026-01-15", amount: "12000", processingFee: "10", strategy: "REDUCE_TERM", note: undefined,
    });
    const detail = await getDebtDetail(user.id, id);
    expect(detail.status).toBe("PAID_OFF");
    expect(detail.schedule).toHaveLength(0);
    expect(await balanceOf(card.id)).toBe("87990.00");
  });

  it("a bank schedule overrides estimates as a new version, keeping paid lines", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000" });
    const { id } = await createTestDebt(user.id, { originalPrincipal: "3000", termMonths: 3 });
    const first = (await getDebtDetail(user.id, id)).schedule[0]!;
    await pay(user.id, id, card.id, { scheduleItemId: first.id, principal: "1000", interest: "30" });
    const debt = await prisma.debt.findUniqueOrThrow({ where: { id } });
    await prisma.$transaction((tx) =>
      replaceOpenSchedule(tx, debt, {
        reason: "BANK_IMPORT",
        note: undefined,
        lines: [
          { dueDate: "2026-03-01", principal: "1000.00", interest: "21.50", fees: undefined },
          { dueDate: "2026-04-01", principal: "1000.00", interest: "10.40", fees: "5.00" },
        ],
      }),
    );
    const detail = await getDebtDetail(user.id, id);
    expect(detail.versions[0]!.reason).toBe("BANK_IMPORT");
    expect(detail.schedule.map((s) => s.installmentNumber)).toEqual([1, 2, 3]);
    expect(detail.schedule[1]!.plannedInterest).toBe("21.50");
    expect(detail.schedule[1]!.isEstimate).toBe(false);
    expect(detail.schedule[0]!.status).toBe("PAID");
    await expect(
      prisma.$transaction((tx) => replaceOpenSchedule(tx, debt, { reason: "MANUAL_EDIT", note: undefined, lines: [{ dueDate: "2026-03-01", principal: "999.00", interest: undefined, fees: undefined }] })),
    ).rejects.toThrow(/add up/);
  });
});

describe("upcoming payments and isolation", () => {
  beforeEach(resetDatabase);

  it("lists open lines of active debts only", async () => {
    const user = await createUser();
    await createTestDebt(user.id, { firstPaymentDate: "2026-02-01" });
    const upcoming = await listUpcomingPayments(user.id, { untilDays: 3650 });
    expect(upcoming).toHaveLength(12);
    expect(upcoming[0]!.debt.name).toBe("Credit");
  });

  it("user A cannot read, pay, reverse or use accounts across users", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const aliceCard = await createTestAccount(alice.id, { openingBalance: "100000" });
    const bobCard = await createTestAccount(bob.id, { openingBalance: "100000" });
    const { id: bobDebt } = await createTestDebt(bob.id);
    const bobItem = (await getDebtDetail(bob.id, bobDebt)).schedule[0]!;
    const { id: bobPayment } = await pay(bob.id, bobDebt, bobCard.id, { scheduleItemId: bobItem.id, principal: "100" });

    await expect(getDebtDetail(alice.id, bobDebt)).rejects.toThrow(NotFoundError);
    await expect(pay(alice.id, bobDebt, aliceCard.id, { principal: "1" })).rejects.toThrow(NotFoundError);
    await expect(reverseDebtPayment(alice.id, { paymentId: bobPayment, reason: "mine now" })).rejects.toThrow(NotFoundError);
    await expect(getScheduleSnapshot(alice.id, bobDebt, 1)).resolves.toEqual([]);
    const { id: aliceDebt } = await createTestDebt(alice.id);
    await expect(pay(alice.id, aliceDebt, bobCard.id, { principal: "1" })).rejects.toThrow(NotFoundError);
    await expect(createTestDebt(alice.id, { disbursementAccountId: bobCard.id })).rejects.toThrow(NotFoundError);
    expect(await balanceOf(bobCard.id)).toBe("99900.00");
  });
});
