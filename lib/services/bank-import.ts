import "server-only";
import { randomUUID } from "node:crypto";
import { parseBankNotice, splitBankNotices, type BankNotice } from "@/lib/finance/bank-notice";
import { localDateToDb, dbToLocalDate } from "@/lib/finance/dates";
import { formatMoney, money, toMoneyString } from "@/lib/finance/money";
import { parseQuickEntry } from "@/lib/finance/quick-entry";
import { TRANSFERS_IN_CATEGORY_NAME } from "@/lib/constants/categories";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { Account } from "@/lib/generated/prisma/client";
import { escapeHtml } from "@/lib/telegram/messages";
import { createTransaction, listMerchantMemory, voidTransaction } from "./transactions";

/**
 * Automatic bookkeeping from bank notices (docs/telegram.md §10): a CardXabar
 * message forwarded to the bot, or a bank SMS sent to the personal link,
 * becomes an operation on the account whose card it names.
 *
 * - the same notice twice is recorded once (Transaction.externalId);
 * - an operation already typed by hand is not doubled;
 * - two halves of a transfer between the user's own cards become one transfer;
 * - operations from before an account's tracking start are skipped.
 */

export type ImportStatus = "recorded" | "transfer" | "duplicate" | "manual-duplicate" | "unknown-card" | "before-tracking" | "currency-mismatch";

export type ImportResult = {
  status: ImportStatus;
  notice: BankNotice;
  accountName?: string;
  categoryName?: string;
  transactionId?: string;
  /** Other account of a recognised own transfer. */
  counterpartName?: string;
  fee?: string;
  /** Bank balance from the notice vs Fyndue's, when they differ. */
  balanceMismatch?: { bank: string; fyndue: string };
};

const noticeId = (n: BankNotice) => `notice:${n.transferLike ? "p2p" : "op"}:${n.cardLast4}:${n.date}T${n.time}:${n.direction}:${n.amount}`;
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const merchantOf = (n: BankNotice) => (n.place.split(",")[0] ?? n.place).trim().slice(0, 80) || n.title;

export function cardsOf(account: Pick<Account, "cardLast4">): string[] {
  return (account.cardLast4 ?? "").split(",").map((c) => c.trim()).filter((c) => /^\d{4}$/.test(c));
}

// One import at a time per user: forwarded batches arrive as parallel webhooks,
// and the two halves of a transfer must see each other.
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(userId: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  queues.set(userId, next);
  void next.finally(() => {
    if (queues.get(userId) === next) queues.delete(userId);
  });
  return next;
}

async function categoryFor(userId: string, n: BankNotice, kind: "EXPENSE" | "INCOME") {
  const categories = await prisma.category.findMany({ where: { userId, type: kind, isArchived: false, isSystem: false } });
  const fallback = categories.find((c) => c.name === (kind === "INCOME" ? (n.transferLike ? TRANSFERS_IN_CATEGORY_NAME : "Другое") : "Другое")) ?? categories.at(-1);
  if (kind === "INCOME") return fallback;
  const merchants = await listMerchantMemory(userId);
  const guess = parseQuickEntry(n.place.toLowerCase(), {
    categories: categories.map((c) => ({ id: c.id, name: c.name, type: kind, icon: c.icon })),
    accounts: [],
    merchants: merchants.filter((m) => m.type === kind),
  });
  return categories.find((c) => c.id === guess.categoryId) ?? fallback;
}

async function importOne(userId: string, n: BankNotice): Promise<ImportResult> {
  const accounts = await prisma.account.findMany({ where: { userId, isArchived: false } });
  const account = accounts.find((a) => cardsOf(a).includes(n.cardLast4));
  if (!account) return { status: "unknown-card", notice: n };
  const base = { notice: n, accountName: account.name };
  if (account.currency !== n.currency) return { status: "currency-mismatch", ...base };
  if (account.trackingStartDate && n.date < dbToLocalDate(account.trackingStartDate)) return { status: "before-tracking", ...base };

  const id = noticeId(n);
  const existing = await prisma.transaction.findFirst({ where: { userId, externalId: { startsWith: id }, voidedAt: null }, select: { id: true } });
  if (existing) return { status: "duplicate", ...base, transactionId: existing.id };

  const direction = n.direction === "OUT" ? "OUTFLOW" : "INFLOW";
  // Already typed by hand: same account, day, amount and direction.
  const manual = await prisma.transaction.findFirst({
    where: { userId, accountId: account.id, voidedAt: null, externalId: null, direction, amount: n.amount, transactionDate: localDateToDb(n.date) },
  });
  if (manual) {
    await prisma.transaction.update({ where: { id: manual.id }, data: { externalId: id } });
    return { status: "manual-duplicate", ...base, transactionId: manual.id };
  }

  if (n.transferLike) {
    const paired = await pairOwnTransfer(userId, n, account, accounts);
    if (paired) return { ...paired, balanceMismatch: await balanceCheck(userId, n, account.id) };
  }

  const kind = n.direction === "OUT" ? "EXPENSE" : "INCOME";
  const category = await categoryFor(userId, n, kind);
  if (!category) throw new DomainError("Нет подходящей категории — создайте «Другое».");
  const fields = { accountId: account.id, categoryId: category.id, amount: n.amount, date: n.date, merchant: merchantOf(n), note: `${n.title} · ${n.time}`, clientRequestId: randomUUID() };
  const created = await createTransaction(userId, kind === "INCOME" ? { kind, status: "ACTUAL", ...fields } : { kind, ...fields });
  await prisma.transaction.update({ where: { id: created.id }, data: { source: "IMPORT", externalId: id } });
  return { status: "recorded", ...base, categoryName: category.name, transactionId: created.id, balanceMismatch: await balanceCheck(userId, n, account.id) };
}

/**
 * The other half of a card-to-card transfer already imported on another of
 * the user's accounts (opposite direction, within 5 minutes): both become
 * one transfer; a difference in the same currency is the bank's fee.
 */
async function pairOwnTransfer(userId: string, n: BankNotice, account: Account, accounts: Account[]): Promise<ImportResult | null> {
  const candidates = await prisma.transaction.findMany({
    where: {
      userId,
      source: "IMPORT",
      voidedAt: null,
      type: { in: ["EXPENSE", "INCOME"] },
      direction: n.direction === "OUT" ? "INFLOW" : "OUTFLOW",
      accountId: { not: account.id },
      transactionDate: localDateToDb(n.date),
      externalId: { startsWith: "notice:p2p:" },
    },
  });
  const other = candidates.find((c) => {
    const time = /T(\d{2}:\d{2})/.exec(c.externalId ?? "")?.[1];
    return time !== undefined && Math.abs(minutesOf(time) - minutesOf(n.time)) <= 5;
  });
  if (!other) return null;
  const otherAccount = accounts.find((a) => a.id === other.accountId)!;
  const out = n.direction === "OUT" ? { account, amount: n.amount, id: noticeId(n) } : { account: otherAccount, amount: toMoneyString(other.amount), id: other.externalId! };
  const inn = n.direction === "IN" ? { account, amount: n.amount, id: noticeId(n) } : { account: otherAccount, amount: toMoneyString(other.amount), id: other.externalId! };
  const sameCurrency = out.account.currency === inn.account.currency;
  const fee = sameCurrency ? money(out.amount).minus(inn.amount) : money(0);
  if (fee.isNegative()) return null; // more arrived than left: not one transfer

  await voidTransaction(userId, other.id, "Объединено в перевод между своими счетами");
  const transfer = await createTransaction(userId, {
    kind: "TRANSFER",
    fromAccountId: out.account.id,
    toAccountId: inn.account.id,
    amount: sameCurrency ? inn.amount : out.amount,
    toAmount: sameCurrency ? undefined : inn.amount,
    date: n.date,
    note: `${n.title} · ${merchantOf(n)}`,
    clientRequestId: randomUUID(),
  });
  const legs = await prisma.transaction.findMany({ where: { userId, transferGroupId: (await prisma.transaction.findUniqueOrThrow({ where: { id: transfer.id } })).transferGroupId } });
  for (const leg of legs) await prisma.transaction.update({ where: { id: leg.id }, data: { source: "IMPORT", externalId: leg.direction === "OUTFLOW" ? out.id : inn.id } });

  if (fee.gt(0)) {
    const category = await categoryFor(userId, { ...n, place: "комиссия" }, "EXPENSE");
    if (category) {
      const feeRow = await createTransaction(userId, {
        kind: "EXPENSE",
        accountId: out.account.id,
        categoryId: category.id,
        amount: toMoneyString(fee),
        date: n.date,
        merchant: "Комиссия за перевод",
        clientRequestId: randomUUID(),
      });
      await prisma.transaction.update({ where: { id: feeRow.id }, data: { source: "IMPORT", externalId: `${out.id}:fee` } });
    }
  }
  return {
    status: "transfer",
    notice: n,
    accountName: out.account.name,
    counterpartName: inn.account.name,
    transactionId: transfer.id,
    fee: fee.gt(0) ? toMoneyString(fee) : undefined,
  };
}

/** Compares with the notice's balance when this is the account's latest imported operation. */
async function balanceCheck(userId: string, n: BankNotice, accountId: string): Promise<ImportResult["balanceMismatch"]> {
  if (!n.balanceAfter) return undefined;
  const later = await prisma.transaction.findFirst({
    where: { userId, accountId, source: "IMPORT", voidedAt: null, transactionDate: { gt: localDateToDb(n.date) } },
    select: { id: true },
  });
  if (later) return undefined;
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  return money(account.currentBalance).equals(n.balanceAfter) ? undefined : { bank: n.balanceAfter, fyndue: toMoneyString(account.currentBalance) };
}

/** Every notice in a text (one, or several pasted together), in order. */
export async function importBankNotices(userId: string, text: string): Promise<ImportResult[]> {
  const chunks = splitBankNotices(text);
  return serialized(userId, async () => {
    const results: ImportResult[] = [];
    for (const chunk of chunks) results.push(await importOne(userId, parseBankNotice(chunk)!));
    return results;
  });
}

export function looksLikeBankNotice(text: string | undefined): boolean {
  return Boolean(text && splitBankNotices(text).length > 0);
}

// ─── Cards and undo (bot commands) ────────────────────────────────────────────

/** /card 2034 Uzum — the card belongs to the account whose name contains the words. */
export async function linkCard(userId: string, last4: string, accountQuery: string): Promise<string> {
  if (!/^\d{4}$/.test(last4)) return "Формат: /card 2034 Название счёта — последние 4 цифры карты и часть названия счёта.";
  const accounts = await prisma.account.findMany({ where: { userId, isArchived: false }, orderBy: { sortOrder: "asc" } });
  const q = accountQuery.trim().toLowerCase();
  const matches = q ? accounts.filter((a) => a.name.toLowerCase().includes(q)) : [];
  if (matches.length !== 1) {
    const list = accounts.map((a) => `• ${escapeHtml(a.name)}`).join("\n");
    return `${matches.length > 1 ? "Подходит несколько счетов" : "Не нашёл такой счёт"}. Напишите точнее, например:\n<code>/card ${last4} ${escapeHtml(accounts[0]?.name ?? "Uzcard")}</code>\n\nВаши счета:\n${list}`;
  }
  const target = matches[0]!;
  await prisma.$transaction(async (tx) => {
    for (const a of accounts) {
      const cards = cardsOf(a).filter((c) => c !== last4);
      const next = a.id === target.id ? [...cards, last4] : cards;
      if (next.join(",") !== cardsOf(a).join(",")) await tx.account.update({ where: { id: a.id }, data: { cardLast4: next.join(",") || null } });
    }
  });
  return `💳 Карта ***${last4} привязана к счёту «${escapeHtml(target.name)}». Перешлите уведомление ещё раз — запишу.`;
}

/** /undo — cancels the latest operation recorded from a notice (a transfer: both halves). */
export async function undoLastImport(userId: string, now: Date = new Date()): Promise<string> {
  const last = await prisma.transaction.findFirst({
    where: { userId, source: "IMPORT", voidedAt: null, createdAt: { gte: new Date(now.getTime() - 48 * 3600_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return "Нечего отменять: за последние двое суток уведомления не записывались.";
  await voidTransaction(userId, last.id, "Отменено командой /undo");
  return `↩️ Отменил: ${escapeHtml(last.merchant ?? last.note ?? "операция")} · ${escapeHtml(formatMoney(toMoneyString(last.amount), last.currency))}`;
}

// ─── Replies ──────────────────────────────────────────────────────────────────

export function importReply(results: ImportResult[], appUrl: string): string {
  return results
    .map((r) => {
      const n = r.notice;
      const sum = escapeHtml(formatMoney(n.amount, n.currency));
      const link = r.transactionId ? `\n<a href="${appUrl}/transactions/${r.transactionId}">Изменить в Fyndue</a>` : "";
      const balance = r.balanceMismatch
        ? `\n⚠️ В банке на карте ${escapeHtml(formatMoney(r.balanceMismatch.bank, n.currency))}, в Fyndue ${escapeHtml(formatMoney(r.balanceMismatch.fyndue, n.currency))} — проверьте, не пропущено ли что-то.`
        : "";
      switch (r.status) {
        case "recorded":
          return `${n.direction === "OUT" ? "🔴 Расход" : "🟢 Доход"} <b>${sum}</b> — ${escapeHtml(merchantOf(n))}\n${escapeHtml(r.categoryName ?? "")} · ${escapeHtml(r.accountName ?? "")}${n.transferLike ? "\nПохоже на перевод: если вторая карта тоже ваша, перешлите и её уведомление — объединю в перевод." : ""}${balance}${link}`;
        case "transfer":
          return `🔁 Перевод <b>${sum}</b>: ${escapeHtml(r.accountName ?? "")} → ${escapeHtml(r.counterpartName ?? "")}${r.fee ? `\nКомиссия банка: ${escapeHtml(formatMoney(r.fee, n.currency))}` : ""}${balance}${link}`;
        case "duplicate":
          return `Уже записано: ${sum} — ${escapeHtml(merchantOf(n))}.`;
        case "manual-duplicate":
          return `Уже есть операция на ${sum} за ${n.date.split("-").reverse().join(".")} в «${escapeHtml(r.accountName ?? "")}» — не дублирую.`;
        case "unknown-card":
          return `💳 Карта ***${n.cardLast4} ещё не привязана к счёту. Отправьте:\n<code>/card ${n.cardLast4} название счёта</code>\nи перешлите уведомление снова.`;
        case "before-tracking":
          return `Пропускаю ${sum} за ${n.date.split("-").reverse().join(".")}: это раньше начала учёта по «${escapeHtml(r.accountName ?? "")}».`;
        case "currency-mismatch":
          return `Счёт «${escapeHtml(r.accountName ?? "")}» не в ${n.currency} — привяжите карту ***${n.cardLast4} к счёту в ${n.currency}.`;
      }
    })
    .join("\n\n");
}
