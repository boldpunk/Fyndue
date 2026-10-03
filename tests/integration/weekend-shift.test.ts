import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { previewEarlyRepayment, recordDebtPayment } from "@/lib/services/debt-payments";
import { getDebtDetail, setDebtWeekendShift } from "@/lib/services/debts";
import { createTestAccount, createUser, resetDatabase } from "../support/factories";
import { createTestDebt, zeroBreakdown } from "../support/debt-factories";

/** The 38 % differential loan from contract MKO-2026-32249. */
const loan = {
  name: "Кредит 38%",
  originalPrincipal: "85800000",
  annualInterestRate: "38",
  dayCountConvention: "ACTUAL_365" as const,
  startDate: "2026-08-11",
  firstPaymentDate: "2026-09-23",
  termMonths: 36,
};

const line = (detail: Awaited<ReturnType<typeof getDebtDetail>>, n: number) => detail.schedule.find((i) => i.installmentNumber === n)!;

describe("payments moved off weekends", () => {
  beforeEach(resetDatabase);

  it("a new debt stores the bank's dates and keeps the contract date for interest", async () => {
    const user = await createUser();
    const { id } = await createTestDebt(user.id, { ...loan, shiftWeekends: true });
    const detail = await getDebtDetail(user.id, id);
    expect(detail.shiftWeekends).toBe(true);
    expect(line(detail, 5)).toMatchObject({ dueDate: "2027-01-25", accrualDate: "2027-01-23", plannedInterest: "2461428.31" });
    expect(line(detail, 6)).toMatchObject({ dueDate: "2027-02-23", accrualDate: null, plannedInterest: "2389471.23" });
    expect(line(detail, 9)).toMatchObject({ dueDate: "2027-05-24", accrualDate: "2027-05-23" });
  });

  it("turning it on for an existing debt moves only unpaid lines, as a new version, and can be undone", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "100000000" });
    const { id } = await createTestDebt(user.id, loan);
    const before = await getDebtDetail(user.id, id);
    expect(line(before, 5)).toMatchObject({ dueDate: "2027-01-23", accrualDate: null });

    // First line paid in full.
    await recordDebtPayment(user.id, {
      clientRequestId: randomUUID(), debtId: id, accountId: card.id, paymentDate: "2026-09-23", settlesItem: true, note: undefined,
      ...zeroBreakdown, principal: "2383333.33", interest: "3841019.18", scheduleItemId: line(before, 1).id,
    });

    expect(await setDebtWeekendShift(user.id, { id, shiftWeekends: true })).toEqual({ moved: 9 });
    const on = await getDebtDetail(user.id, id);
    expect(on.shiftWeekends).toBe(true);
    expect(on.versions[0]).toMatchObject({ version: 2, reason: "CORRECTION", isActive: true });
    expect(line(on, 1)).toMatchObject({ id: line(before, 1).id, status: "PAID" });
    expect(line(on, 2)).toMatchObject({ dueDate: "2026-10-23", plannedInterest: "2605342.47" });
    expect(line(on, 5)).toMatchObject({ dueDate: "2027-01-25", accrualDate: "2027-01-23", plannedInterest: line(before, 5).plannedInterest });
    expect(line(on, 6).plannedInterest).toBe("2389471.23"); // bank's figure: +2 days on line 5's principal
    expect(on.currentPrincipal).toBe("83416666.67");

    expect(await setDebtWeekendShift(user.id, { id, shiftWeekends: false })).toEqual({ moved: 9 });
    const off = await getDebtDetail(user.id, id);
    expect(line(off, 5)).toMatchObject({ dueDate: "2027-01-23", accrualDate: null });
    expect(line(off, 6).plannedInterest).toBe(line(before, 6).plannedInterest);
    expect(off.versions).toHaveLength(3);
  });

  it("a typed-in (bank) schedule keeps its amounts and only moves its dates", async () => {
    const user = await createUser();
    const { id } = await createTestDebt(user.id, {
      repaymentType: "MANUAL",
      originalPrincipal: "2000",
      annualInterestRate: undefined,
      termMonths: undefined,
      firstPaymentDate: "2027-01-23",
      manualLines: [
        { dueDate: "2027-01-23", principal: "1000", interest: "50", fees: "0" },
        { dueDate: "2027-02-23", principal: "1000", interest: "25", fees: "0" },
      ],
    });
    expect(await setDebtWeekendShift(user.id, { id, shiftWeekends: true })).toEqual({ moved: 1 });
    const detail = await getDebtDetail(user.id, id);
    expect(detail.schedule.map((i) => [i.dueDate, i.plannedInterest])).toEqual([
      ["2027-01-25", "50.00"],
      ["2027-02-23", "25.00"],
    ]);
  });

  it("early repayment on a moved schedule keeps the 23rd as the contract day", async () => {
    const user = await createUser();
    const { id } = await createTestDebt(user.id, { ...loan, shiftWeekends: true });
    const preview = await previewEarlyRepayment(user.id, { debtId: id, amount: "10000000", strategy: "REDUCE_PAYMENT" });
    const dates = preview.newLines.map((l) => l.dueDate);
    expect(dates).toContain("2027-01-25");
    expect(dates).toContain("2027-02-23");
    expect(dates.every((d) => ["23", "24", "25", "26"].includes(d.slice(8)))).toBe(true);
  });

  it("another user cannot change someone's debt", async () => {
    const owner = await createUser();
    const { id } = await createTestDebt(owner.id, loan);
    const other = await createUser("Other");
    await expect(setDebtWeekendShift(other.id, { id, shiftWeekends: true })).rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.debt.findUniqueOrThrow({ where: { id } })).shiftWeekends).toBe(false);
  });
});
