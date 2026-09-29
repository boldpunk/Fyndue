import { randomUUID } from "node:crypto";
import { createDebt } from "@/lib/services/debts";
import type { DebtCreateInput } from "@/lib/validations/debts";

const base: Omit<DebtCreateInput, "clientRequestId"> = {
  type: "CREDIT",
  name: "Credit",
  lender: undefined,
  currency: "UZS",
  repaymentType: "DIFFERENTIAL",
  originalPrincipal: "12000.00",
  paidBeforeTracking: undefined,
  feeMode: "NONE",
  originationFee: undefined,
  netAmountReceived: undefined,
  annualInterestRate: "12",
  dayCountConvention: "MONTHLY_30_360",
  roundingScale: 2,
  startDate: "2026-01-01",
  firstPaymentDate: "2026-02-01",
  paymentDay: undefined,
  termMonths: 12,
  installmentAmount: undefined,
  knownTotalRepayment: false,
  manualLines: undefined,
  knownTotalLines: undefined,
  disbursementAccountId: undefined,
  notes: undefined,
};

export function createTestDebt(userId: string, overrides: Partial<DebtCreateInput> = {}) {
  return createDebt(userId, { ...base, clientRequestId: randomUUID(), ...overrides });
}

export const zeroBreakdown = { principal: "0", interest: "0", originationFee: "0", processingFee: "0", penalty: "0", otherFee: "0" };
