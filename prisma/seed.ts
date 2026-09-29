/**
 * Development-only seed (SPEC §60). Refuses to run in production.
 *
 *   pnpm db:seed
 *
 * Creates demo@fyndue.dev / fyndue-demo-2026 through Better Auth (so the
 * password is hashed by the library), default categories, the Uzcard / Visa /
 * Cash UZS accounts and a few Fuel / Taxi / Groceries expenses.
 * Debt seed data (Debt A, Debt B, demo microloan) is added in Phase 2.
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
  const { addDays, todayIn } = await import("../lib/finance/dates");

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Demo user already exists (${DEMO_EMAIL}); nothing to do.`);
    return;
  }

  const { user } = await auth.api.signUpEmail({
    body: { name: "Said", email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });

  const uzcard = await createAccount(user.id, { name: "Uzcard", type: "BANK_CARD", currency: "UZS", openingBalance: "12500000.00", includeInTotal: true, bank: undefined, color: "sky" });
  const visa = await createAccount(user.id, { name: "Visa", type: "BANK_CARD", currency: "UZS", openingBalance: "4200000.00", includeInTotal: true, bank: undefined, color: "indigo" });
  await createAccount(user.id, { name: "Cash UZS", type: "CASH", currency: "UZS", openingBalance: "850000.00", includeInTotal: true, bank: undefined, color: "green" });

  const category = async (name: string) =>
    (await prisma.category.findFirstOrThrow({ where: { userId: user.id, name, type: "EXPENSE" } })).id;
  const today = todayIn("Asia/Tashkent");
  const expenses = [
    { name: "Fuel", amount: "320000.00", account: uzcard.id, daysAgo: 1, merchant: "Uzbekneftegaz" },
    { name: "Taxi", amount: "28000.00", account: visa.id, daysAgo: 2, merchant: "Yandex Go" },
    { name: "Groceries", amount: "412500.00", account: uzcard.id, daysAgo: 3, merchant: "Korzinka" },
    { name: "Taxi", amount: "19000.00", account: visa.id, daysAgo: 5, merchant: undefined },
    { name: "Fuel", amount: "300000.00", account: uzcard.id, daysAgo: 8, merchant: undefined },
  ];
  for (const e of expenses) {
    await createTransaction(user.id, {
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

  console.log(`Seeded demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
