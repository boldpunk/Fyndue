/**
 * Fyndue Pro (docs/billing.md). Pure: who is Pro and what Free allows.
 *
 * Free keeps everyday tracking; Pro lifts the counts and adds the family
 * and paperwork features. Existing data above a limit stays visible and
 * editable — only creating more is refused.
 */

export const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const PRO_PRICES = { MONTH: { days: 30, amount: "29000.00" }, YEAR: { days: 365, amount: "249000.00" } } as const;
export type ProPeriod = keyof typeof PRO_PRICES;

/** How many of each a Free account may have (active, not archived). */
export const FREE_LIMITS = { accounts: 3, debts: 2, subscriptions: 5, goals: 1 } as const;
export type LimitedResource = keyof typeof FREE_LIMITS;

/** Features only in Pro. */
export const PRO_FEATURES = { sharedAccounts: "Общий счёт", receipts: "Фото чеков", export: "Экспорт в Excel", templates: "Шаблоны операций" } as const;
export type ProFeature = keyof typeof PRO_FEATURES;

/** Genitive after «до»: до 1 счёта, до 3 счетов. */
const LIMIT_GENITIVE: Record<LimitedResource, [string, string]> = {
  accounts: ["счёта", "счетов"],
  debts: ["долга", "долгов"],
  subscriptions: ["подписки", "подписок"],
  goals: ["цели", "целей"],
};

export function upToText(resource: LimitedResource, n: number = FREE_LIMITS[resource]): string {
  const [one, many] = LIMIT_GENITIVE[resource];
  return `до ${n} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
}

export type Plan = {
  tier: "pro" | "free";
  /** Why Pro: paid/granted period, the sign-up trial, or an admin account. */
  reason: "paid" | "trial" | "admin" | null;
  /** When Pro ends (null for admins and Free). */
  until: Date | null;
  /** Whole days left, rounded up. */
  daysLeft: number | null;
};

export function planFor(user: { createdAt: Date; proUntil: Date | null; trialEndsAt?: Date | null; isAdmin: boolean }, now: Date = new Date()): Plan {
  if (user.isAdmin) return { tier: "pro", reason: "admin", until: null, daysLeft: null };
  const trialEnds = user.trialEndsAt ?? new Date(user.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
  const paid = user.proUntil && user.proUntil > now ? user.proUntil : null;
  const trial = trialEnds > now ? trialEnds : null;
  // A paid period that runs past the trial wins; otherwise the trial.
  const until = paid && (!trial || paid >= trial) ? paid : trial;
  if (!until) return { tier: "free", reason: null, until: null, daysLeft: null };
  return { tier: "pro", reason: until === paid ? "paid" : "trial", until, daysLeft: Math.ceil((until.getTime() - now.getTime()) / DAY_MS) };
}

/** A new paid period starts when the current one ends (never shortens it). */
export function extendPro(currentUntil: Date | null, days: number, now: Date = new Date()): Date {
  const from = currentUntil && currentUntil > now ? currentUntil : now;
  return new Date(from.getTime() + days * DAY_MS);
}
