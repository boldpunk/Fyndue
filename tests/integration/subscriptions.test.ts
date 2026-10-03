import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, addMonthsClamped, localDateToDb, todayIn } from "@/lib/finance/dates";
import { createRecurring, recordOccurrence } from "@/lib/services/recurring";
import { createTransaction, voidTransaction } from "@/lib/services/transactions";
import { ESIM_CATEGORY_NAME } from "@/lib/constants/categories";
import { getSubscriptions } from "@/lib/services/subscriptions";
import { recurringSchema } from "@/lib/validations/planning";
import { balanceOf, categoryId, createTestAccount, createUser, resetDatabase } from "../support/factories";

async function setup() {
  const user = await createUser();
  const today = todayIn(user.timezone);
  const uzcard = await createTestAccount(user.id, { name: "Uzcard", openingBalance: "5000000" });
  const visa = await createTestAccount(user.id, { name: "Visa USD", currency: "USD", openingBalance: "300" });
  const subs = await categoryId(user.id, "Подписки");
  await prisma.centralBankRate.create({ data: { currency: "USD", rate: "11808.76", rateDate: localDateToDb(addDays(today, -1)) } });
  const add = (input: Record<string, unknown>) =>
    createRecurring(
      user.id,
      recurringSchema.parse({ kind: "EXPENSE", accountId: visa.id, categoryId: subs, frequency: "MONTHLY", interval: 1, startDate: addDays(today, 5), isSubscription: true, ...input }),
    );
  return { user, today, uzcard, visa, subs, add };
}

describe("subscriptions", () => {
  beforeEach(resetDatabase);

  it("lists only subscriptions, soonest first, with totals in sums at the Central Bank rate", async () => {
    const { user, today, uzcard, subs, add } = await setup();
    await add({ name: "Claude Pro", amount: "20", startDate: addDays(today, 9), url: "claude.ai/settings/billing" });
    await add({ name: "ChatGPT Plus", amount: "20", startDate: addDays(today, 2) });
    await add({ name: "Домен", amount: "120000", accountId: uzcard.id, frequency: "YEARLY", startDate: addDays(today, 100) });
    await add({ name: "Интернет", amount: "150000", accountId: uzcard.id, isSubscription: false, categoryId: subs });

    const page = await getSubscriptions(user.id);
    expect(page.items.map((i) => i.name)).toEqual(["ChatGPT Plus", "Claude Pro", "Домен"]);
    expect(page.items[1]).toMatchObject({ url: "https://claude.ai/settings/billing", amountInBase: "236175.20", nextOccurrence: addDays(today, 9) });
    expect(page.items[2]!.amountInBase).toBeNull();
    expect(page.summary.byCurrency).toEqual([
      { currency: "UZS", monthly: "10000.00", yearly: "120000.00" },
      { currency: "USD", monthly: "40.00", yearly: "480.00" },
    ]);
    // 40 × 11 808.76 + 10 000
    expect(page.summary.combined).toMatchObject({ monthly: "482350.40", yearly: "5788204.80" });
    expect(page.summary.next).toMatchObject({ date: addDays(today, 2), items: [{ name: "ChatGPT Plus", amount: "20.00", currency: "USD" }] });
  });

  it("asks to record charges since the subscription was added, not before", async () => {
    const { user, today, visa, add } = await setup();
    const { id } = await add({ name: "Spotify", amount: "5.99", startDate: addDays(today, -40) });
    // Added just now: the charges 40 and 10 days ago are already in the opening balance.
    expect((await getSubscriptions(user.id)).pending).toEqual([]);

    // Added 20 days ago: the charge a month after the start (≈10 days ago) happened while tracked and is waiting.
    await prisma.recurringTransaction.update({ where: { id }, data: { createdAt: new Date(Date.now() - 20 * 86_400_000) } });
    const pending = (await getSubscriptions(user.id)).pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ name: "Spotify", date: addMonthsClamped(addDays(today, -40), 1), amount: "5.99", currency: "USD" });

    await recordOccurrence(user.id, { clientRequestId: randomUUID(), recurringId: id, occurrenceDate: pending[0]!.date, amount: "5.99", date: pending[0]!.date, accountId: visa.id });
    expect((await getSubscriptions(user.id)).pending).toEqual([]);
    expect((await balanceOf(visa.id)).toString()).toBe("294.01");
  });

  it("a recorded charge moves the next one to the following period", async () => {
    const { user, today, visa, add } = await setup();
    const { id } = await add({ name: "ChatGPT Plus", amount: "20", startDate: today });
    expect((await getSubscriptions(user.id)).items[0]!.nextOccurrence).toBe(today);
    await recordOccurrence(user.id, { clientRequestId: randomUUID(), recurringId: id, occurrenceDate: today, amount: "20", date: today, accountId: visa.id });
    const page = await getSubscriptions(user.id);
    expect(page.items[0]!.nextOccurrence).toBe(addMonthsClamped(today, 1));
    expect(page.summary.next?.date).toBe(addMonthsClamped(today, 1));
    expect(page.pending).toEqual([]);
  });

  it("paused subscriptions stay listed but leave the totals", async () => {
    const { user, add } = await setup();
    const { id } = await add({ name: "Netflix", amount: "9.99" });
    await prisma.recurringTransaction.update({ where: { id }, data: { isActive: false } });
    const page = await getSubscriptions(user.id);
    expect(page.items).toMatchObject([{ name: "Netflix", isActive: false, nextOccurrence: null }]);
    expect(page.summary).toMatchObject({ activeCount: 0, byCurrency: [], next: null });
  });

  it("keeps a link only for subscriptions, and the database refuses non-web links", async () => {
    const { user, uzcard, subs, add } = await setup();
    const { id } = await add({ name: "Свет", amount: "80000", accountId: uzcard.id, categoryId: subs, isSubscription: false, url: "example.uz" });
    expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } })).url).toBeNull();
    await expect(prisma.recurringTransaction.update({ where: { id }, data: { url: "javascript:alert(1)" } })).rejects.toThrow();
    expect((await getSubscriptions(user.id)).items).toEqual([]);
  });

  it("sums travel eSIM purchases of the last 12 months, ignoring voided and older ones", async () => {
    const { user, today, visa, uzcard } = await setup();
    const esim = await categoryId(user.id, ESIM_CATEGORY_NAME);
    const buy = (accountId: string, amount: string, date: string, merchant?: string) =>
      createTransaction(user.id, { kind: "EXPENSE", clientRequestId: randomUUID(), accountId, categoryId: esim, amount, date, merchant, note: undefined } as never);

    expect((await getSubscriptions(user.id)).esim).toMatchObject({ categoryId: esim, count: 0, last: null });
    await buy(visa.id, "9", addDays(today, -200), "Airalo · Турция");
    await buy(visa.id, "15", addDays(today, -20), "Holafly · ОАЭ");
    await buy(uzcard.id, "60000", addDays(today, -60));
    await buy(visa.id, "30", addDays(today, -400), "too old");
    const voided = await buy(visa.id, "99", addDays(today, -5), "mistake");
    await voidTransaction(user.id, voided.id, "test");

    const { esim: summary } = await getSubscriptions(user.id);
    expect(summary).toMatchObject({
      count: 3,
      byCurrency: [
        { currency: "UZS", total: "60000.00" },
        { currency: "USD", total: "24.00" },
      ],
      combined: { total: "343410.24" },
      last: { merchant: "Holafly · ОАЭ", amount: "15.00", currency: "USD", date: addDays(today, -20) },
      usualAccountId: visa.id,
    });

    const other = await createUser("Other");
    expect((await getSubscriptions(other.id)).esim).toMatchObject({ count: 0 });
  });

  it("never shows another user's subscriptions", async () => {
    const { add } = await setup();
    await add({ name: "ChatGPT Plus", amount: "20" });
    const other = await createUser("Other");
    const page = await getSubscriptions(other.id);
    expect(page.items).toEqual([]);
    expect(page.pending).toEqual([]);
  });
});
