/**
 * Errors whose message is safe to show to the user. Anything else thrown on
 * the server is logged and replaced with a generic message (docs/security.md §5).
 */
export class DomainError extends Error {
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(message: string, code = "DOMAIN_ERROR", fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

const NOT_FOUND: Record<string, string> = {
  Account: "Счёт не найден.",
  Budget: "Бюджет не найден.",
  Category: "Категория не найдена.",
  Debt: "Долг не найден.",
  Document: "Документ не найден.",
  "Exchange rate": "Курс не найден.",
  Installment: "Платёж по графику не найден.",
  Payment: "Платёж не найден.",
  "Recurring item": "Регулярный платёж не найден.",
  Transaction: "Операция не найдена.",
};

/** Also used for resources owned by another user — never reveal existence. */
export class NotFoundError extends DomainError {
  constructor(entity = "Resource") {
    super(NOT_FOUND[entity] ?? "Не найдено.", "NOT_FOUND");
    this.name = "NotFoundError";
  }
}
