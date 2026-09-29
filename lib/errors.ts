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

/** Also used for resources owned by another user — never reveal existence. */
export class NotFoundError extends DomainError {
  constructor(entity = "Resource") {
    super(`${entity} not found.`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}
