/**
 * Total cost of debt (SPEC §19A). Keeps four numbers apart:
 * principal repaid, cost above principal, fees, and real cash outflow.
 */
import { money, sumMoney, type MoneyLike } from "./money";

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
