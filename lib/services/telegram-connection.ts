import "server-only";
import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { writeAudit } from "./audit";

/** No 0/O or 1/I, so a code read off a screen is typed correctly. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
export const CONNECTION_CODE_TTL_MS = 10 * 60 * 1000;

export function hashConnectionCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export type TelegramConnectionDTO = {
  status: "NONE" | "PENDING" | "CONNECTED" | "DISCONNECTED";
  username: string | null;
  connectedAt: string | null;
  /** A code is waiting to be used (the code itself is never stored). */
  codeExpiresAt: string | null;
};

export async function getTelegramConnection(userId: string, now: Date = new Date()): Promise<TelegramConnectionDTO> {
  const row = await prisma.telegramConnection.findUnique({ where: { userId } });
  if (!row) return { status: "NONE", username: null, connectedAt: null, codeExpiresAt: null };
  const codeLive = row.connectionCodeHash && row.connectionCodeExpiresAt && row.connectionCodeExpiresAt > now;
  return {
    status: row.status,
    username: row.telegramUsername,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    codeExpiresAt: codeLive ? row.connectionCodeExpiresAt!.toISOString() : null,
  };
}

/**
 * Issues a one-time code (SPEC §33). Only its SHA-256 is stored; a new code
 * replaces the previous one. An existing link stays active until the new
 * code is used from a (possibly different) chat.
 */
export async function createConnectionCode(userId: string, now: Date = new Date()): Promise<{ code: string; expiresAt: string }> {
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + CONNECTION_CODE_TTL_MS);
  const data = { connectionCodeHash: hashConnectionCode(code), connectionCodeExpiresAt: expiresAt };
  await prisma.telegramConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return { code, expiresAt: expiresAt.toISOString() };
}

export type LinkResult = { ok: true; userId: string } | { ok: false };

/**
 * `/start CODE` from a chat. Valid only if the code exists, is not expired and
 * has not been used; the conditional update makes the code single-use even
 * under concurrent requests. The result never says why a code failed.
 */
export async function linkTelegramChat(
  code: string,
  chat: { chatId: string; username?: string | null },
  now: Date = new Date(),
): Promise<LinkResult> {
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return { ok: false };
  const hash = hashConnectionCode(code);
  return prisma.$transaction(async (tx) => {
    const row = await tx.telegramConnection.findUnique({ where: { connectionCodeHash: hash } });
    if (!row || !row.connectionCodeExpiresAt || row.connectionCodeExpiresAt <= now) return { ok: false } as const;

    // A chat belongs to one user: move it if another account had it.
    await tx.telegramConnection.updateMany({
      where: { telegramChatId: chat.chatId, NOT: { id: row.id } },
      data: { telegramChatId: null, status: "DISCONNECTED" },
    });
    const claimed = await tx.telegramConnection.updateMany({
      where: { id: row.id, connectionCodeHash: hash },
      data: {
        telegramChatId: chat.chatId,
        telegramUsername: chat.username?.slice(0, 64) ?? null,
        status: "CONNECTED",
        connectedAt: now,
        connectionCodeHash: null,
        connectionCodeExpiresAt: null,
      },
    });
    if (claimed.count !== 1) return { ok: false } as const;
    await writeAudit(tx, { userId: row.userId, action: "TELEGRAM_CONNECTED", entityType: "TelegramConnection", entityId: row.id });
    return { ok: true, userId: row.userId } as const;
  });
}

export async function disconnectTelegram(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.telegramConnection.findUnique({ where: { userId } });
    if (!row) throw new DomainError("Telegram не подключён.");
    await tx.telegramConnection.update({
      where: { id: row.id },
      data: { status: "DISCONNECTED", telegramChatId: null, connectionCodeHash: null, connectionCodeExpiresAt: null },
    });
    await tx.notificationLog.updateMany({
      where: { userId, channel: "TELEGRAM", status: { in: ["PENDING", "FAILED"] } },
      data: { status: "CANCELLED" },
    });
    await writeAudit(tx, { userId, action: "TELEGRAM_DISCONNECTED", entityType: "TelegramConnection", entityId: row.id });
  });
}

/** Resolves a chat to its user; only CONNECTED links count. */
export async function userIdForChat(chatId: string): Promise<string | null> {
  const row = await prisma.telegramConnection.findFirst({
    where: { telegramChatId: chatId, status: "CONNECTED" },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

/** The user blocked the bot (Telegram 403) or sent /stop. */
export async function disconnectChat(chatId: string): Promise<void> {
  const row = await prisma.telegramConnection.findFirst({ where: { telegramChatId: chatId } });
  if (!row) return;
  await prisma.$transaction(async (tx) => {
    await tx.telegramConnection.update({ where: { id: row.id }, data: { status: "DISCONNECTED", telegramChatId: null } });
    await tx.notificationLog.updateMany({
      where: { userId: row.userId, channel: "TELEGRAM", status: { in: ["PENDING", "FAILED"] } },
      data: { status: "CANCELLED" },
    });
    await writeAudit(tx, { userId: row.userId, action: "TELEGRAM_DISCONNECTED", entityType: "TelegramConnection", entityId: row.id });
  });
}
