import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, addMonthsClamped, monthBounds, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import { getDashboard } from "@/lib/services/dashboard";
import { createTransaction } from "@/lib/services/transactions";
import { categoryId, createTestAccount, createUser, resetDatabase } from "../support/factories";
import { createTestDebt } from "../support/debt-factories";

describe("dashboard (SPEC §9–§14)", () => {
  beforeEach(resetDatabase);

  it("computes Safe to Spend, projection, comparison and DTI from real rows", async () => {
    const user = await createUser();
    const today = todayIn(user.timezone);
    const { start, endExclusive } = monthBounds(yearMonthOf(today));
    const monthEnd = addDays(endExclusive, -1);

    const card = await createTestAccount(user.id, { openingBalance: "12000000" });
    await createTestAccount(user.id, { name: "Cash USD", currency: "USD", openingBalance: "300" });
    const salary = await categoryId(user.id, "Salary", "INCOME");
    const fuel = await categoryId(user.id, "Fuel");
    const tx = (input: Record<string, unknown>) => createTransaction(user.id, { clientRequestId: randomUUID(), ...input } as never);

    // Previous month: 100,000 expense. This month: 150,000 expense + 10M income.
    await tx({ kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "100000", date: addDays(start, -1) });
    await tx({ kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "150000", date: start });
    await tx({ kind: "INCOME", accountId: card.id, categoryId: salary, amount: "10000000", date: start, status: "ACTUAL" });
    // Next expected income in 10 days.
    const incomeDate = addDays(today, 10);
    await tx({ kind: "INCOME", accountId: card.id, categoryId: salary, amount: "8000000", date: incomeDate, status: "EXPECTED" });

    // Interest-free debt: 3,500,000 due in 3 days, another a month later.
    const firstDue = addDays(today, 3);
    await createTestDebt(user.id, {
      repaymentType: "INTEREST_FREE",
      originalPrincipal: "7000000",
      annualInterestRate: undefined,
      termMonths: 2,
      startDate: today,
      firstPaymentDate: firstDue,
    });
    const secondDue = addMonthsClamped(firstDue, 1);

    const d = await getDashboard(user.id);
    expect(d.currencies.map((c) => c.currency)).toEqual(["UZS", "USD"]);
    const uzs = d.currencies[0]!;
    expect(uzs.balance).toBe("21750000.00"); // 12M − 100k − 150k + 10M
    expect(uzs.expenses).toBe("150000.00");
    expect(uzs.expensesChange).toEqual({ delta: "50000.00", percent: "50.0" });
    expect(uzs.income).toBe("10000000.00");
    expect(uzs.expectedIncomeThisMonth).toBe(incomeDate < endExclusive ? "8000000.00" : "0.00");
    expect(uzs.debtToIncome).toBe("0.0");

    // Safe to spend: balance − payments due up to the next expected income.
    expect(uzs.safeToSpend.basis).toBe("NEXT_INCOME");
    expect(uzs.safeToSpend.horizonDate).toBe(incomeDate);
    const reservedBeforeIncome = [firstDue, secondDue].filter((dd) => dd <= incomeDate).length * 3500000;
    expect(uzs.safeToSpend.obligationsTotal).toBe(money(reservedBeforeIncome).toFixed(2));
    expect(uzs.safeToSpend.amount).toBe(money(21750000 - reservedBeforeIncome).toFixed(2));

    // Projection to month end.
    const incomeInMonth = incomeDate <= monthEnd ? 8000000 : 0;
    const debtInMonth = [firstDue, secondDue].filter((dd) => dd <= monthEnd).length * 3500000;
    expect(uzs.projected.until).toBe(monthEnd);
    expect(uzs.projected.projected).toBe(money(21750000 + incomeInMonth - debtInMonth).toFixed(2));

    // USD is never mixed with UZS.
    const usd = d.currencies[1]!;
    expect(usd.balance).toBe("300.00");
    expect(usd.safeToSpend.amount).toBe("300.00");

    expect(d.upcoming[0]?.dueDate).toBe(firstDue);
    expect(d.debtTotals[0]?.remainingPrincipal).toBe("7000000.00");
    expect(d.overdue.count).toBe(0);
  });

  it("has no comparison without previous-month history and N/A DTI without income", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "1000" });
    const fuel = await categoryId(user.id, "Fuel");
    await createTransaction(user.id, {
      kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "10", date: todayIn(user.timezone), merchant: undefined, note: undefined, clientRequestId: randomUUID(),
    });
    const d = await getDashboard(user.id);
    expect(d.currencies[0]!.expensesChange).toBeNull();
    expect(d.currencies[0]!.debtToIncome).toBeNull();
    expect(d.currencies[0]!.safeToSpend.basis).toBe("MONTH_END");
  });
});
