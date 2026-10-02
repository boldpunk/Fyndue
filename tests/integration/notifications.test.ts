import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, todayIn } from "@/lib/finance/dates";
import { recordDebtPayment } from "@/lib/services/debt-payments";
import { getDebtDetail } from "@/lib/services/debts";
import { runReminders, sendTestNotification, updateNotificationPreferences } from "@/lib/services/notifications";
import { createConnectionCode, disconnectTelegram, getTelegramConnection, linkTelegramChat } from "@/lib/services/telegram-connection";
import { TelegramApiError, type TelegramSender, type TelegramUpdate } from "@/lib/telegram/client";
import { handleUpdate } from "@/lib/telegram/commands";
import { secretMatches } from "@/lib/telegram/server";
import { createTestAccount, createUser, resetDatabase } from "../support/factories";
import { createTestDebt, zeroBreakdown } from "../support/debt-factories";

const TZ = "Asia/Tashkent"; // UTC+5, the default user time zone
const T = todayIn(TZ);
/** 11:00 in Tashkent on day T + offset (outside the default 22:00–09:00 quiet hours). */
const at = (offsetDays: number, utcTime = "06:00") => new Date(`${addDays(T, offsetDays)}T${utcTime}:00Z`);
const noSleep = async () => {};

function fakeSender(failWith?: () => Error | undefined) {
  const sent: { chatId: string; html: string }[] = [];
  const sender: TelegramSender & { sent: typeof sent } = {
    sent,
    async sendMessage(chatId, html) {
      const error = failWith?.();
      if (error) throw error;
      sent.push({ chatId, html });
      return { messageId: String(sent.length) };
    },
  };
  return sender;
}

async function connect(userId: string, chatId: string) {
  const { code } = await createConnectionCode(userId);
  const result = await linkTelegramChat(code, { chatId, username: "tester" });
  expect(result).toEqual({ ok: true, userId });
}

/** Interest-free 7,000,000 over 2 months; the first 3,500,000 falls due on T + firstDueOffset. */
async function debtDueIn(userId: string, firstDueOffset: number, name = "Car Installment") {
  return createTestDebt(userId, {
    type: "CAR_LOAN",
    name,
    repaymentType: "INTEREST_FREE",
    originalPrincipal: "7000000",
    annualInterestRate: undefined,
    termMonths: 2,
    startDate: addDays(T, firstDueOffset - 40),
    firstPaymentDate: addDays(T, firstDueOffset),
  });
}

const logs = (userId: string) => prisma.notificationLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("reminder dispatch (SPEC §35)", () => {
  beforeEach(resetDatabase);

  it("sends a reminder once; a second run sends nothing", async () => {
    const user = await createUser();
    await connect(user.id, "1001");
    await debtDueIn(user.id, 3);
    const sender = fakeSender();

    const first = await runReminders({ sender, now: at(0), sleep: noSleep });
    expect(first.sent).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.chatId).toBe("1001");
    expect(sender.sent[0]!.html).toContain("Платёж через 3 дня");
    expect(sender.sent[0]!.html).toContain("3\u00a0500\u00a0000 UZS");
    expect(sender.sent[0]!.html).toContain("Остаток долга:\n7\u00a0000\u00a0000 UZS");

    const second = await runReminders({ sender, now: at(0, "06:15"), sleep: noSleep });
    expect(second.sent).toBe(0);
    // Next day is still inside the 3-day window: same key, still nothing.
    await runReminders({ sender, now: at(1), sleep: noSleep });
    expect(sender.sent).toHaveLength(1);

    const [row] = await logs(user.id);
    expect(row).toMatchObject({ status: "SENT", type: "DUE_IN_DAYS", channel: "TELEGRAM", attempts: 1, externalMessageId: "1" });
    expect(row!.deduplicationKey).toMatch(/^due:.+:d3:tg$/);

    // Day before: the 1-day reminder.
    await runReminders({ sender, now: at(2), sleep: noSleep });
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1]!.html).toContain("Платёж через 1 день");
  });

  it("concurrent runs send exactly once", async () => {
    const user = await createUser();
    await connect(user.id, "1002");
    await debtDueIn(user.id, 0);
    const sender = fakeSender();
    const results = await Promise.all(Array.from({ length: 4 }, () => runReminders({ sender, now: at(0), sleep: noSleep })));
    expect(results.reduce((s, r) => s + r.sent, 0)).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.html).toContain("Платёж сегодня");
    expect(await prisma.notificationLog.count()).toBe(1);
  });

  it("batches several reminders for one user into one message", async () => {
    const user = await createUser();
    await connect(user.id, "1003");
    await debtDueIn(user.id, 3, "Car Installment");
    await debtDueIn(user.id, -1, "Credit");
    const sender = fakeSender();
    const run = await runReminders({ sender, now: at(0), sleep: noSleep });
    expect(run.sent).toBe(2);
    expect(sender.sent).toHaveLength(1);
    const html = sender.sent[0]!.html;
    expect(html.indexOf("Платёж просрочен")).toBeLessThan(html.indexOf("Car Installment"));
  });

  it("paying the item cancels its pending reminder", async () => {
    const user = await createUser();
    const card = await createTestAccount(user.id, { openingBalance: "10000000" });
    await connect(user.id, "1004");
    const { id: debtId } = await debtDueIn(user.id, 3);

    let failing = true;
    const sender = fakeSender(() => (failing ? new TelegramApiError("Telegram sendMessage 502: Bad Gateway", 502) : undefined));
    const failed = await runReminders({ sender, now: at(0), sleep: noSleep });
    expect(failed.failed).toBe(1);
    expect((await logs(user.id))[0]).toMatchObject({ status: "FAILED", attempts: 1, failureReason: "Telegram sendMessage 502: Bad Gateway" });

    const debt = await getDebtDetail(user.id, debtId);
    await recordDebtPayment(user.id, {
      clientRequestId: randomUUID(),
      debtId,
      accountId: card.id,
      paymentDate: T,
      scheduleItemId: debt.schedule[0]!.id,
      settlesItem: false,
      note: undefined,
      ...zeroBreakdown,
      principal: "3500000",
    });

    failing = false;
    const after = await runReminders({ sender, now: at(0, "07:00"), sleep: noSleep });
    expect(after).toMatchObject({ sent: 0, cancelled: 1 });
    expect(sender.sent).toHaveLength(0);
    expect((await logs(user.id))[0]!.status).toBe("CANCELLED");
  });

  it("retries a failed reminder after the backoff, up to the attempt limit", async () => {
    const user = await createUser();
    await connect(user.id, "1005");
    await debtDueIn(user.id, 1);
    let failing = true;
    const sender = fakeSender(() => (failing ? new TelegramApiError("Telegram sendMessage 500: Internal", 500) : undefined));

    await runReminders({ sender, now: at(0), sleep: noSleep });
    // Too soon (backoff after 1 attempt is 2 minutes).
    const early = await runReminders({ sender, now: at(0, "06:01"), sleep: noSleep });
    expect(early.failed + early.sent).toBe(0);

    failing = false;
    const retried = await runReminders({ sender, now: at(0, "06:03"), sleep: noSleep });
    expect(retried.sent).toBe(1);
    expect((await logs(user.id))[0]).toMatchObject({ status: "SENT", attempts: 2, failureReason: null });
  });

  it("stops after five failed attempts", async () => {
    const user = await createUser();
    await connect(user.id, "1006");
    await debtDueIn(user.id, 1);
    const sender = fakeSender(() => new TelegramApiError("Telegram sendMessage 500: Internal", 500));
    for (let hour = 0; hour < 7; hour++) {
      await runReminders({ sender, now: new Date(at(0).getTime() + hour * 3_600_000), sleep: noSleep });
    }
    expect((await logs(user.id))[0]).toMatchObject({ status: "FAILED", attempts: 5 });
  });

  it("marks the connection disconnected when the bot is blocked (403)", async () => {
    const user = await createUser();
    await connect(user.id, "1007");
    await debtDueIn(user.id, 1);
    const sender = fakeSender(() => new TelegramApiError("Telegram sendMessage 403: Forbidden: bot was blocked by the user", 403));
    await runReminders({ sender, now: at(0), sleep: noSleep });
    expect((await getTelegramConnection(user.id)).status).toBe("DISCONNECTED");
    expect((await logs(user.id))[0]!.status).toBe("CANCELLED");
  });

  it("overdue reminders fire on day 1 and then every repeat interval", async () => {
    const user = await createUser();
    await connect(user.id, "1008");
    await debtDueIn(user.id, -1, "Credit"); // day 1 overdue at T
    const sender = fakeSender();
    for (let day = 0; day <= 6; day++) await runReminders({ sender, now: at(day), sleep: noSleep });
    // Overdue days 1..7 with a 3-day repeat → day 1, day 4 and day 7.
    expect(sender.sent).toHaveLength(3);
    expect(sender.sent.map((s) => s.html.match(/Просрочка:\n(\d+ \S+)/)?.[1])).toEqual(["1 день", "4 дня", "7 дней"]);
  });

  it("quiet hours defer the reminder to the first run afterwards", async () => {
    const user = await createUser();
    await connect(user.id, "1009");
    await debtDueIn(user.id, 3);
    const sender = fakeSender();
    // 18:00 UTC = 23:00 in Tashkent: inside 22:00–09:00.
    const quiet = await runReminders({ sender, now: at(0, "18:00"), sleep: noSleep });
    expect(quiet).toMatchObject({ sent: 0, deferred: 1 });
    // 03:30 UTC = 08:30 next day: still quiet.
    await runReminders({ sender, now: at(1, "03:30"), sleep: noSleep });
    expect(sender.sent).toHaveLength(0);
    // 04:00 UTC = 09:00: sent (2 days left, still the 3-day reminder).
    await runReminders({ sender, now: at(1, "04:00"), sleep: noSleep });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.html).toContain("Платёж через 2 дня");
  });

  it("respects preferences: disabled Telegram sends nothing", async () => {
    const user = await createUser();
    await connect(user.id, "1010");
    await debtDueIn(user.id, 0);
    await updateNotificationPreferences(user.id, {
      telegramEnabled: false,
      notifyDaysBefore: [3],
      notifyOnDueDate: true,
      notifyWhenOverdue: true,
      overdueRepeatDays: 3,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "09:00",
    });
    const sender = fakeSender();
    await runReminders({ sender, now: at(0), sleep: noSleep });
    expect(sender.sent).toHaveLength(0);
  });

  it("each user only gets their own reminders", async () => {
    const a = await createUser("A");
    const b = await createUser("B");
    await connect(a.id, "2001");
    await connect(b.id, "2002");
    await debtDueIn(a.id, 3, "A's loan");
    await debtDueIn(b.id, 3, "B's loan");
    const sender = fakeSender();
    await runReminders({ sender, now: at(0), sleep: noSleep });
    const byChat = Object.fromEntries(sender.sent.map((s) => [s.chatId, s.html]));
    expect(byChat["2001"]).toContain("A's loan");
    expect(byChat["2001"]).not.toContain("B's loan");
    expect(byChat["2002"]).toContain("B's loan");
  });

  it("test message is limited to one per minute", async () => {
    const user = await createUser();
    const sender = fakeSender();
    await expect(sendTestNotification(user.id, sender)).rejects.toThrow(/Сначала подключите Telegram/);
    await connect(user.id, "1011");
    const now = at(0);
    await sendTestNotification(user.id, sender, now);
    await expect(sendTestNotification(user.id, sender, now)).rejects.toThrow(/только что отправлено/);
    expect(sender.sent).toHaveLength(1);
  });
});

describe("telegram connection (SPEC §33)", () => {
  beforeEach(resetDatabase);

  it("links a chat with a valid code, exactly once", async () => {
    const user = await createUser();
    const { code } = await createConnectionCode(user.id);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await getTelegramConnection(user.id)).status).toBe("PENDING");
    // The code itself is never stored.
    const row = await prisma.telegramConnection.findUniqueOrThrow({ where: { userId: user.id } });
    expect(JSON.stringify(row)).not.toContain(code);

    expect(await linkTelegramChat("WRONG234", { chatId: "3001" })).toEqual({ ok: false });
    expect(await linkTelegramChat(code.toLowerCase(), { chatId: "3001", username: "me" })).toEqual({ ok: true, userId: user.id });
    expect(await linkTelegramChat(code, { chatId: "3002" })).toEqual({ ok: false }); // used
    const connection = await getTelegramConnection(user.id);
    expect(connection).toMatchObject({ status: "CONNECTED", username: "me", codeExpiresAt: null });
    expect(await prisma.auditLog.count({ where: { userId: user.id, action: "TELEGRAM_CONNECTED" } })).toBe(1);
  });

  it("rejects an expired code", async () => {
    const user = await createUser();
    const issued = new Date("2026-10-12T06:00:00Z");
    const { code } = await createConnectionCode(user.id, issued);
    expect(await linkTelegramChat(code, { chatId: "3003" }, new Date(issued.getTime() + 10 * 60 * 1000 + 1))).toEqual({ ok: false });
    expect((await getTelegramConnection(user.id, issued)).status).toBe("PENDING");
  });

  it("a chat moves to the account that last linked it", async () => {
    const a = await createUser("A");
    const b = await createUser("B");
    await connect(a.id, "3004");
    await connect(b.id, "3004");
    expect((await getTelegramConnection(a.id)).status).toBe("DISCONNECTED");
    expect((await getTelegramConnection(b.id)).status).toBe("CONNECTED");
  });

  it("disconnect stops reminders", async () => {
    const user = await createUser();
    await connect(user.id, "3005");
    await debtDueIn(user.id, 0);
    await disconnectTelegram(user.id);
    const sender = fakeSender();
    await runReminders({ sender, now: at(0), sleep: noSleep });
    expect(sender.sent).toHaveLength(0);
  });

  it("compares secrets in constant time and rejects missing ones", () => {
    expect(secretMatches("a-long-enough-secret", "a-long-enough-secret")).toBe(true);
    expect(secretMatches("a-long-enough-secreT", "a-long-enough-secret")).toBe(false);
    expect(secretMatches("short", "a-long-enough-secret")).toBe(false);
    expect(secretMatches(null, "a-long-enough-secret")).toBe(false);
    expect(secretMatches("anything", undefined)).toBe(false);
  });
});

describe("bot commands", () => {
  beforeEach(resetDatabase);

  const message = (chatId: string, text: string): TelegramUpdate => ({
    update_id: 1,
    message: { message_id: 1, text, chat: { id: Number(chatId), type: "private" }, from: { id: Number(chatId), username: "u" } },
  });

  it("/start CODE links the chat; commands then show only that user's data", async () => {
    const a = await createUser("A");
    const b = await createUser("B");
    await debtDueIn(a.id, 0, "Alpha loan");
    await debtDueIn(b.id, 0, "Beta loan");
    const sender = fakeSender();

    await handleUpdate(message("4001", "/today"), sender);
    expect(sender.sent.at(-1)!.html).toContain("не подключён");

    const { code } = await createConnectionCode(a.id);
    await handleUpdate(message("4001", `/start ${code}`), sender);
    expect(sender.sent.at(-1)!.html).toContain("Fyndue подключён");

    await handleUpdate(message("4001", "/today"), sender);
    expect(sender.sent.at(-1)!.html).toContain("Alpha loan");
    expect(sender.sent.at(-1)!.html).toContain("сегодня");
    expect(sender.sent.at(-1)!.html).not.toContain("Beta loan");

    await handleUpdate(message("4001", "/debts"), sender);
    expect(sender.sent.at(-1)!.html).toContain("Осталось: 7\u00a0000\u00a0000 UZS");
    expect(sender.sent.at(-1)!.html).not.toContain("Beta loan");

    await handleUpdate(message("4001", "/upcoming"), sender);
    expect(sender.sent.at(-1)!.html).toContain("Ближайшие 14 дней");

    await handleUpdate(message("4001", "/month"), sender);
    expect(sender.sent.at(-1)!.html).toContain("Платежи по долгам:");

    // Another chat cannot see A's data.
    await handleUpdate(message("4002", "/debts"), sender);
    expect(sender.sent.at(-1)!.html).toContain("не подключён");
    expect(sender.sent.at(-1)!.chatId).toBe("4002");
  });

  it("a bad code gets a generic reply and /stop disconnects", async () => {
    const user = await createUser();
    const sender = fakeSender();
    await handleUpdate(message("4003", "/start NOPE2345"), sender);
    expect(sender.sent.at(-1)!.html).toContain("неверный или устарел");

    await connect(user.id, "4003");
    await handleUpdate(message("4003", "/stop"), sender);
    expect((await getTelegramConnection(user.id)).status).toBe("DISCONNECTED");
  });

  it("ignores group chats", async () => {
    const sender = fakeSender();
    await handleUpdate({ update_id: 2, message: { message_id: 1, text: "/today", chat: { id: -5, type: "group" } } }, sender);
    expect(sender.sent).toHaveLength(0);
  });
});
