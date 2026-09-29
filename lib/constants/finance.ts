export const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  UZS: "Uzbek som",
  USD: "US dollar",
  EUR: "Euro",
  RUB: "Russian ruble",
};

export const ACCOUNT_TYPES = ["BANK_CARD", "CASH", "SAVINGS", "DEPOSIT", "DIGITAL_WALLET", "OTHER"] as const;
export type AccountTypeCode = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountTypeCode, string> = {
  BANK_CARD: "Bank card",
  CASH: "Cash",
  SAVINGS: "Savings",
  DEPOSIT: "Deposit",
  DIGITAL_WALLET: "Digital wallet",
  OTHER: "Other",
};

export const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "DEBT_PAYMENT",
  "BALANCE_ADJUSTMENT",
  "LOAN_DISBURSEMENT",
] as const;
export type TransactionTypeCode = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionTypeCode, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
  DEBT_PAYMENT: "Debt payment",
  BALANCE_ADJUSTMENT: "Adjustment",
  LOAN_DISBURSEMENT: "Loan received",
};

export const TIMEZONES = [
  "Asia/Tashkent",
  "Asia/Samarkand",
  "Asia/Almaty",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "UTC",
] as const;
