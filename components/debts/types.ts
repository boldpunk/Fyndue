import type { ScheduleItemDTO } from "@/lib/services/debts";

export type PaymentDebt = {
  id: string;
  name: string;
  currency: string;
  feeMode: "NONE" | "ADDED_ON_TOP" | "DEDUCTED_FROM_DISBURSEMENT" | "FINANCED_INTO_DEBT" | "CUSTOM";
  currentPrincipal: string;
};

export type PaymentItem = Pick<
  ScheduleItemDTO,
  | "id"
  | "installmentNumber"
  | "dueDate"
  | "plannedPrincipal"
  | "plannedInterest"
  | "plannedFees"
  | "plannedTotal"
  | "paidPrincipal"
  | "paidInterest"
  | "paidFees"
  | "paidTotal"
  | "remainingTotal"
>;
