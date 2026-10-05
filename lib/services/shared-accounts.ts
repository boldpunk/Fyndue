import "server-only";
import { isPhoneAccountEmail, formatPhone, normalizePhone } from "@/lib/auth/phone";
import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { formatMoney, toMoneyString } from "@/lib/finance/money";
import type { Currency } from "@/lib/generated/prisma/client";
import type { TelegramSender } from "@/lib/telegram/client";
import { escapeHtml } from "@/lib/telegram/messages";
import type { ExpenseInput, IncomeInput } from "@/lib/validations/transactions";
import { writeAudit } from "./audit";
import { createTransaction, listTransactions, voidTransaction, type TransactionDTO } from "./transactions";

/**
 * Shared accounts — a family card (docs/security.md §2b).
 *
 * The owner lets another Fyndue user see one account and add expenses and
 * income to it. Every row stays the owner's (userId = owner), so the owner's
 * balances, budgets and analytics stay whole and every other service keeps
 * its "scope by userId" rule. A member never calls those services with their
 * own id for the owner's data: they go through this module, which first
 * finds the AccountShare row for (member, account) and only then acts as
 * the owner, on that one account.
 */

export const MAX_MEMBERS_PER_ACCOUNT = 5;

const displayContact = (user: { email: string; phoneNumber: string | null }) =>
  isPhoneAccountEmail(user.email) && user.phoneNumber ? formatPhone(user.phoneNumber) : user.email;

/** The share that lets `memberId` use `accountId`, or NotFound — never "forbidden". */
async function requireShare(memberId: string, accountId: string) {
  const share = await prisma.accountShare.findFirst({
    where: { memberId, accountId, account: { isArchived: false } },
    include: { account: true, owner: { select: { id: true, name: true } } },
  });
  if (!share) throw new NotFoundError("Account");
  return share;
}

async function notify(sender: TelegramSender | null, userId: string, html: string) {
  if (!sender) return;
  const connection = await prisma.telegramConnection.findUnique({ where: { userId } });
  if (connection?.status !== "CONNECTED" || !connection.telegramChatId) return;
  // A reminder-style courtesy message: never fail the operation over it.
  await sender.sendMessage(connection.telegramChatId, html).catch(() => undefined);
}

// ─── Owner side ───────────────────────────────────────────────────────────────

export type AccountMemberDTO = { shareId: string; name: string; contact: string; since: string };

export async function listAccountMembers(ownerId: string, accountId: string): Promise<AccountMemberDTO[]> {
  const shares = await prisma.accountShare.findMany({
    where: { ownerId, accountId },
    include: { member: { select: { name: true, email: true, phoneNumber: true } } },
    orderBy: { createdAt: "asc" },
  });
  return shares.map((s) => ({ shareId: s.id, name: s.member.name, contact: displayContact(s.member), since: s.createdAt.toISOString() }));
}

/** Finds the person by phone number or email; they must already have a Fyndue account. */
async function findUserByContact(contact: string) {
  const text = contact.trim();
  if (text.includes("@")) return prisma.user.findUnique({ where: { email: text.toLowerCase() } });
  const phone = normalizePhone(text);
  if (!phone) throw new DomainError("Введите номер телефона или email.", "VALIDATION", { contact: "Номер или email" });
  return prisma.user.findUnique({ where: { phoneNumber: phone } });
}

export async function shareAccount(
  ownerId: string,
  input: { accountId: string; contact: string },
  sender: TelegramSender | null = null,
): Promise<{ shareId: string }> {
  const account = await prisma.account.findFirst({ where: { id: input.accountId, userId: ownerId, isArchived: false } });
  if (!account) throw new NotFoundError("Account");
  const member = await findUserByContact(input.contact);
  if (!member) {
    throw new DomainError("Такого пользователя в Fyndue нет — пусть сначала зарегистрируется (по номеру телефона на fyndue.uz).", "NOT_FOUND", {
      contact: "Пользователь не найден",
    });
  }
  if (member.id === ownerId) throw new DomainError("Это ваш собственный аккаунт.", "VALIDATION", { contact: "Это вы" });
  const count = await prisma.accountShare.count({ where: { accountId: account.id } });
  if (count >= MAX_MEMBERS_PER_ACCOUNT) throw new DomainError(`К одному счёту можно пригласить до ${MAX_MEMBERS_PER_ACCOUNT} человек.`);
  if (await prisma.accountShare.findUnique({ where: { accountId_memberId: { accountId: account.id, memberId: member.id } } })) {
    throw new DomainError(`У ${member.name} уже есть доступ к этому счёту.`, "DUPLICATE", { contact: "Уже есть доступ" });
  }

  const share = await prisma.$transaction(async (tx) => {
    const row = await tx.accountShare.create({ data: { accountId: account.id, ownerId, memberId: member.id } });
    await writeAudit(tx, { userId: ownerId, action: "ACCOUNT_SHARED", entityType: "AccountShare", entityId: row.id, metadata: { accountId: account.id, memberId: member.id } });
    return row;
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { name: true } });
  await notify(
    sender,
    member.id,
    `👥 ${escapeHtml(owner.name)} открыл(а) вам доступ к счёту «${escapeHtml(account.name)}».\n\nОн в разделе «Счета» → «Общие со мной»: можно смотреть баланс и добавлять расходы.`,
  );
  return { shareId: share.id };
}

/** The owner removes a member, or a member leaves. */
export async function removeShare(userId: string, shareId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const share = await tx.accountShare.findFirst({ where: { id: shareId, OR: [{ ownerId: userId }, { memberId: userId }] } });
    if (!share) throw new NotFoundError("Share");
    await tx.accountShare.delete({ where: { id: share.id } });
    await writeAudit(tx, { userId: share.ownerId, action: "ACCOUNT_UNSHARED", entityType: "AccountShare", entityId: share.id, metadata: { accountId: share.accountId, memberId: share.memberId, by: userId === share.ownerId ? "owner" : "member" } });
  });
}

// ─── Member side ──────────────────────────────────────────────────────────────

export type SharedAccountSummary = {
  shareId: string;
  account: { id: string; name: string; currency: Currency; currentBalance: string };
  owner: { name: string };
};

export async function listSharedWithMe(memberId: string): Promise<SharedAccountSummary[]> {
  const shares = await prisma.accountShare.findMany({
    where: { memberId, account: { isArchived: false } },
    include: { account: true, owner: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return shares.map((s) => ({
    shareId: s.id,
    account: { id: s.account.id, name: s.account.name, currency: s.account.currency, currentBalance: toMoneyString(s.account.currentBalance) },
    owner: { name: s.owner.name },
  }));
}

export type SharedAccountDetail = SharedAccountSummary & {
  categories: { id: string; name: string; type: "EXPENSE" | "INCOME"; icon: string; color: string | null; parentId: string | null }[];
  transactions: (TransactionDTO & { mine: boolean })[];
};

/** What a member sees: this account's balance and operations, and the owner's categories to file new ones. */
export async function getSharedAccount(memberId: string, accountId: string): Promise<SharedAccountDetail> {
  const share = await requireShare(memberId, accountId);
  const ownerId = share.ownerId;
  const [categories, list, mineRows] = await Promise.all([
    prisma.category.findMany({
      where: { userId: ownerId, isArchived: false, isSystem: false },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true, icon: true, color: true, parentId: true },
    }),
    listTransactions(ownerId, { account: accountId, page: 1 }),
    prisma.transaction.findMany({ where: { userId: ownerId, accountId, createdById: memberId }, select: { id: true } }),
  ]);
  const mine = new Set(mineRows.map((r) => r.id));
  return {
    shareId: share.id,
    account: { id: share.account.id, name: share.account.name, currency: share.account.currency, currentBalance: toMoneyString(share.account.currentBalance) },
    owner: { name: share.owner.name },
    categories,
    // Only this account: the owner's other accounts and debts stay private.
    transactions: list.items.map((t) => ({
      ...t,
      debt: null,
      counterpart: t.counterpart ? { ...t.counterpart, transactionId: "", accountId: "", accountName: "другой счёт владельца" } : null,
      mine: mine.has(t.id),
    })),
  };
}

/** A member adds an expense or income to the shared account; recorded as the owner's, signed by the member. */
export async function createSharedTransaction(
  memberId: string,
  input: (ExpenseInput | IncomeInput) & { clientRequestId: string },
  sender: TelegramSender | null = null,
): Promise<{ id: string }> {
  // The share is looked up by the account in the input: a member can only ever write to that one account.
  const share = await requireShare(memberId, input.accountId);
  const result = await createTransaction(share.ownerId, input, undefined, memberId);

  const [member, category] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: { name: true } }),
    prisma.category.findFirst({ where: { id: input.categoryId, userId: share.ownerId }, select: { name: true } }),
  ]);
  const what = input.kind === "INCOME" ? "доход" : "расход";
  await notify(
    sender,
    share.ownerId,
    `👥 ${escapeHtml(member.name)} добавил(а) ${what} <b>${escapeHtml(formatMoney(input.amount, share.account.currency))}</b>` +
      `${category ? ` — ${escapeHtml(category.name)}` : ""}${input.merchant ? `, ${escapeHtml(input.merchant)}` : ""}\nСчёт: «${escapeHtml(share.account.name)}»`,
  );
  return result;
}

/** A member may cancel only what they added themselves. */
export async function voidSharedTransaction(memberId: string, transactionId: string): Promise<void> {
  const row = await prisma.transaction.findFirst({ where: { id: transactionId, createdById: memberId }, select: { accountId: true } });
  if (!row) throw new NotFoundError("Transaction");
  const share = await requireShare(memberId, row.accountId);
  await voidTransaction(share.ownerId, transactionId, "Отменил участник общего счёта");
}
