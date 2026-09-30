import "server-only";
import { prisma } from "@/lib/db";
import { dbToLocalDate, localDateToDb, todayIn, type LocalDate } from "@/lib/finance/dates";
import { toMoneyString } from "@/lib/finance/money";
import type { DisplayPaymentStatus } from "@/lib/finance/payment-status";
import { toItemDTO, type ScheduleItemDTO } from "./debts";
import { listOccurrences } from "./recurring";

export type CalendarEventKind = "DEBT_PAYMENT" | "EXPECTED_INCOME" | "RECURRING_EXPENSE" | "SUBSCRIPTION" | "RECURRING_INCOME";

export type CalendarEvent = {
  id: string;
  date: LocalDate;
  kind: CalendarEventKind;
  title: string;
  subtitle: string | null;
  /** Remaining to pay/receive when open; the settled amount when done. */
  amount: string;
  currency: string;
  direction: "IN" | "OUT";
  done: boolean;
  displayStatus: DisplayPaymentStatus | null;
  debt?: { id: string; name: string; currency: string; feeMode: "NONE" | "ADDED_ON_TOP" | "DEDUCTED_FROM_DISBURSEMENT" | "FINANCED_INTO_DEBT" | "CUSTOM"; currentPrincipal: string };
  item?: ScheduleItemDTO;
  recurring?: { recurringId: string; occurrenceDate: LocalDate; accountId: string; transactionId: string | null };
  transactionId?: string;
};

/**
 * Everything dated in [from, to] (SPEC §31): debt payments, expected income,
 * recurring expenses and income, subscriptions. Planned events only — actual
 * spending lives in Transactions.
 */
export async function getCalendarEvents(userId: string, from: LocalDate, to: LocalDate): Promise<{ today: LocalDate; events: CalendarEvent[] }> {
  const [user, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
    prisma.userSettings.findUnique({ where: { userId }, select: { dueSoonDays: true, urgentDays: true } }),
  ]);
  const ctx = { today: todayIn(user.timezone), dueSoonDays: settings?.dueSoonDays ?? 7, urgentDays: settings?.urgentDays ?? 2 };
  const range = { gte: localDateToDb(from), lte: localDateToDb(to) };

  const [items, expected, occurrences] = await Promise.all([
    prisma.debtScheduleItem.findMany({
      where: { userId, isCurrent: true, dueDate: range, debt: { status: { in: ["ACTIVE", "PAID_OFF"] } } },
      include: { debt: { select: { id: true, name: true, lender: true, currency: true, feeMode: true, currentPrincipal: true } } },
      orderBy: [{ dueDate: "asc" }],
    }),
    prisma.transaction.findMany({
      where: { userId, type: "INCOME", status: "EXPECTED", voidedAt: null, transactionDate: range },
      include: { category: { select: { name: true } }, account: { select: { name: true } } },
    }),
    listOccurrences(userId, from, to),
  ]);

  const events: CalendarEvent[] = [
    ...items.map((i): CalendarEvent => {
      const dto = toItemDTO(i, ctx);
      return {
        id: `debt-${i.id}`,
        date: dto.dueDate,
        kind: "DEBT_PAYMENT",
        title: i.debt.name,
        subtitle: [i.debt.lender, `#${i.installmentNumber}`].filter(Boolean).join(" · "),
        amount: dto.isOpen ? dto.remainingTotal : dto.paidTotal,
        currency: i.debt.currency,
        direction: "OUT",
        done: !dto.isOpen,
        displayStatus: dto.displayStatus,
        debt: { id: i.debt.id, name: i.debt.name, currency: i.debt.currency, feeMode: i.debt.feeMode, currentPrincipal: toMoneyString(i.debt.currentPrincipal) },
        item: dto,
      };
    }),
    ...expected.map((t): CalendarEvent => ({
      id: `income-${t.id}`,
      date: dbToLocalDate(t.transactionDate),
      kind: "EXPECTED_INCOME",
      title: t.note || t.category?.name || "Expected income",
      subtitle: `Expected · ${t.account.name}`,
      amount: toMoneyString(t.amount),
      currency: t.currency,
      direction: "IN",
      done: false,
      displayStatus: null,
      transactionId: t.id,
    })),
    ...occurrences.map((o): CalendarEvent => ({
      id: `rec-${o.recurringId}-${o.date}`,
      date: o.date,
      kind: o.kind === "INCOME" ? "RECURRING_INCOME" : o.isSubscription ? "SUBSCRIPTION" : "RECURRING_EXPENSE",
      title: o.name,
      subtitle: [o.category?.name, o.accountName].filter(Boolean).join(" · "),
      amount: o.amount,
      currency: o.currency,
      direction: o.kind === "INCOME" ? "IN" : "OUT",
      done: o.transactionId !== null,
      displayStatus: null,
      recurring: { recurringId: o.recurringId, occurrenceDate: o.date, accountId: o.accountId, transactionId: o.transactionId },
    })),
  ];
  events.sort((a, b) => a.date.localeCompare(b.date) || Number(a.done) - Number(b.done) || a.title.localeCompare(b.title));
  return { today: ctx.today, events };
}
