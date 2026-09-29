/**
 * Microloan fee modes (SPEC §19A). Contract principal, net amount received
 * and fees are kept separate — a fee is never silently merged into principal.
 */
import { money, ZERO, type FinDecimal, type MoneyLike } from "./money";

export type FeeMode = "NONE" | "ADDED_ON_TOP" | "DEDUCTED_FROM_DISBURSEMENT" | "FINANCED_INTO_DEBT" | "CUSTOM";

export type FeeStructure = {
  contractPrincipal: FinDecimal;
  /** What the schedule amortises and progress is measured against. */
  principalBasis: FinDecimal;
  /** What actually arrived in the user's account. */
  netReceived: FinDecimal;
  /** Fee repaid through the schedule (ADDED_ON_TOP). */
  scheduledFee: FinDecimal;
  /** Fee kept by the lender at disbursement (DEDUCTED_FROM_DISBURSEMENT). */
  withheldFee: FinDecimal;
  /** Principal basis + scheduled fee (before interest). */
  totalRepayment: FinDecimal;
};

export function resolveFeeStructure(input: {
  contractPrincipal: MoneyLike;
  feeMode: FeeMode;
  fee?: MoneyLike;
  /** Only used by CUSTOM. */
  netReceived?: MoneyLike;
}): FeeStructure {
  const principal = money(input.contractPrincipal);
  const fee = money(input.fee ?? 0);
  if (fee.isNegative()) throw new RangeError("Fee cannot be negative");
  const base = { contractPrincipal: principal, principalBasis: principal, netReceived: principal, scheduledFee: ZERO, withheldFee: ZERO };
  let result: Omit<FeeStructure, "totalRepayment">;
  switch (input.feeMode) {
    case "NONE":
      result = base;
      break;
    case "ADDED_ON_TOP":
      result = { ...base, scheduledFee: fee };
      break;
    case "DEDUCTED_FROM_DISBURSEMENT":
      if (fee.greaterThanOrEqualTo(principal)) throw new RangeError("The fee cannot exceed the principal");
      result = { ...base, netReceived: principal.minus(fee), withheldFee: fee };
      break;
    case "FINANCED_INTO_DEBT":
      result = { ...base, principalBasis: principal.plus(fee) };
      break;
    case "CUSTOM":
      result = { ...base, netReceived: input.netReceived !== undefined ? money(input.netReceived) : principal, scheduledFee: fee };
      break;
  }
  return { ...result, totalRepayment: result.principalBasis.plus(result.scheduledFee) };
}
