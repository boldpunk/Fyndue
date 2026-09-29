/**
 * Payment breakdown rules (SPEC §19A, §22, docs/debt-engine.md §1.6):
 *
 *   amountAppliedToDebt = principal + interest + originationFee + penalty + otherFee
 *   actualAccountDebit  = amountAppliedToDebt + processingFee
 *
 * The debt engine uses the breakdown; the account engine uses the debit.
 */
import { money, ZERO, type FinDecimal, type MoneyLike } from "./money";

export type PaymentBreakdown = {
  principal: MoneyLike;
  interest: MoneyLike;
  originationFee: MoneyLike;
  processingFee: MoneyLike;
  penalty: MoneyLike;
  otherFee: MoneyLike;
};

export const BREAKDOWN_KEYS = ["principal", "interest", "originationFee", "processingFee", "penalty", "otherFee"] as const;

export function paymentTotals(b: PaymentBreakdown) {
  const amountAppliedToDebt = money(b.principal)
    .plus(money(b.interest))
    .plus(money(b.originationFee))
    .plus(money(b.penalty))
    .plus(money(b.otherFee));
  return { amountAppliedToDebt, actualAccountDebit: amountAppliedToDebt.plus(money(b.processingFee)) };
}

export type ItemRemaining = { principal: FinDecimal; interest: FinDecimal; fees: FinDecimal; total: FinDecimal };

export function itemRemaining(item: {
  plannedPrincipal: MoneyLike;
  plannedInterest: MoneyLike;
  plannedFees: MoneyLike;
  paidPrincipal: MoneyLike;
  paidInterest: MoneyLike;
  paidFees: MoneyLike;
}): ItemRemaining {
  const clamp = (d: FinDecimal) => (d.isNegative() ? ZERO : d);
  const principal = clamp(money(item.plannedPrincipal).minus(money(item.paidPrincipal)));
  const interest = clamp(money(item.plannedInterest).minus(money(item.paidInterest)));
  const fees = clamp(money(item.plannedFees).minus(money(item.paidFees)));
  return { principal, interest, fees, total: principal.plus(interest).plus(fees) };
}

/**
 * Field → message map; empty when valid. Interest and fees may differ from
 * the plan (the bank's actual figures win), but principal may not exceed
 * what the line still owes — extra principal is an early repayment.
 */
export function validatePaymentBreakdown(
  b: PaymentBreakdown,
  context: { currentPrincipal: MoneyLike; item?: ItemRemaining },
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of BREAKDOWN_KEYS) {
    if (money(b[key]).isNegative()) errors[key] = "Cannot be negative";
  }
  if (Object.keys(errors).length) return errors;
  const { actualAccountDebit } = paymentTotals(b);
  if (actualAccountDebit.lte(0)) errors.form = "Enter at least one amount";
  const principal = money(b.principal);
  if (principal.greaterThan(money(context.currentPrincipal))) {
    errors.principal = "More than the remaining principal";
  } else if (context.item && principal.greaterThan(context.item.principal)) {
    errors.principal = `This installment has ${context.item.principal.toFixed(2)} principal left — record extra as an early repayment`;
  }
  return errors;
}

/**
 * Default breakdown for "Mark as paid": the line's remaining amounts, or, for
 * a smaller amount, fees first, then interest, then principal.
 */
export function suggestBreakdown(remaining: ItemRemaining, amount?: MoneyLike) {
  if (amount === undefined) return { principal: remaining.principal, interest: remaining.interest, fees: remaining.fees };
  let left = money(amount);
  const take = (owed: FinDecimal) => {
    const part = left.lessThan(owed) ? left : owed;
    left = left.minus(part);
    return part;
  };
  const fees = take(remaining.fees);
  const interest = take(remaining.interest);
  const principal = take(remaining.principal);
  return { principal, interest, fees };
}
