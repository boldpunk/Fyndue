/**
 * Development-only seed (SPEC §60). Refuses to run in production.
 *
 *   pnpm db:seed
 *
 * Creates demo@fyndue.dev / fyndue-demo-2026 through Better Auth (so the
 * password is hashed by the library), default categories, the Uzcard / Visa /
 * Cash UZS accounts, a few Fuel / Taxi / Groceries expenses, and the SPEC's
 * debts: Debt A (differential credit), Debt B (interest-free car
 * installment) and a demo microloan with fees.
 *
 * Re-running is safe: each part is only added if it is missing.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data into a production environment.");
  process.exit(1);
}

const DEMO_EMAIL = "demo@fyndue.dev";
const DEMO_PASSWORD = "fyndue-demo-2026";

async function main() {
  const { prisma } = await import("../lib/db");
  const { auth } = await import("../lib/auth/auth");
  const { createAccount } = await import("../lib/services/accounts");
  const { createTransaction } = await import("../lib/services/transactions");
  const { createDebt, getDebtDetail } = await import("../lib/services/debts");
  const { recordDebtPayment } = await import("../lib/services/debt-payments");
  const { addDays, addMonthsClamped, makeLocalDate, monthBounds, parseLocalDate, todayIn, yearMonthOf } = await import("../lib/finance/dates");

  const today = todayIn("Asia/Tashkent");
  /** Next date (today or later) falling on `day` of a month. */
  const nextOnDay = (day: number) => {
    const { year, month } = parseLocalDate(today);
    const thisMonth = makeLocalDate(year, month, day);
    return thisMonth >= today ? thisMonth : addMonthsClamped(thisMonth, 1, day);
  };

  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    const created = await auth.api.signUpEmail({ body: { name: "Said", email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    user = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } });
    console.log(`Created demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }
  const userId = user.id;

  // ── Accounts & expenses ──────────────────────────────────────────────────
  let accounts = await prisma.account.findMany({ where: { userId } });
  if (accounts.length === 0) {
    const account = (name: string, type: "BANK_CARD" | "CASH", openingBalance: string, color: "sky" | "indigo" | "green") =>
      createAccount(userId, { name, type, currency: "UZS", openingBalance, includeInTotal: true, bank: undefined, color });
    const uzcard = await account("Uzcard", "BANK_CARD", "12500000.00", "sky");
    const visa = await account("Visa", "BANK_CARD", "4200000.00", "indigo");
    await account("Cash UZS", "CASH", "850000.00", "green");

    const category = async (name: string) => (await prisma.category.findFirstOrThrow({ where: { userId, name, type: "EXPENSE" } })).id;
    const expenses = [
      { name: "Fuel", amount: "320000.00", account: uzcard.id, daysAgo: 1, merchant: "Uzbekneftegaz" },
      { name: "Taxi", amount: "28000.00", account: visa.id, daysAgo: 2, merchant: "Yandex Go" },
      { name: "Groceries", amount: "412500.00", account: uzcard.id, daysAgo: 3, merchant: "Korzinka" },
      { name: "Taxi", amount: "19000.00", account: visa.id, daysAgo: 5, merchant: undefined },
      { name: "Fuel", amount: "300000.00", account: uzcard.id, daysAgo: 8, merchant: undefined },
    ];
    for (const e of expenses) {
      await createTransaction(userId, {
        kind: "EXPENSE",
        accountId: e.account,
        categoryId: await category(e.name),
        amount: e.amount,
        date: addDays(today, -e.daysAgo),
        merchant: e.merchant,
        note: undefined,
        clientRequestId: randomUUID(),
      });
    }
    accounts = await prisma.account.findMany({ where: { userId } });
    console.log("Seeded accounts and expenses");
  }
  const uzcard = accounts.find((a) => a.name === "Uzcard") ?? accounts[0]!;

  // ── Debts (SPEC §4, §60) ──────────────────────────────────────────────────
  if ((await prisma.debt.count({ where: { userId } })) === 0) {
    const base = {
      lender: undefined,
      currency: "UZS" as const,
      paidBeforeTracking: undefined,
      feeMode: "NONE" as const,
      originationFee: undefined,
      netAmountReceived: undefined,
      annualInterestRate: undefined,
      dayCountConvention: "MONTHLY_30_360" as const,
      roundingScale: 2 as const,
      paymentDay: undefined,
      termMonths: undefined,
      installmentAmount: undefined,
      knownTotalRepayment: false,
      manualLines: undefined,
      knownTotalLines: undefined,
      disbursementAccountId: undefined,
    };

    // Debt A — differential credit. The real rate, term and dates will be
    // entered later; these terms are demo placeholders.
    await createDebt(userId, {
      ...base,
      clientRequestId: randomUUID(),
      type: "CREDIT",
      name: "Credit",
      lender: "Demo Bank",
      repaymentType: "DIFFERENTIAL",
      originalPrincipal: "85800000.00",
      annualInterestRate: "24",
      termMonths: 36,
      startDate: addMonthsClamped(nextOnDay(22), -1),
      firstPaymentDate: nextOnDay(22),
      notes: "Demo terms (24%, 36 months) — replace with the contract's real rate, term and bank schedule.",
    });

    // Debt B — interest-free car installment: 163,593,696 with 49,986,962.63 already paid.
    await createDebt(userId, {
      ...base,
      clientRequestId: randomUUID(),
      type: "CAR_LOAN",
      name: "Car Installment",
      lender: "Dealer",
      repaymentType: "INTEREST_FREE",
      originalPrincipal: "163593696.00",
      paidBeforeTracking: "49986962.63",
      installmentAmount: "3500000.00",
      startDate: "2025-01-15",
      firstPaymentDate: nextOnDay(15),
      notes: undefined,
    });

    // Demo microloan — 2,000,000 + 100,000 fee on top, repaid with a 15,000 card fee (2,115,000 debited).
    const loanStart = addDays(today, -20);
    const { id: microloanId } = await createDebt(userId, {
      ...base,
      clientRequestId: randomUUID(),
      type: "MICROLOAN",
      name: "Microloan",
      lender: "Demo MFO",
      repaymentType: "INTEREST_FREE",
      originalPrincipal: "2000000.00",
      feeMode: "ADDED_ON_TOP",
      originationFee: "100000.00",
      termMonths: 1,
      startDate: loanStart,
      firstPaymentDate: addDays(loanStart, 14),
      disbursementAccountId: uzcard.id,
      notes: undefined,
    });
    const line = (await getDebtDetail(userId, microloanId)).schedule[0]!;
    await recordDebtPayment(userId, {
      clientRequestId: randomUUID(),
      debtId: microloanId,
      scheduleItemId: line.id,
      accountId: uzcard.id,
      paymentDate: addDays(loanStart, 14),
      principal: "2000000.00",
      interest: "0",
      originationFee: "100000.00",
      processingFee: "15000.00",
      penalty: "0",
      otherFee: "0",
      settlesItem: false,
      note: "Demo repayment incl. card fee",
    });
    console.log("Seeded Debt A, Debt B and a paid-off demo microloan");
  }

  // ── Income & last month (Phase 3 dashboard) ───────────────────────────────
  if ((await prisma.transaction.count({ where: { userId, type: "INCOME" } })) === 0) {
    const categoryOf = async (name: string, type: "EXPENSE" | "INCOME") =>
      (await prisma.category.findFirstOrThrow({ where: { userId, name, type } })).id;
    const salary = await categoryOf("Salary", "INCOME");
    const { start } = monthBounds(yearMonthOf(today));
    const lastMonth = addMonthsClamped(start, -1);
    const add = (input: Record<string, unknown>) => createTransaction(userId, { clientRequestId: randomUUID(), merchant: undefined, note: undefined, ...input } as never);

    await add({ kind: "INCOME", accountId: uzcard.id, categoryId: salary, amount: "14000000.00", date: addDays(lastMonth, 4), status: "ACTUAL" });
    await add({ kind: "EXPENSE", accountId: uzcard.id, categoryId: await categoryOf("Groceries", "EXPENSE"), amount: "1850000.00", date: addDays(lastMonth, 9) });
    await add({ kind: "EXPENSE", accountId: uzcard.id, categoryId: await categoryOf("Fuel", "EXPENSE"), amount: "760000.00", date: addDays(lastMonth, 15) });
    await add({ kind: "INCOME", accountId: uzcard.id, categoryId: salary, amount: "14000000.00", date: addDays(start, 4) <= today ? addDays(start, 4) : start, status: "ACTUAL" });
    // Next payday: expected, so it never counts as actual until confirmed.
    await add({ kind: "INCOME", accountId: uzcard.id, categoryId: salary, amount: "14000000.00", date: nextOnDay(5) === today ? addMonthsClamped(today, 1) : nextOnDay(5), status: "EXPECTED" });
    console.log("Seeded salary (actual and expected) and last month's expenses");
  }

  console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
