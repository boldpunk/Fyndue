import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError, ProRequiredError } from "@/lib/errors";
import type { TelegramSender } from "@/lib/telegram/client";
import { createTestAccount, createUser, resetDatabase } from "../support/factories";

// Before any import reads the environment (the factories load the services).
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = "boss@fyndue.test";
});

let billing: typeof import("@/lib/services/billing");
let goals: typeof import("@/lib/services/goals");
let templates: typeof import("@/lib/services/templates");
let sharing: typeof import("@/lib/services/shared-accounts");
let categories: typeof import("../support/factories");
beforeAll(async () => {
  billing = await import("@/lib/services/billing");
  goals = await import("@/lib/services/goals");
  templates = await import("@/lib/services/templates");
  sharing = await import("@/lib/services/shared-accounts");
  categories = await import("../support/factories");
});

function fakeSender() {
  const sent: { chatId: string; html: string }[] = [];
  const sender: TelegramSender & { sent: typeof sent } = { sent, async sendMessage(chatId, html) { sent.push({ chatId, html }); return { messageId: "1" }; } };
  return sender;
}

/** A user whose sign-up trial is long over. */
async function freeUser(name = "Free") {
  const user = await createUser(name);
  await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date("2026-01-01T00:00:00Z"), proUntil: null, trialEndsAt: null } });
  return user;
}

async function admin() {
  const user = await createUser("Boss");
  await prisma.user.update({ where: { id: user.id }, data: { email: "boss@fyndue.test" } });
  await prisma.telegramConnection.create({ data: { userId: user.id, telegramChatId: "900", status: "CONNECTED" } });
  return user;
}

describe("Fyndue Pro", () => {
  beforeEach(resetDatabase);

  it("new users are on the trial; Free hits limits and Pro-only features", async () => {
    const fresh = await createUser();
    expect(await billing.getPlan(fresh.id)).toMatchObject({ tier: "pro", reason: "trial", daysLeft: 14 });

    const user = await freeUser();
    expect((await billing.getPlan(user.id)).tier).toBe("free");
    for (let i = 0; i < 3; i++) await createTestAccount(user.id, { name: `Счёт ${i}` });
    await expect(createTestAccount(user.id, { name: "Четвёртый" })).rejects.toThrow(ProRequiredError);
    await expect(createTestAccount(user.id, { name: "Четвёртый" })).rejects.toThrow("до 3 счетов");

    await goals.createGoal(user.id, { name: "Одна", icon: "plane", targetAmount: "1.00", currency: "UZS" });
    await expect(goals.createGoal(user.id, { name: "Вторая", icon: "plane", targetAmount: "1.00", currency: "UZS" })).rejects.toThrow(ProRequiredError);
    await expect(templates.createTemplate(user.id, { name: "x", kind: "EXPENSE", categoryId: await categories.categoryId(user.id, "Такси") })).rejects.toThrow("Шаблоны операций");
    expect(await billing.getUsage(user.id)).toMatchObject({ accounts: { used: 3, limit: 3 }, goals: { used: 1, limit: 1 } });
  });

  it("«Я оплатил» → admin confirms → Pro until +30 days; the user and admins are told", async () => {
    const boss = await admin();
    const user = await freeUser("Азиз");
    await prisma.telegramConnection.create({ data: { userId: user.id, telegramChatId: "777", status: "CONNECTED" } });
    const sender = fakeSender();

    const first = await billing.requestPro(user.id, "YEAR", sender);
    const { id } = await billing.requestPro(user.id, "MONTH", sender); // replaces the first
    expect(sender.sent.at(-1)).toMatchObject({ chatId: "900" });
    expect(sender.sent.at(-1)!.html).toMatch(/29\s000/u);
    const pending = await billing.listPendingProRequests(boss.id);
    expect(pending.map((p) => p.id)).toEqual([id]);
    expect(pending[0]).toMatchObject({ period: "MONTH", amount: "29000.00", user: { name: "Азиз" } });
    expect((await prisma.proPayment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("CANCELLED");

    const now = new Date("2026-10-07T12:00:00Z");
    await billing.decideProRequest(boss.id, id, true, sender, now);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).proUntil).toEqual(new Date("2026-11-06T12:00:00Z"));
    expect(sender.sent.at(-1)).toMatchObject({ chatId: "777" });
    expect(sender.sent.at(-1)!.html).toContain("Fyndue Pro включён");
    await expect(billing.decideProRequest(boss.id, id, true, sender, now)).rejects.toThrow("уже обработана");

    // A year on top starts when the month ends.
    await billing.grantPro(boss.id, user.id, 365, "подарок", null, now);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).proUntil).toEqual(new Date("2027-11-06T12:00:00Z"));
    await billing.revokePro(boss.id, user.id);
    expect((await billing.getPlan(user.id)).tier).toBe("free");
  });

  it("only admins confirm, grant or list; users cancel only their own request", async () => {
    const user = await freeUser();
    const other = await freeUser("Other");
    const { id } = await billing.requestPro(user.id, "MONTH");
    await expect(billing.listPendingProRequests(user.id)).rejects.toThrow(DomainError);
    await expect(billing.decideProRequest(user.id, id, true)).rejects.toThrow(DomainError);
    await expect(billing.grantPro(user.id, user.id, 30, undefined)).rejects.toThrow(DomainError);
    await expect(billing.cancelProRequest(other.id, id)).rejects.toThrow(DomainError);
    await billing.cancelProRequest(user.id, id);
    expect((await billing.getPlan(user.id)).tier).toBe("free");
  });

  it("a family card needs the owner's Pro; members stop adding when it ends", async () => {
    const owner = await createUser("Owner");
    const member = await createUser("Member");
    const card = await createTestAccount(owner.id);
    await sharing.shareAccount(owner.id, { accountId: card.id, contact: member.email });
    await prisma.user.update({ where: { id: owner.id }, data: { createdAt: new Date("2026-01-01"), proUntil: null, trialEndsAt: null } });
    const food = await categories.categoryId(owner.id, "Продукты");
    await expect(
      sharing.createSharedTransaction(member.id, { kind: "EXPENSE", accountId: card.id, categoryId: food, amount: "1.00", date: "2026-10-05", clientRequestId: categories.requestId() }),
    ).rejects.toThrow("закончился Fyndue Pro");
    const second = await createUser("Second");
    await expect(sharing.shareAccount(owner.id, { accountId: card.id, contact: second.email })).rejects.toThrow(ProRequiredError);
  });
});

describe("Pro expiry notice", () => {
  beforeEach(resetDatabase);

  it("reminds once, three days before the end", async () => {
    const user = await freeUser("Азиз");
    await prisma.telegramConnection.create({ data: { userId: user.id, telegramChatId: "555", status: "CONNECTED" } });
    const now = new Date("2026-10-07T09:00:00Z");
    await prisma.user.update({ where: { id: user.id }, data: { proUntil: new Date("2026-10-20T00:00:00Z") } });
    const sender = fakeSender();
    expect(await billing.sendProExpiryNotices(sender, now)).toBe(0); // 13 days left
    const later = new Date("2026-10-18T09:00:00Z");
    expect(await billing.sendProExpiryNotices(sender, later)).toBe(1);
    expect(await billing.sendProExpiryNotices(sender, later)).toBe(0); // once
    expect(sender.sent[0]).toMatchObject({ chatId: "555" });
    expect(sender.sent[0]!.html).toContain("Fyndue Pro заканчивается");
  });
});
