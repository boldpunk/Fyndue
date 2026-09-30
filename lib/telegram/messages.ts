/**
 * Telegram message formatting (SPEC §34). Pure; HTML parse mode, so every
 * piece of user text goes through escapeHtml. Messages carry debt names and
 * amounts only: never account numbers, emails or links with tokens.
 */
import { formatLocalDate, parseLocalDate, type LocalDate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import type { ReminderIntent } from "@/lib/notifications/planner";

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const DEBT_EMOJI: Record<string, string> = {
  CAR_LOAN: "🚘",
  INSTALLMENT: "🛍️",
  MICROLOAN: "💸",
  CREDIT_CARD: "💳",
  MORTGAGE: "🏠",
  PERSONAL: "🤝",
  CREDIT: "🏦",
};

export function debtEmoji(type: string): string {
  return DEBT_EMOJI[type] ?? "📌";
}

/** "15 October", with the year only when it isn't the current one. */
export function formatDueDate(date: LocalDate, today: LocalDate): string {
  const sameYear = parseLocalDate(date).year === parseLocalDate(today).year;
  return formatLocalDate(date, "en-GB", sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const money = (amount: string, currency: string) => escapeHtml(formatMoney(amount, currency));

export function formatReminder(intent: ReminderIntent, today: LocalDate): string {
  const { item } = intent;
  const name = escapeHtml(item.debtName);
  const due = formatDueDate(item.dueDate, today);
  if (intent.type === "OVERDUE") {
    return [
      "⚠️ <b>Payment overdue</b>",
      "",
      name,
      "",
      "Expected payment:",
      `<b>${money(item.amountDue, item.currency)}</b>`,
      "",
      "Due date:",
      due,
      "",
      "Overdue:",
      plural(intent.days, "day"),
    ].join("\n");
  }
  return [
    `${debtEmoji(item.debtType)} <b>${name}</b>`,
    "",
    intent.type === "DUE_TODAY" ? "Payment due today" : `Payment in ${plural(intent.days, "day")}`,
    "",
    `<b>${money(item.amountDue, item.currency)}</b>`,
    "",
    "Due:",
    due,
    "",
    "Remaining debt:",
    money(item.remainingPrincipal, item.currency),
  ].join("\n");
}

export const DIGEST_SEPARATOR = "━━━━━━━━";

/** Several reminders for one user go out as one message (rate limiting). */
export function formatDigest(intents: ReminderIntent[], today: LocalDate): string {
  return intents.map((i) => formatReminder(i, today)).join(`\n\n${DIGEST_SEPARATOR}\n\n`);
}
