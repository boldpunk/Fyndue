export const DEBT_TYPES = ["CREDIT", "CAR_LOAN", "INSTALLMENT", "MICROLOAN", "CREDIT_CARD", "MORTGAGE", "PERSONAL", "OTHER"] as const;
export type DebtTypeCode = (typeof DEBT_TYPES)[number];
export const DEBT_TYPE_LABELS: Record<DebtTypeCode, string> = {
  CREDIT: "Кредит",
  CAR_LOAN: "Автокредит",
  INSTALLMENT: "Рассрочка",
  MICROLOAN: "Микрозайм",
  CREDIT_CARD: "Кредитная карта",
  MORTGAGE: "Ипотека",
  PERSONAL: "Личный долг",
  OTHER: "Другое",
};

export const REPAYMENT_TYPES = ["DIFFERENTIAL", "ANNUITY", "INTEREST_FREE", "MANUAL", "CUSTOM"] as const;
export type RepaymentTypeCode = (typeof REPAYMENT_TYPES)[number];
export const REPAYMENT_TYPE_LABELS: Record<RepaymentTypeCode, string> = {
  DIFFERENTIAL: "Дифференцированный",
  ANNUITY: "Аннуитетный",
  INTEREST_FREE: "Беспроцентная рассрочка",
  MANUAL: "Свой график",
  CUSTOM: "Произвольный",
};
export const REPAYMENT_TYPE_HINTS: Record<RepaymentTypeCode, string> = {
  DIFFERENTIAL: "Основной долг гасится равными частями, проценты — на остаток. Платежи со временем уменьшаются.",
  ANNUITY: "Одинаковый платёж каждый месяц; доля процентов в нём со временем снижается.",
  INTEREST_FREE: "Без процентов — остаток делится на равные платежи.",
  MANUAL: "Вы вводите каждый платёж сами, например из графика банка.",
  CUSTOM: "Полностью ручной график: основной долг, проценты и комиссии в каждой строке.",
};

export const FEE_MODES = ["NONE", "ADDED_ON_TOP", "DEDUCTED_FROM_DISBURSEMENT", "FINANCED_INTO_DEBT", "CUSTOM"] as const;
export type FeeModeCode = (typeof FEE_MODES)[number];
export const FEE_MODE_LABELS: Record<FeeModeCode, string> = {
  NONE: "Без комиссии",
  ADDED_ON_TOP: "Сверху — оплачивается с первым платежом",
  DEDUCTED_FROM_DISBURSEMENT: "Удержана из выданной суммы",
  FINANCED_INTO_DEBT: "Включена в сумму долга",
  CUSTOM: "Другое",
};

export const DAY_COUNT_CONVENTIONS = ["MONTHLY_30_360", "ACTUAL_365", "ACTUAL_360", "ACTUAL_ACTUAL"] as const;
export const DAY_COUNT_LABELS: Record<(typeof DAY_COUNT_CONVENTIONS)[number], string> = {
  MONTHLY_30_360: "Помесячно (ставка ÷ 12)",
  ACTUAL_365: "Фактические дни / 365",
  ACTUAL_360: "Фактические дни / 360",
  ACTUAL_ACTUAL: "Фактические / фактические",
};

export const SCHEDULE_REASON_LABELS = {
  INITIAL: "Исходный",
  MANUAL_EDIT: "Ручная правка",
  BANK_IMPORT: "График банка",
  EARLY_REPAYMENT: "Досрочное погашение",
  RESTRUCTURE: "Реструктуризация",
  CORRECTION: "Исправление",
} as const;

export const DOCUMENT_TYPE_LABELS = {
  LOAN_AGREEMENT: "Кредитный договор",
  PAYMENT_RECEIPT: "Чек об оплате",
  BANK_SCHEDULE: "График банка",
  OTHER: "Другое",
} as const;
