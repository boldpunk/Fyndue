import "server-only";
import { prisma } from "@/lib/db";
import { formatYearMonthLabel, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { formatMoney, sumMoney, toMoneyString } from "@/lib/finance/money";
import { getMonthOverview, type CurrencyTotals } from "@/lib/services/dashboard";
import { debtTotalsByCurrency, listDebts, listUpcomingPayments, type UpcomingPaymentDTO } from "@/lib/services/debts";
import { disconnectChat, linkTelegramChat, userIdForChat } from "@/lib/services/telegram-connection";
import type { TelegramSender, TelegramUpdate } from "./client";
import { parseCommand } from "./commands-parse";
import { debtEmoji, escapeHtml, formatDueDate, plural } from "./messages";

/**
 * Bot commands (SPEC §34). Every data command resolves the user from the
 * chat through a CONNECTED TelegramConnection and then calls the same
 * userId-scoped services as the web app, so a chat can only ever see the
 * data of the account it was linked to.
 */

export const BOT_COMMANDS = [
  { command: "today", description: "Payments due today and overdue" },
  { command: "upcoming", description: "Payments in the next 14 days" },
  { command: "debts", description: "Remaining debt and progress" },
  { command: "month", description: "This month's income, expenses and debt payments" },
  { command: "help", description: "What this bot can do" },
  { command: "stop", description: "Disconnect this chat from Fyndue" },
];

const HELP = [
  "<b>Fyndue</b> sends payment reminders and answers:",
  "",
  ...BOT_COMMANDS.map((c) => `/${c.command} — ${c.description}`),
].join("\n");

const NOT_LINKED = "This chat isn't connected to Fyndue.\n\nOpen Fyndue → Settings → Notifications → <b>Connect Telegram</b>, then send the code shown there.";
const BAD_CODE = "That code is invalid or has expired.\n\nCreate a new one in Fyndue → Settings → Notifications.";

const m = (amount: string, currency: string) => escapeHtml(formatMoney(amount, currency));

async function todayFor(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  return todayIn(user.timezone);
}

function paymentLine(p: UpcomingPaymentDTO, today: string): string {
  const when =
    p.days < 0 ? `⚠️ overdue ${plural(-p.days, "day")}` : p.days === 0 ? "due today" : `${formatDueDate(p.dueDate, today)} · in ${plural(p.days, "day")}`;
  return `• <b>${escapeHtml(p.debt.name)}</b>\n${m(p.remainingTotal, p.debt.currency)} — ${when}`;
}

async function paymentsReply(userId: string, untilDays: number, title: string, empty: string): Promise<string> {
  const [payments, today] = await Promise.all([listUpcomingPayments(userId, { untilDays }), todayFor(userId)]);
  if (payments.length === 0) return empty;
  return [`<b>${title}</b>`, "", ...payments.map((p) => paymentLine(p, today)).flatMap((l) => [l, ""]), ...totalLines(payments)].join("\n").trim();
}

function totalLines(payments: UpcomingPaymentDTO[]): string[] {
  if (payments.length < 2) return [];
  const currencies = [...new Set(payments.map((p) => p.debt.currency))];
  return currencies.map((currency) => {
    const total = sumMoney(payments.filter((p) => p.debt.currency === currency).map((p) => p.remainingTotal));
    return `Total: <b>${m(toMoneyString(total), currency)}</b>`;
  });
}

async function debtsReply(userId: string): Promise<string> {
  const debts = await listDebts(userId, "active");
  if (debts.length === 0) return "No active debts. 🎉";
  const today = await todayFor(userId);
  const lines = debts.flatMap((d) => [
    `${debtEmoji(d.type)} <b>${escapeHtml(d.name)}</b>`,
    `Remaining: ${m(d.currentPrincipal, d.currency)} · ${d.paidPercent}% paid`,
    d.nextPayment ? `Next: ${m(d.nextPayment.amountDue, d.currency)} on ${formatDueDate(d.nextPayment.dueDate, today)}` : "No payments scheduled",
    "",
  ]);
  const totals = debtTotalsByCurrency(debts).map((t) => `Total remaining: <b>${m(t.remainingPrincipal, t.currency)}</b> · ${t.paidPercent}% paid`);
  return ["<b>Active debts</b>", "", ...lines, ...totals].join("\n").trim();
}

function totalsText(label: string, totals: CurrencyTotals): string {
  return `${label}: ${totals.length ? totals.map((t) => `<b>${m(t.amount, t.currency)}</b>`).join(" · ") : "—"}`;
}

async function monthReply(userId: string): Promise<string> {
  const month = yearMonthOf(await todayFor(userId));
  const o = await getMonthOverview(userId, month);
  return [
    `<b>${formatYearMonthLabel(month, "en-GB")}</b>`,
    "",
    totalsText("Income", o.income),
    totalsText("Expenses", o.expenses),
    totalsText("Debt payments", o.debtPayments),
    ...(o.expectedIncome.length ? ["", totalsText("Still expected", o.expectedIncome)] : []),
  ].join("\n");
}

async function reply(command: string, args: string[], chat: { chatId: string; username?: string }): Promise<string | null> {
  if (command === "start") {
    const code = args[0];
    if (code) {
      const linked = await linkTelegramChat(code, chat);
      return linked.ok ? `✅ <b>Connected to Fyndue</b>\n\nPayment reminders will arrive here.\n\n${HELP}` : BAD_CODE;
    }
    return (await userIdForChat(chat.chatId)) ? HELP : NOT_LINKED;
  }
  if (command === "help") return (await userIdForChat(chat.chatId)) ? HELP : NOT_LINKED;

  const userId = await userIdForChat(chat.chatId);
  if (!userId) return NOT_LINKED;
  switch (command) {
    case "today":
      return paymentsReply(userId, 0, "Due today", "Nothing due today and nothing overdue. ✅");
    case "upcoming":
      return paymentsReply(userId, 14, "Next 14 days", "No payments in the next 14 days. ✅");
    case "debts":
      return debtsReply(userId);
    case "month":
      return monthReply(userId);
    case "stop":
      await disconnectChat(chat.chatId);
      return "Disconnected. You won't get reminders here any more.\n\nReconnect any time from Fyndue → Settings → Notifications.";
    default:
      return `Unknown command.\n\n${HELP}`;
  }
}

/** Handles one update from the webhook or long polling. Only private chats are served. */
export async function handleUpdate(update: TelegramUpdate, sender: TelegramSender): Promise<void> {
  const message = update.message;
  if (!message || message.chat.type !== "private" || message.from?.is_bot) return;
  const parsed = parseCommand(message.text);
  const chat = { chatId: String(message.chat.id), username: message.from?.username };
  const text = parsed ? await reply(parsed.command, parsed.args, chat) : `Send a command, for example /today.\n\n${HELP}`;
  if (text) await sender.sendMessage(chat.chatId, text);
}
