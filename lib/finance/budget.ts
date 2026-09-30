/**
 * Budget progress (SPEC §38): "Fuel — 800,000 / 1,500,000 — 53%".
 */
import { money, percentage, type FinDecimal, type MoneyLike } from "./money";

export type BudgetState = "UNDER" | "NEAR" | "OVER";

export function budgetStatus(input: { spent: MoneyLike; limit: MoneyLike; nearPercent?: number }): {
  spent: FinDecimal;
  limit: FinDecimal;
  remaining: FinDecimal;
  /** Unclamped: 110 means 10% over. */
  percent: FinDecimal;
  state: BudgetState;
} {
  const spent = money(input.spent);
  const limit = money(input.limit);
  const percent = percentage(spent, limit) ?? money(0);
  const state: BudgetState = spent.gt(limit) ? "OVER" : percent.gte(input.nearPercent ?? 80) ? "NEAR" : "UNDER";
  return { spent, limit, remaining: limit.minus(spent), percent, state };
}
