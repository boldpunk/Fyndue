import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env, telegramEnabled } from "@/lib/env";
import { createTelegramClient, type TelegramClient } from "./client";

/** The bot client, or null when TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME are not set. */
export function getTelegramClient(): TelegramClient | null {
  return telegramEnabled && env.TELEGRAM_BOT_TOKEN ? createTelegramClient(env.TELEGRAM_BOT_TOKEN) : null;
}

export function botUsername(): string | null {
  return telegramEnabled ? (env.TELEGRAM_BOT_USERNAME ?? null) : null;
}

/** Constant-time comparison of a presented secret with the expected one. */
export function secretMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  // Hash both so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
