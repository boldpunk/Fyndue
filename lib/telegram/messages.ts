/**
 * Telegram message formatting (SPEC §34). Pure; HTML parse mode, so every
 * piece of user text goes through escapeHtml. Messages carry debt names and
 * amounts only: never account numbers, emails or links with tokens.
 */
import { formatLocalDate, parseLocalDate, type LocalDate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { pluralRu } from "@/lib/finance/recurrence";
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

/** "15 октября", with the year only when it isn't the current one ("1 января 2027"). */
export function formatDueDate(date: LocalDate, today: LocalDate): string {
  const sameYear = parseLocalDate(date).year === parseLocalDate(today).year;
  const text = formatLocalDate(date, undefined, sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
  return text.replace(/\s*г\.$/, "");
}

/** "1 день", "3 дня", "5 дней". */
export function days(n: number): string {
  return `${n} ${pluralRu(n, ["день", "дня", "дней"])}`;
}

const money = (amount: string, currency: string) => escapeHtml(formatMoney(amount, currency));

export function formatReminder(intent: ReminderIntent, today: LocalDate): string {
  const { item } = intent;
  const name = escapeHtml(item.debtName);
  const due = formatDueDate(item.dueDate, today);
  if (intent.type === "OVERDUE") {
    return [
      "⚠️ <b>Платёж просрочен</b>",
      "",
      name,
      "",
      "Нужно оплатить:",
      `<b>${money(item.amountDue, item.currency)}</b>`,
      "",
      "Срок был:",
      due,
      "",
      "Просрочка:",
      days(intent.days),
    ].join("\n");
  }
  return [
    `${debtEmoji(item.debtType)} <b>${name}</b>`,
    "",
    intent.type === "DUE_TODAY" ? "Платёж сегодня" : `Платёж через ${days(intent.days)}`,
    "",
    `<b>${money(item.amountDue, item.currency)}</b>`,
    "",
    "Срок:",
    due,
    "",
    "Остаток долга:",
    money(item.remainingPrincipal, item.currency),
  ].join("\n");
}

export const DIGEST_SEPARATOR = "━━━━━━━━";

/** Several reminders for one user go out as one message (rate limiting). */
export function formatDigest(intents: ReminderIntent[], today: LocalDate): string {
  return intents.map((i) => formatReminder(i, today)).join(`\n\n${DIGEST_SEPARATOR}\n\n`);
}
