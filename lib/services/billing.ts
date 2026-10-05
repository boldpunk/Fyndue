import "server-only";
import { isAdminEmail } from "@/lib/auth/admin";
import { formatPhone, isPhoneAccountEmail } from "@/lib/auth/phone";
import {
  extendPro,
  FREE_LIMITS,
  planFor,
  PRO_FEATURES,
  PRO_PRICES,
  type LimitedResource,
  type Plan,
  type ProFeature,
  type ProPeriod,
  upToText,
} from "@/lib/billing/plans";
import { prisma, type Tx } from "@/lib/db";
import { DomainError, NotFoundError, ProRequiredError } from "@/lib/errors";
import { formatMoney, toMoneyString } from "@/lib/finance/money";
import type { TelegramSender } from "@/lib/telegram/client";
import { escapeHtml } from "@/lib/telegram/messages";
import { writeAudit } from "./audit";

/**
 * Fyndue Pro (docs/billing.md): plan lookup, Free limits, and the manual
 * payment flow — the user pays by card transfer and presses «Я оплатил»,
 * an admin confirms in /admin, and User.proUntil moves forward.
 */

type Db = Tx | typeof prisma;

export async function getPlan(userId: string, now: Date = new Date(), db: Db = prisma): Promise<Plan> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, createdAt: true, proUntil: true, trialEndsAt: true } });
  return planFor({ createdAt: user.createdAt, proUntil: user.proUntil, trialEndsAt: user.trialEndsAt, isAdmin: isAdminEmail(user.email) }, now);
}

async function countActive(db: Db, userId: string, resource: LimitedResource): Promise<number> {
  switch (resource) {
    case "accounts":
      return db.account.count({ where: { userId, isArchived: false } });
    case "debts":
      return db.debt.count({ where: { userId, status: { not: "ARCHIVED" } } });
    case "subscriptions":
      return db.recurringTransaction.count({ where: { userId, isSubscription: true, isActive: true } });
    case "goals":
      return db.savingsGoal.count({ where: { userId, isArchived: false } });
  }
}

/** Throws ProRequiredError when a Free account already has as many as Free allows. */
export async function assertWithinLimit(userId: string, resource: LimitedResource, db: Db = prisma): Promise<void> {
  const plan = await getPlan(userId, new Date(), db);
  if (plan.tier === "pro") return;
  const limit = FREE_LIMITS[resource];
  if ((await countActive(db, userId, resource)) < limit) return;
  throw new ProRequiredError(`Бесплатно — ${upToText(resource, limit)}. Без ограничений — в Fyndue Pro.`);
}

export async function assertProFeature(userId: string, feature: ProFeature, db: Db = prisma): Promise<void> {
  if ((await getPlan(userId, new Date(), db)).tier === "pro") return;
  throw new ProRequiredError(`«${PRO_FEATURES[feature]}» — в Fyndue Pro.`);
}

export type UsageDTO = Record<LimitedResource, { used: number; limit: number }>;

export async function getUsage(userId: string): Promise<UsageDTO> {
  const entries = await Promise.all(
    (Object.keys(FREE_LIMITS) as LimitedResource[]).map(async (r) => [r, { used: await countActive(prisma, userId, r), limit: FREE_LIMITS[r] }] as const),
  );
  return Object.fromEntries(entries) as UsageDTO;
}

// ─── Requests («Я оплатил») ───────────────────────────────────────────────────

export type ProPaymentDTO = { id: string; period: string; days: number; amount: string | null; status: string; createdAt: string; decidedAt: string | null };

const toDTO = (p: { id: string; period: string; days: number; amount: { toString(): string } | null; status: string; createdAt: Date; decidedAt: Date | null }): ProPaymentDTO => ({
  id: p.id,
  period: p.period,
  days: p.days,
  amount: p.amount ? toMoneyString(p.amount) : null,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
  decidedAt: p.decidedAt?.toISOString() ?? null,
});

export async function listMyProPayments(userId: string): Promise<ProPaymentDTO[]> {
  const rows = await prisma.proPayment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map(toDTO);
}

async function notifyUser(sender: TelegramSender | null, userId: string, html: string) {
  if (!sender) return;
  const c = await prisma.telegramConnection.findUnique({ where: { userId } });
  if (c?.status === "CONNECTED" && c.telegramChatId) await sender.sendMessage(c.telegramChatId, html).catch(() => undefined);
}

async function notifyAdmins(sender: TelegramSender | null, html: string) {
  if (!sender) return;
  const connected = await prisma.telegramConnection.findMany({ where: { status: "CONNECTED" }, include: { user: { select: { email: true } } } });
  for (const c of connected) {
    if (c.telegramChatId && isAdminEmail(c.user.email)) await sender.sendMessage(c.telegramChatId, html).catch(() => undefined);
  }
}

const contactOf = (u: { email: string; phoneNumber: string | null }) => (isPhoneAccountEmail(u.email) && u.phoneNumber ? formatPhone(u.phoneNumber) : u.email);

/** «Я оплатил»: one waiting request per user; a new one replaces the old. */
export async function requestPro(userId: string, period: ProPeriod, sender: TelegramSender | null = null): Promise<{ id: string }> {
  const price = PRO_PRICES[period];
  const request = await prisma.$transaction(async (tx) => {
    await tx.proPayment.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
    const row = await tx.proPayment.create({ data: { userId, period, days: price.days, amount: price.amount, currency: "UZS" } });
    await writeAudit(tx, { userId, action: "PRO_REQUESTED", entityType: "ProPayment", entityId: row.id, metadata: { period, amount: price.amount } });
    return row;
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phoneNumber: true } });
  await notifyAdmins(
    sender,
    `💳 Заявка на Fyndue Pro\n\n${escapeHtml(user.name)} (${escapeHtml(contactOf(user))})\n${period === "YEAR" ? "Год" : "Месяц"} — <b>${escapeHtml(formatMoney(price.amount, "UZS"))}</b>\n\nПроверьте поступление и подтвердите во вкладке «Админ».`,
  );
  return { id: request.id };
}

export async function cancelProRequest(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.proPayment.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
    if (count === 0) throw new NotFoundError("ProPayment");
    await writeAudit(tx, { userId, action: "PRO_REQUEST_CANCELLED", entityType: "ProPayment", entityId: id });
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

async function assertAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || !isAdminEmail(user.email)) throw new NotFoundError("ProPayment");
}

export type ProRequestRow = ProPaymentDTO & { user: { id: string; name: string; contact: string } };

export async function listPendingProRequests(adminId: string): Promise<ProRequestRow[]> {
  await assertAdmin(adminId);
  const rows = await prisma.proPayment.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { id: true, name: true, email: true, phoneNumber: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ ...toDTO(r), user: { id: r.user.id, name: r.user.name, contact: contactOf(r.user) } }));
}

const untilText = (d: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tashkent" }).format(d).replace(" г.", "");

async function applyPeriod(tx: Tx, userId: string, days: number, now: Date): Promise<Date> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { proUntil: true } });
  const until = extendPro(user.proUntil, days, now);
  await tx.user.update({ where: { id: userId }, data: { proUntil: until } });
  return until;
}

export async function decideProRequest(adminId: string, id: string, approve: boolean, sender: TelegramSender | null = null, now: Date = new Date()): Promise<void> {
  await assertAdmin(adminId);
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ProPayment" WHERE "id" = ${id} AND "status" = 'PENDING' FOR UPDATE`;
    if (rows.length === 0) throw new DomainError("Заявка уже обработана или отменена.");
    const payment = await tx.proPayment.update({ where: { id }, data: { status: approve ? "CONFIRMED" : "REJECTED", decidedById: adminId, decidedAt: now } });
    const until = approve ? await applyPeriod(tx, payment.userId, payment.days, now) : null;
    await writeAudit(tx, { userId: payment.userId, action: approve ? "PRO_CONFIRMED" : "PRO_REJECTED", entityType: "ProPayment", entityId: id, metadata: { by: adminId, until: until?.toISOString() ?? null } });
    return { userId: payment.userId, until };
  });
  await notifyUser(
    sender,
    result.userId,
    result.until
      ? `⭐ Fyndue Pro включён до <b>${untilText(result.until)}</b>. Спасибо за поддержку!`
      : "Оплата за Fyndue Pro не найдена. Если вы платили — напишите нам, разберёмся.",
  );
}

/** An admin gives (days > 0) Pro without a request — a gift, a promo, a payment by other means. */
export async function grantPro(adminId: string, userId: string, days: number, note: string | undefined, sender: TelegramSender | null = null, now: Date = new Date()): Promise<Date> {
  await assertAdmin(adminId);
  if (!Number.isInteger(days) || days < 1 || days > 3660) throw new DomainError("Срок — от 1 дня до 10 лет.");
  const until = await prisma.$transaction(async (tx) => {
    if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new NotFoundError("User");
    const period = days === 365 ? "YEAR" : days === 30 ? "MONTH" : "DAYS";
    const row = await tx.proPayment.create({ data: { userId, period, days, status: "CONFIRMED", decidedById: adminId, decidedAt: now, note: note ?? null } });
    const until = await applyPeriod(tx, userId, days, now);
    await writeAudit(tx, { userId, action: "PRO_GRANTED", entityType: "ProPayment", entityId: row.id, metadata: { by: adminId, days } });
    return until;
  });
  await notifyUser(sender, userId, `⭐ Вам открыт Fyndue Pro до <b>${untilText(until)}</b>.`);
  return until;
}

/** Ends a paid period now (the sign-up trial, if still running, is unaffected). */
export async function revokePro(adminId: string, userId: string, now: Date = new Date()): Promise<void> {
  await assertAdmin(adminId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId }, data: { proUntil: now } });
    if (count === 0) throw new NotFoundError("User");
    await writeAudit(tx, { userId, action: "PRO_REVOKED", entityType: "User", entityId: userId, metadata: { by: adminId } });
  });
}

// ─── Expiry notice ────────────────────────────────────────────────────────────

/** Days before the end of Pro (or the trial) when the bot reminds to renew. */
export const PRO_EXPIRY_NOTICE_DAYS = 3;

/**
 * One Telegram notice per period end, a few days before it: «Pro заканчивается
 * 12 октября». Claimed in NotificationLog first, so repeated or parallel cron
 * runs send it once.
 */
export async function sendProExpiryNotices(sender: TelegramSender, now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + PRO_EXPIRY_NOTICE_DAYS * 86_400_000);
  const connections = await prisma.telegramConnection.findMany({
    where: { status: "CONNECTED", telegramChatId: { not: null } },
    select: { userId: true, telegramChatId: true, user: { select: { email: true, createdAt: true, proUntil: true, trialEndsAt: true } } },
  });
  let sent = 0;
  for (const c of connections) {
    const plan = planFor({ ...c.user, isAdmin: isAdminEmail(c.user.email) }, now);
    if (plan.tier !== "pro" || !plan.until || plan.until > horizon) continue;
    const key = `pro-expiry:${c.userId}:${plan.until.toISOString().slice(0, 10)}`;
    const claimed = await prisma.notificationLog.createMany({
      data: [{ userId: c.userId, type: "PRO_EXPIRY", channel: "TELEGRAM", deduplicationKey: key, scheduledAt: now, status: "PENDING" }],
      skipDuplicates: true,
    });
    if (claimed.count === 0) continue;
    const what = plan.reason === "trial" ? "Пробный период Fyndue Pro" : "Fyndue Pro";
    try {
      const { messageId } = await sender.sendMessage(
        c.telegramChatId!,
        `⭐ ${what} заканчивается <b>${untilText(plan.until)}</b>.\n\nПосле этого всё созданное останется, но новые счета, долги и цели — в пределах бесплатного тарифа, а общий счёт, чеки и экспорт станут недоступны.\n\nПродлить: раздел «Fyndue Pro» в приложении.`,
      );
      await prisma.notificationLog.update({ where: { deduplicationKey: key }, data: { status: "SENT", sentAt: now, externalMessageId: messageId, attempts: 1 } });
      sent++;
    } catch {
      await prisma.notificationLog.update({ where: { deduplicationKey: key }, data: { status: "FAILED", attempts: 1 } });
    }
  }
  return sent;
}
