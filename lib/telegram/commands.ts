import "server-only";
import { prisma } from "@/lib/db";
import { addDays, daysBetween, formatYearMonthLabel, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { formatMoney, sumMoney, toMoneyString } from "@/lib/finance/money";
import { getMonthOverview, type CurrencyTotals } from "@/lib/services/dashboard";
import { debtTotalsByCurrency, listDebts, listUpcomingPayments, type UpcomingPaymentDTO } from "@/lib/services/debts";
import { getSubscriptions } from "@/lib/services/subscriptions";
import { disconnectChat, linkTelegramChat, userIdForChat } from "@/lib/services/telegram-connection";
import type { TelegramSender, TelegramUpdate } from "./client";
import { parseCommand } from "./commands-parse";
import { days, debtEmoji, escapeHtml, formatDueDate } from "./messages";

/**
 * Bot commands (SPEC §34). Every data command resolves the user from the
 * chat through a CONNECTED TelegramConnection and then calls the same
 * userId-scoped services as the web app, so a chat can only ever see the
 * data of the account it was linked to.
 */

export const BOT_COMMANDS = [
  { command: "today", description: "Платежи на сегодня и просроченные" },
  { command: "upcoming", description: "Платежи на ближайшие 14 дней" },
  { command: "debts", description: "Остаток долгов и прогресс" },
  { command: "month", description: "Доходы, расходы и платежи за месяц" },
  { command: "subs", description: "Подписки: сколько в месяц и ближайшие списания" },
  { command: "help", description: "Что умеет бот" },
  { command: "stop", description: "Отключить этот чат от Fyndue" },
];

const HELP = [
  "<b>Fyndue</b> напоминает о платежах и отвечает на команды:",
  "",
  ...BOT_COMMANDS.map((c) => `/${c.command} — ${c.description}`),
].join("\n");

const NOT_LINKED = "Этот чат не подключён к Fyndue.\n\nОткройте Fyndue → Настройки → Уведомления → <b>Подключить Telegram</b> и отправьте показанный там код.";
const BAD_CODE = "Код неверный или устарел.\n\nСоздайте новый в Fyndue → Настройки → Уведомления.";

const m = (amount: string, currency: string) => escapeHtml(formatMoney(amount, currency));

async function todayFor(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  return todayIn(user.timezone);
}

function paymentLine(p: UpcomingPaymentDTO, today: string): string {
  const when =
    p.days < 0 ? `⚠️ просрочен на ${days(-p.days)}` : p.days === 0 ? "сегодня" : `${formatDueDate(p.dueDate, today)} · через ${days(p.days)}`;
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
    return `Итого: <b>${m(toMoneyString(total), currency)}</b>`;
  });
}

async function debtsReply(userId: string): Promise<string> {
  const debts = await listDebts(userId, "active");
  if (debts.length === 0) return "Активных долгов нет. 🎉";
  const today = await todayFor(userId);
  const lines = debts.flatMap((d) => [
    `${debtEmoji(d.type)} <b>${escapeHtml(d.name)}</b>`,
    `Осталось: ${m(d.currentPrincipal, d.currency)} · выплачено ${d.paidPercent}%`,
    d.nextPayment ? `Следующий: ${m(d.nextPayment.amountDue, d.currency)} — ${formatDueDate(d.nextPayment.dueDate, today)}` : "Платежей по графику нет",
    "",
  ]);
  const totals = debtTotalsByCurrency(debts).map((t) => `Всего осталось: <b>${m(t.remainingPrincipal, t.currency)}</b> · выплачено ${t.paidPercent}%`);
  return ["<b>Активные долги</b>", "", ...lines, ...totals].join("\n").trim();
}

function totalsText(label: string, totals: CurrencyTotals): string {
  return `${label}: ${totals.length ? totals.map((t) => `<b>${m(t.amount, t.currency)}</b>`).join(" · ") : "—"}`;
}

async function monthReply(userId: string): Promise<string> {
  const month = yearMonthOf(await todayFor(userId));
  const o = await getMonthOverview(userId, month);
  return [
    `<b>${formatYearMonthLabel(month)}</b>`,
    "",
    totalsText("Доходы", o.income),
    totalsText("Расходы", o.expenses),
    totalsText("Платежи по долгам", o.debtPayments),
    ...(o.expectedIncome.length ? ["", totalsText("Ещё ожидается", o.expectedIncome)] : []),
  ].join("\n");
}

/** Upcoming charges show this far ahead. */
const SUBS_WINDOW_DAYS = 30;

async function subscriptionsReply(userId: string): Promise<string> {
  const { items, summary, baseCurrency, today } = await getSubscriptions(userId);
  const active = items.filter((i) => i.isActive);
  if (active.length === 0) return "Подписок пока нет.\n\nДобавьте их в Fyndue → Подписки — я буду напоминать о списаниях.";
  const perMonth = summary.byCurrency.map((c) => m(c.monthly, c.currency)).join(" + ");
  const head =
    summary.byCurrency.length > 1 && summary.combined
      ? `В месяц ≈ <b>${m(summary.combined.monthly, baseCurrency)}</b>\n(${perMonth})`
      : `В месяц: <b>${perMonth}</b>`;
  const horizon = addDays(today, SUBS_WINDOW_DAYS);
  const upcoming = active.filter((i) => i.nextOccurrence && daysBetween(i.nextOccurrence, horizon) >= 0);
  const lines = upcoming.map((i) => {
    const d = daysBetween(today, i.nextOccurrence!);
    const when = d === 0 ? "сегодня" : d === 1 ? "завтра" : `${formatDueDate(i.nextOccurrence!, today)} · через ${days(d)}`;
    return `• <b>${escapeHtml(i.name)}</b> — ${m(i.amount, i.currency)}\n${when}`;
  });
  return [
    `🔁 <b>Подписки</b> · ${active.length}`,
    "",
    head,
    "",
    lines.length ? `<b>Ближайшие ${SUBS_WINDOW_DAYS} дней</b>` : `В ближайшие ${SUBS_WINDOW_DAYS} дней списаний нет. ✅`,
    ...lines.flatMap((l) => ["", l]),
  ].join("\n");
}

async function reply(command: string, args: string[], chat: { chatId: string; username?: string }): Promise<string | null> {
  if (command === "start") {
    const code = args[0];
    if (code) {
      const linked = await linkTelegramChat(code, chat);
      return linked.ok ? `✅ <b>Fyndue подключён</b>\n\nНапоминания о платежах будут приходить сюда.\n\n${HELP}` : BAD_CODE;
    }
    return (await userIdForChat(chat.chatId)) ? HELP : NOT_LINKED;
  }
  if (command === "help") return (await userIdForChat(chat.chatId)) ? HELP : NOT_LINKED;

  const userId = await userIdForChat(chat.chatId);
  if (!userId) return NOT_LINKED;
  switch (command) {
    case "today":
      return paymentsReply(userId, 0, "На сегодня", "Сегодня платежей нет, просроченных тоже. ✅");
    case "upcoming":
      return paymentsReply(userId, 14, "Ближайшие 14 дней", "В ближайшие 14 дней платежей нет. ✅");
    case "debts":
      return debtsReply(userId);
    case "month":
      return monthReply(userId);
    case "subs":
      return subscriptionsReply(userId);
    case "stop":
      await disconnectChat(chat.chatId);
      return "Отключено. Напоминания сюда больше не придут.\n\nПодключить снова можно в Fyndue → Настройки → Уведомления.";
    default:
      return `Неизвестная команда.\n\n${HELP}`;
  }
}

/** Handles one update from the webhook or long polling. Only private chats are served. */
export async function handleUpdate(update: TelegramUpdate, sender: TelegramSender): Promise<void> {
  const message = update.message;
  if (!message || message.chat.type !== "private" || message.from?.is_bot) return;
  const parsed = parseCommand(message.text);
  const chat = { chatId: String(message.chat.id), username: message.from?.username };
  const text = parsed ? await reply(parsed.command, parsed.args, chat) : `Отправьте команду, например /today.\n\n${HELP}`;
  if (text) await sender.sendMessage(chat.chatId, text);
}
