export const CURRENCIES = ["UZS", "USD", "EUR", "RUB"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  UZS: "Узбекский сум",
  USD: "Доллар США",
  EUR: "Евро",
  RUB: "Российский рубль",
};

export const ACCOUNT_TYPES = ["BANK_CARD", "CASH", "SAVINGS", "DEPOSIT", "DIGITAL_WALLET", "OTHER"] as const;
export type AccountTypeCode = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountTypeCode, string> = {
  BANK_CARD: "Банковская карта",
  CASH: "Наличные",
  SAVINGS: "Накопления",
  DEPOSIT: "Вклад",
  DIGITAL_WALLET: "Электронный кошелёк",
  OTHER: "Другое",
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
  EXPENSE: "Расход",
  INCOME: "Доход",
  TRANSFER: "Перевод",
  DEBT_PAYMENT: "Платёж по долгу",
  BALANCE_ADJUSTMENT: "Корректировка",
  LOAN_DISBURSEMENT: "Получен заём",
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
