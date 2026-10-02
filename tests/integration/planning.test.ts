import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { addDays, addMonthsClamped, makeLocalDate, monthBounds, parseLocalDate, shiftYearMonth, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { getAnalytics, getMonthlySummary } from "@/lib/services/analytics";
import { copyBudgetsFromPreviousMonth, deleteBudget, getBudgetMonth, setBudget } from "@/lib/services/budgets";
import { getCalendarEvents } from "@/lib/services/calendar";
import { getDashboard } from "@/lib/services/dashboard";
import { recordDebtPayment } from "@/lib/services/debt-payments";
import { getDebtDetail } from "@/lib/services/debts";
import { addExchangeRate } from "@/lib/services/exchange-rates";
import { createRecurring, listOccurrences, recordOccurrence } from "@/lib/services/recurring";
import { createTransaction, voidTransaction } from "@/lib/services/transactions";
import { balanceOf, categoryId, createTestAccount, createUser, resetDatabase } from "../support/factories";
import { createTestDebt } from "../support/debt-factories";

const tx = (userId: string, input: Record<string, unknown>) =>
  createTransaction(userId, { clientRequestId: randomUUID(), merchant: undefined, note: undefined, ...input } as never);

async function setup() {
  const user = await createUser();
  const today = todayIn(user.timezone);
  const card = await createTestAccount(user.id, { openingBalance: "10000000" });
  return { user, today, card, fuel: await categoryId(user.id, "Топливо"), internet: await categoryId(user.id, "Интернет"), salary: await categoryId(user.id, "Зарплата", "INCOME") };
}

describe("recurring transactions", () => {
  beforeEach(resetDatabase);

  it("plans occurrences, records one once, and reopens it when voided", async () => {
    const { user, today, card, internet } = await setup();
    const start = addDays(today, 2);
    const { id: recurringId } = await createRecurring(user.id, {
      name: "Internet", kind: "EXPENSE", accountId: card.id, categoryId: internet, amount: "150000", frequency: "MONTHLY", interval: 1, startDate: start, endDate: undefined, isSubscription: false, note: undefined,
    });
    const occ = await listOccurrences(user.id, today, addMonthsClamped(today, 2));
    expect(occ.length).toBeGreaterThanOrEqual(2);
    expect(occ[0]).toMatchObject({ date: start, amount: "150000.00", transactionId: null });

    const record = () =>
      recordOccurrence(user.id, { clientRequestId: randomUUID(), recurringId, occurrenceDate: start, amount: "155000", date: start, accountId: card.id });
    const { id } = await record();
    expect(await balanceOf(card.id)).toBe("9845000.00");
    expect((await listOccurrences(user.id, start, start))[0]!.transactionId).toBe(id);
    await expect(record()).rejects.toThrow(/уже записан/);

    await voidTransaction(user.id, id, "wrong amount");
    expect((await listOccurrences(user.id, start, start))[0]!.transactionId).toBeNull();
    await record();
    expect(await balanceOf(card.id)).toBe("9845000.00");

    await expect(
      recordOccurrence(user.id, { clientRequestId: randomUUID(), recurringId, occurrenceDate: addDays(start, 1), amount: "1", date: start, accountId: card.id }),
    ).rejects.toThrow(/не запланирован/);
  });

  it("feeds planned expenses and recurring income into the dashboard", async () => {
    const { user, today, card, internet, salary } = await setup();
    const { endExclusive } = monthBounds(yearMonthOf(today));
    const monthEnd = addDays(endExclusive, -1);
    await createRecurring(user.id, {
      name: "Internet", kind: "EXPENSE", accountId: card.id, categoryId: internet, amount: "150000", frequency: "MONTHLY", interval: 1, startDate: today, endDate: undefined, isSubscription: true, note: undefined,
    });
    const payday = addDays(today, 5);
    await createRecurring(user.id, {
      name: "Salary", kind: "INCOME", accountId: card.id, categoryId: salary, amount: "8000000", frequency: "MONTHLY", interval: 1, startDate: payday, endDate: undefined, isSubscription: false, note: undefined,
    });
    const d = await getDashboard(user.id);
    const uzs = d.currencies[0]!;
    expect(uzs.projected.plannedExpenses).toBe("150000.00");
    expect(uzs.projected.expectedIncome).toBe(payday <= monthEnd ? "8000000.00" : "0.00");
    expect(uzs.safeToSpend.basis).toBe("NEXT_INCOME");
    expect(uzs.safeToSpend.horizonDate).toBe(payday);
  });

  it("rejects mismatched categories and other users' rules and accounts", async () => {
    const a = await setup();
    const b = await setup();
    await expect(
      createRecurring(a.user.id, { name: "x", kind: "EXPENSE", accountId: a.card.id, categoryId: a.salary, amount: "1", frequency: "MONTHLY", interval: 1, startDate: a.today, endDate: undefined, isSubscription: false, note: undefined }),
    ).rejects.toThrow(DomainError);
    await expect(
      createRecurring(a.user.id, { name: "x", kind: "EXPENSE", accountId: b.card.id, categoryId: a.fuel, amount: "1", frequency: "MONTHLY", interval: 1, startDate: a.today, endDate: undefined, isSubscription: false, note: undefined }),
    ).rejects.toThrow(NotFoundError);
    const { id } = await createRecurring(b.user.id, { name: "B", kind: "EXPENSE", accountId: b.card.id, categoryId: b.fuel, amount: "1", frequency: "MONTHLY", interval: 1, startDate: b.today, endDate: undefined, isSubscription: false, note: undefined });
    await expect(
      recordOccurrence(a.user.id, { clientRequestId: randomUUID(), recurringId: id, occurrenceDate: b.today, amount: "1", date: b.today, accountId: a.card.id }),
    ).rejects.toThrow(NotFoundError);
    expect(await listOccurrences(a.user.id, a.today, a.today)).toEqual([]);
  });
});

describe("budgets (SPEC §38)", () => {
  beforeEach(resetDatabase);

  it("tracks spending against category and overall budgets, excluding transfers and debt payments", async () => {
    const { user, today, card, fuel } = await setup();
    const month = yearMonthOf(today);
    const cash = await createTestAccount(user.id, { name: "Cash", type: "CASH" });
    await setBudget(user.id, { ...month, categoryId: fuel, currency: "UZS", amount: "1500000" });
    await setBudget(user.id, { ...month, categoryId: undefined, currency: "UZS", amount: "5000000" });
    await tx(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "800000", date: today });
    await tx(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: await categoryId(user.id, "Такси"), amount: "50000", date: today });
    await tx(user.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: cash.id, amount: "999999", date: today });

    const b = await getBudgetMonth(user.id, month);
    expect(b.categories[0]).toMatchObject({ limit: "1500000.00", spent: "800000.00", percent: "53", state: "UNDER", remaining: "700000.00" });
    expect(b.overall).toMatchObject({ limit: "5000000.00", spent: "850000.00", state: "UNDER" });
    expect(b.unbudgeted.map((u) => u.category?.name)).toEqual(["Такси"]);

    // Setting again replaces rather than duplicates.
    await setBudget(user.id, { ...month, categoryId: fuel, currency: "UZS", amount: "900000" });
    expect((await getBudgetMonth(user.id, month)).categories[0]).toMatchObject({ limit: "900000.00", state: "NEAR", percent: "89" });
  });

  it("copies last month's budgets once and isolates users", async () => {
    const { user, today, fuel } = await setup();
    const month = yearMonthOf(today);
    const prev = shiftYearMonth(month, -1);
    await setBudget(user.id, { ...prev, categoryId: fuel, currency: "UZS", amount: "1000000" });
    expect((await getBudgetMonth(user.id, month)).hasPreviousMonthBudgets).toBe(true);
    expect(await copyBudgetsFromPreviousMonth(user.id, month)).toBe(1);
    expect(await copyBudgetsFromPreviousMonth(user.id, month)).toBe(0);

    const other = await setup();
    await expect(setBudget(other.user.id, { ...month, categoryId: fuel, currency: "UZS", amount: "1" })).rejects.toThrow(NotFoundError);
    const budget = await prisma.budget.findFirstOrThrow({ where: { userId: user.id } });
    await expect(deleteBudget(other.user.id, budget.id)).rejects.toThrow(NotFoundError);
    await deleteBudget(user.id, budget.id);
  });
});

describe("analytics and monthly summary (SPEC §36, §39)", () => {
  beforeEach(resetDatabase);

  it("aggregates income, spending by category and debt costs without double counting", async () => {
    const { user, today, card, fuel, salary } = await setup();
    const { start } = monthBounds(yearMonthOf(today));
    const cash = await createTestAccount(user.id, { name: "Cash", type: "CASH" });
    await tx(user.id, { kind: "INCOME", accountId: card.id, categoryId: salary, amount: "8000000", date: start, status: "ACTUAL" });
    await tx(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "300000", date: start });
    await tx(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: await categoryId(user.id, "Такси"), amount: "100000", date: start });
    await tx(user.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: cash.id, amount: "500000", date: start });
    const { id: debtId } = await createTestDebt(user.id, { repaymentType: "INTEREST_FREE", originalPrincipal: "2000000", feeMode: "ADDED_ON_TOP", originationFee: "100000", annualInterestRate: undefined, termMonths: 1, startDate: start, firstPaymentDate: start });
    const item = (await getDebtDetail(user.id, debtId)).schedule[0]!;
    await recordDebtPayment(user.id, {
      clientRequestId: randomUUID(), debtId, scheduleItemId: item.id, accountId: card.id, paymentDate: start,
      principal: "2000000", interest: "0", originationFee: "100000", processingFee: "15000", penalty: "0", otherFee: "0", settlesItem: false, note: undefined,
    });

    const a = await getAnalytics(user.id, { from: start, to: today });
    expect(a.totals).toMatchObject({ income: "8000000.00", expenses: "400000.00", debtPayments: "2115000.00", net: "5485000.00" });
    expect(a.totals.debtToIncome).toBe("26.4");
    expect(a.byCategory.map((c) => [c.name, c.amount, c.share])).toEqual([
      ["Топливо", "300000.00", "75.0"],
      ["Такси", "100000.00", "25.0"],
    ]);
    expect(a.debt).toMatchObject({ principalPaid: "2000000.00", feesPaid: "115000.00", costAbovePrincipal: "115000.00", cashOutflow: "2115000.00" });
    expect(a.daily?.length).toBeGreaterThan(0);

    const summary = await getMonthlySummary(user.id, yearMonthOf(today));
    expect(summary).toMatchObject({
      income: "8000000.00",
      expenses: "400000.00",
      debtPayments: "2115000.00",
      netCashFlow: "5485000.00",
      debtReduction: "2000000.00",
      largestExpenseCategory: { name: "Топливо", amount: "300000.00" },
      totalRemainingDebt: "0.00",
    });
    // Card 10M + 8M − 0.4M − 0.5M − 2.115M, cash +0.5M
    expect(summary.endingBalance).toBe("15485000.00");
  });

  it("keeps a past month's ending balance reproducible after later activity", async () => {
    const { user, today, card, fuel } = await setup();
    const prev = shiftYearMonth(yearMonthOf(today), -1);
    const { year, month } = prev;
    // Account opened "before" last month for this test.
    await prisma.account.update({ where: { id: card.id }, data: { createdAt: new Date(Date.UTC(year, month - 2, 1)) } });
    await tx(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "100000", date: makeLocalDate(year, month, 10) });
    const before = (await getMonthlySummary(user.id, prev)).endingBalance;
    await tx(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "250000", date: today });
    expect((await getMonthlySummary(user.id, prev)).endingBalance).toBe(before);
    expect(before).toBe("9900000.00");
  });
});

describe("calendar and exchange rates", () => {
  beforeEach(resetDatabase);

  it("lists debt payments, expected income and recurring items with done flags", async () => {
    const { user, today, card, internet, salary } = await setup();
    const { day } = parseLocalDate(today);
    const later = addDays(today, 3);
    await createTestDebt(user.id, { repaymentType: "INTEREST_FREE", originalPrincipal: "1000", annualInterestRate: undefined, termMonths: 1, startDate: today, firstPaymentDate: later });
    await tx(user.id, { kind: "INCOME", accountId: card.id, categoryId: salary, amount: "5000", date: later, status: "EXPECTED" });
    const { id: recurringId } = await createRecurring(user.id, {
      name: "Internet", kind: "EXPENSE", accountId: card.id, categoryId: internet, amount: "150000", frequency: "MONTHLY", interval: 1, startDate: later, endDate: undefined, isSubscription: true, note: undefined,
    });
    await recordOccurrence(user.id, { clientRequestId: randomUUID(), recurringId, occurrenceDate: later, amount: "150000", date: later, accountId: card.id });

    const { events } = await getCalendarEvents(user.id, today, addDays(today, 10));
    const onLater = events.filter((e) => e.date === later);
    expect(onLater.map((e) => [e.kind, e.done]).sort()).toEqual([
      ["DEBT_PAYMENT", false],
      ["EXPECTED_INCOME", false],
      ["SUBSCRIPTION", true],
    ]);
    expect(day).toBeGreaterThan(0);
  });

  it("shows a combined balance only when the user has entered every rate", async () => {
    const { user, today } = await setup();
    await createTestAccount(user.id, { name: "Cash USD", currency: "USD", openingBalance: "100" });
    expect((await getDashboard(user.id)).combinedBalance).toBeNull();
    await addExchangeRate(user.id, { fromCurrency: "USD", toCurrency: "UZS", rate: "12700", effectiveDate: today });
    expect((await getDashboard(user.id)).combinedBalance).toEqual({ amount: "11270000.00", rateDate: today });
    await expect(addExchangeRate(user.id, { fromCurrency: "USD", toCurrency: "UZS", rate: "12800", effectiveDate: today })).rejects.toThrow(/уже задан/);
  });
});
