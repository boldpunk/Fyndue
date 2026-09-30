/**
 * Total cost of debt (SPEC §19A). Keeps four numbers apart:
 * principal repaid, cost above principal, fees, and real cash outflow.
 */
import { money, sumMoney, type FinDecimal, type MoneyLike } from "./money";

export type CostPayment = {
  principal: MoneyLike;
  interest: MoneyLike;
  originationFee: MoneyLike;
  processingFee: MoneyLike;
  penalty: MoneyLike;
  otherFee: MoneyLike;
  actualAccountDebit: MoneyLike;
};

export function debtCost(payments: readonly CostPayment[]) {
  const sum = (key: keyof CostPayment) => sumMoney(payments.map((p) => money(p[key])));
  const interestPaid = sum("interest");
  const originationFeesPaid = sum("originationFee");
  const processingFeesPaid = sum("processingFee");
  const otherFeesPaid = sum("otherFee");
  const penaltiesPaid = sum("penalty");
  const feesPaid = originationFeesPaid.plus(processingFeesPaid).plus(otherFeesPaid);
  return {
    principalPaid: sum("principal"),
    interestPaid,
    originationFeesPaid,
    processingFeesPaid,
    otherFeesPaid,
    penaltiesPaid,
    feesPaid,
    costAbovePrincipal: interestPaid.plus(feesPaid).plus(penaltiesPaid),
    cashOutflow: sum("actualAccountDebit"),
  };
}

export type MonthlyBreakdown = { key: string; principal: FinDecimal; interest: FinDecimal; fees: FinDecimal };

/** Groups dated amounts by calendar month ("YYYY-MM"), ascending. */
export function groupByMonth(
  rows: readonly { date: string; principal: MoneyLike; interest: MoneyLike; fees: MoneyLike }[],
): MonthlyBreakdown[] {
  const map = new Map<string, MonthlyBreakdown>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const m = map.get(key) ?? { key, principal: money(0), interest: money(0), fees: money(0) };
    m.principal = m.principal.plus(money(r.principal));
    m.interest = m.interest.plus(money(r.interest));
    m.fees = m.fees.plus(money(r.fees));
    map.set(key, m);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}
