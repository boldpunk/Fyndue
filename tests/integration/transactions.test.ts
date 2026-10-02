import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { adjustAccountBalance, recomputeAccountBalance, updateAccount } from "@/lib/services/accounts";
import { getMonthOverview } from "@/lib/services/dashboard";
import {
  confirmExpectedIncome,
  createTransaction,
  listTransactions,
  updateCashFlowTransaction,
  updateTransfer,
  voidTransaction,
} from "@/lib/services/transactions";
import { balanceOf, categoryId, createTestAccount, createUser, requestId, resetDatabase } from "../support/factories";

async function expectBalanceConsistent(userId: string, accountId: string) {
  expect(await recomputeAccountBalance(userId, accountId)).toBe(await balanceOf(accountId));
}

describe("transactions & account balances", () => {
  beforeEach(resetDatabase);

  it("records expenses and income and keeps the balance exact", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "1000000.00" });
    const fuel = await categoryId(user.id, "Топливо");
    const salary = await categoryId(user.id, "Зарплата", "INCOME");

    await createTransaction(user.id, { kind: "INCOME", accountId: card.id, categoryId: salary, amount: "49986962.63", date: "2026-09-01", status: "ACTUAL", clientRequestId: requestId() });
    await createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "350000.00", date: "2026-09-02", clientRequestId: requestId() });

    expect(await balanceOf(card.id)).toBe("50636962.63");
    await expectBalanceConsistent(user.id, card.id);

    const audit = await prisma.auditLog.count({ where: { userId: user.id, action: "TRANSACTION_CREATED" } });
    expect(audit).toBe(2);
  });

  it("is idempotent per clientRequestId (double submit)", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id);
    const fuel = await categoryId(user.id, "Топливо");
    const input = { kind: "EXPENSE" as const, accountId: card.id, categoryId: fuel, amount: "100.00", date: "2026-09-02", clientRequestId: requestId() };

    const results = await Promise.allSettled([createTransaction(user.id, input), createTransaction(user.id, input)]);
    const ids = results.map((r) => (r.status === "fulfilled" ? r.value.id : null));
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
    expect(await balanceOf(card.id)).toBe("-100.00");
  });

  it("expected income does not count until confirmed", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id);
    const salary = await categoryId(user.id, "Зарплата", "INCOME");
    const { id } = await createTransaction(user.id, { kind: "INCOME", accountId: card.id, categoryId: salary, amount: "8000000", date: "2026-09-25", status: "EXPECTED", clientRequestId: requestId() });

    expect(await balanceOf(card.id)).toBe("0.00");
    const overview = await getMonthOverview(user.id, { year: 2026, month: 9 });
    expect(overview.income).toEqual([]);
    expect(overview.expectedIncome).toEqual([{ currency: "UZS", amount: "8000000.00" }]);

    await confirmExpectedIncome(user.id, id);
    expect(await balanceOf(card.id)).toBe("8000000.00");
    await expectBalanceConsistent(user.id, card.id);
  });

  it("moves money between own accounts without touching income/expense totals", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "5000000" });
    const cash = await createTestAccount(user.id, { name: "Cash UZS", type: "CASH" });

    await createTransaction(user.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: cash.id, amount: "1200000", date: "2026-09-10", clientRequestId: requestId() });

    expect(await balanceOf(card.id)).toBe("3800000.00");
    expect(await balanceOf(cash.id)).toBe("1200000.00");
    const overview = await getMonthOverview(user.id, { year: 2026, month: 9 });
    expect(overview.expenses).toEqual([]);
    expect(overview.income).toEqual([]);
    expect(overview.balances).toEqual([{ currency: "UZS", amount: "5000000.00" }]);

    // listed once, with its counterpart
    const list = await listTransactions(user.id, { page: 1 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.counterpart?.accountName).toBe("Cash UZS");
  });

  it("requires an explicit amount for cross-currency transfers", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "12700000" });
    const usd = await createTestAccount(user.id, { name: "Cash USD", type: "CASH", currency: "USD" });

    await expect(
      createTransaction(user.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: usd.id, amount: "12700000", date: "2026-09-10", clientRequestId: requestId() }),
    ).rejects.toThrow(DomainError);
    expect(await balanceOf(card.id)).toBe("12700000.00");

    await createTransaction(user.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: usd.id, amount: "12700000", toAmount: "1000.00", date: "2026-09-10", clientRequestId: requestId() });
    expect(await balanceOf(card.id)).toBe("0.00");
    expect(await balanceOf(usd.id)).toBe("1000.00");
  });

  it("voiding a transfer voids both legs and restores both balances", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "500" });
    const cash = await createTestAccount(user.id, { name: "Cash", type: "CASH" });
    const { id } = await createTransaction(user.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: cash.id, amount: "200", date: "2026-09-10", clientRequestId: requestId() });

    await voidTransaction(user.id, id, "Entered twice");
    expect(await balanceOf(card.id)).toBe("500.00");
    expect(await balanceOf(cash.id)).toBe("0.00");
    expect(await prisma.transaction.count({ where: { userId: user.id, voidedAt: { not: null } } })).toBe(2);
    await expect(voidTransaction(user.id, id)).rejects.toThrow(/уже аннулирована/);
    await expectBalanceConsistent(user.id, card.id);
    await expectBalanceConsistent(user.id, cash.id);
  });

  it("editing an expense moves balances between accounts", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "1000" });
    const visa = await createTestAccount(user.id, { name: "Visa", openingBalance: "1000" });
    const taxi = await categoryId(user.id, "Такси");
    const { id } = await createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: taxi, amount: "100", date: "2026-09-10", clientRequestId: requestId() });

    await updateCashFlowTransaction(user.id, { id, accountId: visa.id, categoryId: taxi, amount: "150.50", date: "2026-09-11" });
    expect(await balanceOf(card.id)).toBe("1000.00");
    expect(await balanceOf(visa.id)).toBe("849.50");
    await expectBalanceConsistent(user.id, card.id);
    await expectBalanceConsistent(user.id, visa.id);
  });

  it("editing a transfer adjusts both legs", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "1000" });
    const cash = await createTestAccount(user.id, { name: "Cash", type: "CASH" });
    const { id } = await createTransaction(user.id, { kind: "TRANSFER", fromAccountId: card.id, toAccountId: cash.id, amount: "300", date: "2026-09-10", clientRequestId: requestId() });

    await updateTransfer(user.id, { id, amount: "250", date: "2026-09-12" });
    expect(await balanceOf(card.id)).toBe("750.00");
    expect(await balanceOf(cash.id)).toBe("250.00");
  });

  it("balance adjustment reconciles to the target and changing opening balance shifts current", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "1000" });
    await adjustAccountBalance(user.id, { accountId: card.id, targetBalance: "875.25", date: "2026-09-10" });
    expect(await balanceOf(card.id)).toBe("875.25");
    expect(await adjustAccountBalance(user.id, { accountId: card.id, targetBalance: "875.25", date: "2026-09-10" })).toBeNull();

    await updateAccount(user.id, { id: card.id, name: "Uzcard", type: "BANK_CARD", includeInTotal: true, openingBalance: "1500" });
    expect(await balanceOf(card.id)).toBe("1375.25");
    await expectBalanceConsistent(user.id, card.id);
  });

  it("rejects mismatched and system categories, archived accounts", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id);
    const salary = await categoryId(user.id, "Зарплата", "INCOME");
    const debt = await categoryId(user.id, "Платежи по долгам");
    await expect(
      createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: salary, amount: "1", date: "2026-09-10", clientRequestId: requestId() }),
    ).rejects.toThrow(/не подходит/);
    await expect(
      createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: debt, amount: "1", date: "2026-09-10", clientRequestId: requestId() }),
    ).rejects.toThrow(/управляет приложение/);

    await prisma.account.update({ where: { id: card.id }, data: { isArchived: true } });
    const fuel = await categoryId(user.id, "Топливо");
    await expect(
      createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: fuel, amount: "1", date: "2026-09-10", clientRequestId: requestId() }),
    ).rejects.toThrow(/в архиве/);
  });

  it("database constraints reject impossible rows", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id);
    const base = { userId: user.id, accountId: card.id, currency: "UZS" as const, transactionDate: new Date("2026-09-10") };
    await expect(prisma.transaction.create({ data: { ...base, type: "EXPENSE", direction: "OUTFLOW", amount: "-5" } })).rejects.toThrow();
    await expect(prisma.transaction.create({ data: { ...base, type: "EXPENSE", direction: "INFLOW", amount: "5" } })).rejects.toThrow();
    await expect(prisma.transaction.create({ data: { ...base, type: "TRANSFER", direction: "INFLOW", amount: "5" } })).rejects.toThrow();
    await expect(prisma.transaction.create({ data: { ...base, type: "EXPENSE", direction: "OUTFLOW", status: "EXPECTED", amount: "5" } })).rejects.toThrow();
  });

  it("filters the list by month and search text", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id);
    const groceries = await categoryId(user.id, "Продукты");
    await createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: groceries, amount: "10", date: "2026-08-31", merchant: "Korzinka", clientRequestId: requestId() });
    await createTransaction(user.id, { kind: "EXPENSE", accountId: card.id, categoryId: groceries, amount: "20", date: "2026-09-01", clientRequestId: requestId() });

    expect((await listTransactions(user.id, { page: 1, month: "2026-09" })).total).toBe(1);
    expect((await listTransactions(user.id, { page: 1, month: "2026-08" })).total).toBe(1);
    expect((await listTransactions(user.id, { page: 1, q: "korz" })).total).toBe(1);
    expect((await listTransactions(user.id, { page: 1, q: "продук" })).total).toBe(2);
  });
});
