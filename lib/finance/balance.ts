/**
 * Account engine: how much money actually moved on an account (SPEC §30).
 * The debt engine (Phase 2) tracks how a payment splits into principal,
 * interest and fees; this module only cares about real account movements.
 */
import { money, sumMoney, ZERO, type FinDecimal, type MoneyLike } from "./money";

export type FlowDirection = "INFLOW" | "OUTFLOW";
export type TransactionStatus = "ACTUAL" | "EXPECTED";

export type BalanceFlow = {
  direction: FlowDirection;
  amount: MoneyLike;
  status?: TransactionStatus;
  voided?: boolean;
};

/** Signed effect of one transaction on its account's balance. */
export function balanceEffect(flow: BalanceFlow): FinDecimal {
  if (flow.voided || flow.status === "EXPECTED") return ZERO;
  const amount = money(flow.amount);
  return flow.direction === "INFLOW" ? amount : amount.negated();
}

/** currentBalance = openingBalance + Σ inflow − Σ outflow (actual, non-voided). */
export function computeBalance(openingBalance: MoneyLike, flows: Iterable<BalanceFlow>): FinDecimal {
  let balance = money(openingBalance);
  for (const flow of flows) balance = balance.plus(balanceEffect(flow));
  return balance;
}

export type BalanceAccount = {
  currency: string;
  currentBalance: MoneyLike;
  includeInTotal: boolean;
  isArchived: boolean;
};

/**
 * Totals per currency. Balances in different currencies are never added
 * together (SPEC §46).
 */
export function totalsByCurrency(accounts: Iterable<BalanceAccount>): Map<string, FinDecimal> {
  const grouped = new Map<string, MoneyLike[]>();
  for (const account of accounts) {
    if (!account.includeInTotal || account.isArchived) continue;
    const list = grouped.get(account.currency) ?? [];
    list.push(account.currentBalance);
    grouped.set(account.currency, list);
  }
  return new Map([...grouped].map(([currency, values]) => [currency, sumMoney(values)]));
}

/** Direction for a balance adjustment that moves `current` to `target`. */
export function adjustmentFor(current: MoneyLike, target: MoneyLike): { direction: FlowDirection; amount: FinDecimal } | null {
  const delta = money(target).minus(money(current));
  if (delta.isZero()) return null;
  return delta.gt(0) ? { direction: "INFLOW", amount: delta } : { direction: "OUTFLOW", amount: delta.abs() };
}
