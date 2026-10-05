import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { TelegramSender, TelegramUpdate } from "@/lib/telegram/client";
import { createUser, resetDatabase } from "../support/factories";

// The phone plugin is on only when the bot is configured; never reached over the network here.
process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
process.env.TELEGRAM_BOT_USERNAME = "fyndue_test_bot";

function fakeSender() {
  const sent: { chatId: string; html: string; options?: unknown }[] = [];
  const sender: TelegramSender & { sent: typeof sent } = {
    sent,
    async sendMessage(chatId, html, options) {
      sent.push({ chatId, html, options });
      return { messageId: String(sent.length) };
    },
  };
  return sender;
}

const PHONE = "+998901234567";
const contactUpdate = (fromId: number, contactUserId: number | undefined, phone = "998901234567"): TelegramUpdate => ({
  update_id: 1,
  message: { message_id: 1, chat: { id: fromId, type: "private" }, from: { id: fromId }, contact: { phone_number: phone, user_id: contactUserId } },
});
const codeIn = (html: string) => /<b>(\d{6})<\/b>/.exec(html)?.[1];

let auth: typeof import("@/lib/auth/auth").auth;
let handleUpdate: typeof import("@/lib/telegram/commands").handleUpdate;
let services: typeof import("@/lib/services/phone-auth");

beforeAll(async () => {
  auth = (await import("@/lib/auth/auth")).auth;
  handleUpdate = (await import("@/lib/telegram/commands")).handleUpdate;
  services = await import("@/lib/services/phone-auth");
});

describe("phone sign-in over Telegram", () => {
  beforeEach(resetDatabase);

  it("sign-up: code requested on the site, delivered once the contact is shared, account created and reminders connected", async () => {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } });
    const sender = fakeSender();
    await handleUpdate(contactUpdate(5550001, 5550001), sender);

    // The waiting code first, then the confirmation (keyboard removed).
    expect(sender.sent).toHaveLength(2);
    const code = codeIn(sender.sent[0]!.html);
    expect(code).toMatch(/^\d{6}$/);
    expect(sender.sent[1]!.html).toContain("Номер +998 90 123 45 67 подтверждён");
    expect(sender.sent[1]!.options).toEqual({ replyMarkup: { remove_keyboard: true } });

    const result = await auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: code! } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.user!.id } });
    expect(user).toMatchObject({ phoneNumber: PHONE, phoneNumberVerified: true, email: "998901234567@phone.fyndue.uz" });
    expect(await prisma.category.count({ where: { userId: user.id } })).toBeGreaterThan(10); // bootstrapped
    expect(await prisma.telegramConnection.findUnique({ where: { userId: user.id } })).toMatchObject({ telegramChatId: "5550001", status: "CONNECTED" });

    // A code works once.
    await expect(auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: code! } })).rejects.toThrow();
  });

  it("refuses someone else's contact and wrong codes", async () => {
    const sender = fakeSender();
    await handleUpdate(contactUpdate(5550002, 99999), sender);
    expect(sender.sent[0]!.html).toContain("своим номером");
    expect(await prisma.telegramPhone.count()).toBe(0);

    await handleUpdate(contactUpdate(5550002, 5550002), sender);
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: PHONE } }).catch(() => undefined); // real send would need the network
    await expect(auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: "000000" } })).rejects.toThrow();
    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: "+99890123" } })).rejects.toThrow();
  });

  it("delivers codes only to a confirmed chat", async () => {
    const sender = fakeSender();
    expect(await services.deliverPhoneOtp(PHONE, "123456", sender)).toBe(false);
    await services.confirmPhoneFromContact({ chatId: "777", fromUserId: 777, contactUserId: 777, phoneNumber: "+998901234567" }, sender);
    expect(await services.deliverPhoneOtp(PHONE, "123456", sender)).toBe(true);
    expect(sender.sent.at(-1)).toMatchObject({ chatId: "777" });
    expect(sender.sent.at(-1)!.html).toContain("<b>123456</b>");
  });

  it("an email account already connected to the bot gets the number, so its owner can sign in by phone", async () => {
    const owner = await createUser("Saidakbar");
    await prisma.telegramConnection.create({ data: { userId: owner.id, telegramChatId: "4242", status: "CONNECTED", connectedAt: new Date() } });
    const sender = fakeSender();
    await handleUpdate(contactUpdate(4242, 4242), sender);
    expect(sender.sent.at(-1)!.html).toContain("привязан к вашему аккаунту");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).phoneNumber).toBe(PHONE);

    // The code now signs in to that same account instead of creating a new one.
    await prisma.verification.create({ data: { id: "v1", identifier: PHONE, value: "654321:0", expiresAt: new Date(Date.now() + 60_000) } });
    const result = await auth.api.verifyPhoneNumber({ body: { phoneNumber: PHONE, code: "654321" } });
    expect(result.user!.id).toBe(owner.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("the login deep link and /phone ask for the contact", async () => {
    const sender = fakeSender();
    await handleUpdate({ update_id: 2, message: { message_id: 2, chat: { id: 31, type: "private" }, from: { id: 31 }, text: "/start login" } }, sender);
    await handleUpdate({ update_id: 3, message: { message_id: 3, chat: { id: 31, type: "private" }, from: { id: 31 }, text: "/phone" } }, sender);
    for (const m of sender.sent) {
      expect(m.html).toContain("Поделиться номером");
      expect(JSON.stringify(m.options)).toContain("request_contact");
    }
  });
});
