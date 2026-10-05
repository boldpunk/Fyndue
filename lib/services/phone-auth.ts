import "server-only";
import { prisma } from "@/lib/db";
import { formatPhone, normalizePhone } from "@/lib/auth/phone";
import type { TelegramSender } from "@/lib/telegram/client";
import { writeAudit } from "./audit";

/**
 * Phone sign-in over Telegram (docs/telegram.md §9). A bot cannot write to a
 * phone number, so the number is first confirmed in the bot: the user shares
 * their contact, Telegram guarantees it is theirs (contact.user_id = sender),
 * and the chat is remembered for that number. Codes are generated and checked
 * by Better Auth's phone-number plugin; this module only delivers them.
 */

const otpMessage = (code: string) =>
  `🔐 Код для входа в Fyndue: <b>${code}</b>\n\nДействует 5 минут. Никому его не сообщайте — сотрудники Fyndue никогда его не спрашивают.`;

/** Sends a fresh code to the number's confirmed chat; false when the number was never confirmed in the bot. */
export async function deliverPhoneOtp(phoneNumber: string, code: string, sender: TelegramSender | null): Promise<boolean> {
  if (!sender) return false;
  const link = await prisma.telegramPhone.findUnique({ where: { phoneNumber } });
  if (!link) return false;
  await sender.sendMessage(link.chatId, otpMessage(code));
  return true;
}

/** The code waiting for this number (Better Auth stores "<code>:<attempts>"), if any. */
async function pendingCode(phoneNumber: string, now: Date): Promise<string | null> {
  const row = await prisma.verification.findFirst({
    where: { identifier: phoneNumber, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  const code = row?.value.split(":")[0];
  return code && /^\d{4,8}$/.test(code) ? code : null;
}

export type ContactResult = {
  /** The shared number, normalised; null when the contact was rejected. */
  phoneNumber: string | null;
  /** A pending sign-in code was sent right away. */
  codeSent: boolean;
  /** The number was attached to the account this chat is already connected to. */
  linkedToAccount: boolean;
};

/**
 * A contact shared in the bot. Only the sender's own contact counts. The
 * number is remembered for this chat (replacing older links of either), a
 * waiting code is sent, and an account already connected to this chat that
 * has no number gets this one — so its owner can sign in by phone too.
 */
export async function confirmPhoneFromContact(
  input: { chatId: string; fromUserId: number; contactUserId?: number; phoneNumber: string },
  sender: TelegramSender,
  now: Date = new Date(),
): Promise<ContactResult> {
  const phone = normalizePhone(input.phoneNumber.startsWith("+") ? input.phoneNumber : `+${input.phoneNumber}`);
  if (!phone || input.contactUserId !== input.fromUserId) return { phoneNumber: null, codeSent: false, linkedToAccount: false };

  await prisma.$transaction(async (tx) => {
    await tx.telegramPhone.deleteMany({ where: { OR: [{ chatId: input.chatId }, { phoneNumber: phone }] } });
    await tx.telegramPhone.create({ data: { phoneNumber: phone, chatId: input.chatId, telegramUserId: String(input.fromUserId) } });
  });

  let linkedToAccount = false;
  const connection = await prisma.telegramConnection.findFirst({ where: { telegramChatId: input.chatId, status: "CONNECTED" }, include: { user: true } });
  if (connection && !connection.user.phoneNumber && !(await prisma.user.findUnique({ where: { phoneNumber: phone } }))) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: connection.userId }, data: { phoneNumber: phone, phoneNumberVerified: true } });
      await writeAudit(tx, { userId: connection.userId, action: "PROFILE_UPDATED", entityType: "User", entityId: connection.userId, metadata: { phoneNumber: "linked via Telegram" } });
    });
    linkedToAccount = true;
  }

  const code = await pendingCode(phone, now);
  if (code) await sender.sendMessage(input.chatId, otpMessage(code));
  return { phoneNumber: phone, codeSent: Boolean(code), linkedToAccount };
}

export function contactReply(result: ContactResult): string {
  if (!result.phoneNumber) return "Поделитесь, пожалуйста, своим номером — кнопкой «📱 Поделиться номером» ниже.";
  const lines = [`✅ Номер ${formatPhone(result.phoneNumber)} подтверждён.`];
  if (result.linkedToAccount) lines.push("", "Он привязан к вашему аккаунту Fyndue — теперь можно входить по номеру телефона.");
  lines.push("", result.codeSent ? "Код для входа — в сообщении выше." : "Теперь вернитесь на сайт и нажмите «Получить код» — он придёт сюда.");
  return lines.join("\n");
}

/**
 * After a phone sign-in or sign-up: connect reminders to the chat that
 * confirmed the number, unless the account or the chat is already connected.
 */
export async function connectTelegramForPhone(userId: string, phoneNumber: string, now: Date = new Date()): Promise<void> {
  const link = await prisma.telegramPhone.findUnique({ where: { phoneNumber } });
  if (!link) return;
  const [mine, chatTaken] = await Promise.all([
    prisma.telegramConnection.findUnique({ where: { userId } }),
    prisma.telegramConnection.findFirst({ where: { telegramChatId: link.chatId, status: "CONNECTED" } }),
  ]);
  if ((mine && mine.status === "CONNECTED") || chatTaken) return;
  await prisma.$transaction(async (tx) => {
    const row = await tx.telegramConnection.upsert({
      where: { userId },
      create: { userId, telegramChatId: link.chatId, status: "CONNECTED", connectedAt: now },
      update: { telegramChatId: link.chatId, status: "CONNECTED", connectedAt: now, connectionCodeHash: null, connectionCodeExpiresAt: null },
    });
    await writeAudit(tx, { userId, action: "TELEGRAM_CONNECTED", entityType: "TelegramConnection", entityId: row.id, metadata: { via: "phone sign-in" } });
  });
}
