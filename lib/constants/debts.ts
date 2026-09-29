export const DEBT_TYPES = ["CREDIT", "CAR_LOAN", "INSTALLMENT", "MICROLOAN", "CREDIT_CARD", "MORTGAGE", "PERSONAL", "OTHER"] as const;
export type DebtTypeCode = (typeof DEBT_TYPES)[number];
export const DEBT_TYPE_LABELS: Record<DebtTypeCode, string> = {
  CREDIT: "Credit",
  CAR_LOAN: "Car loan",
  INSTALLMENT: "Installment",
  MICROLOAN: "Microloan",
  CREDIT_CARD: "Credit card",
  MORTGAGE: "Mortgage",
  PERSONAL: "Personal debt",
  OTHER: "Other",
};

export const REPAYMENT_TYPES = ["DIFFERENTIAL", "ANNUITY", "INTEREST_FREE", "MANUAL", "CUSTOM"] as const;
export type RepaymentTypeCode = (typeof REPAYMENT_TYPES)[number];
export const REPAYMENT_TYPE_LABELS: Record<RepaymentTypeCode, string> = {
  DIFFERENTIAL: "Differential",
  ANNUITY: "Annuity",
  INTEREST_FREE: "Interest-free installment",
  MANUAL: "Manual schedule",
  CUSTOM: "Custom",
};
export const REPAYMENT_TYPE_HINTS: Record<RepaymentTypeCode, string> = {
  DIFFERENTIAL: "Equal principal each month, interest on the remaining balance — payments shrink over time.",
  ANNUITY: "The same payment every month; the interest share falls as you repay.",
  INTEREST_FREE: "No interest — the remaining amount is split into installments.",
  MANUAL: "Enter each payment yourself, e.g. copied from the bank's schedule.",
  CUSTOM: "Fully manual structure with explicit principal, interest and fees per line.",
};

export const FEE_MODES = ["NONE", "ADDED_ON_TOP", "DEDUCTED_FROM_DISBURSEMENT", "FINANCED_INTO_DEBT", "CUSTOM"] as const;
export type FeeModeCode = (typeof FEE_MODES)[number];
export const FEE_MODE_LABELS: Record<FeeModeCode, string> = {
  NONE: "No fee",
  ADDED_ON_TOP: "Added on top — repaid with the first payment",
  DEDUCTED_FROM_DISBURSEMENT: "Deducted from the money received",
  FINANCED_INTO_DEBT: "Financed into the debt",
  CUSTOM: "Custom",
};

export const DAY_COUNT_CONVENTIONS = ["MONTHLY_30_360", "ACTUAL_365", "ACTUAL_360", "ACTUAL_ACTUAL"] as const;
export const DAY_COUNT_LABELS: Record<(typeof DAY_COUNT_CONVENTIONS)[number], string> = {
  MONTHLY_30_360: "Monthly (rate ÷ 12)",
  ACTUAL_365: "Actual days / 365",
  ACTUAL_360: "Actual days / 360",
  ACTUAL_ACTUAL: "Actual / actual",
};

export const SCHEDULE_REASON_LABELS = {
  INITIAL: "Initial",
  MANUAL_EDIT: "Manual edit",
  BANK_IMPORT: "Bank schedule",
  EARLY_REPAYMENT: "Early repayment",
  RESTRUCTURE: "Restructure",
  CORRECTION: "Correction",
} as const;
