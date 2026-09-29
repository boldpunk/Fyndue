/**
 * Display status of a schedule line (SPEC §12). Overdue and "due soon" are
 * derived from today on every read — never stored, so never stale.
 */
import { daysBetween, type LocalDate } from "./dates";

export type StoredItemStatus = "SCHEDULED" | "PARTIALLY_PAID" | "PAID" | "SKIPPED" | "RESCHEDULED";
export type DisplayPaymentStatus =
  | "UPCOMING"
  | "DUE_SOON"
  | "URGENT"
  | "DUE_TODAY"
  | "OVERDUE"
  | "PARTIALLY_PAID"
  | "PAID"
  | "SKIPPED"
  | "RESCHEDULED";

export function displayPaymentStatus(input: {
  status: StoredItemStatus;
  dueDate: LocalDate;
  today: LocalDate;
  dueSoonDays?: number;
  urgentDays?: number;
}): { status: DisplayPaymentStatus; days: number } {
  const days = daysBetween(input.today, input.dueDate);
  const dueSoon = input.dueSoonDays ?? 7;
  const urgent = input.urgentDays ?? 2;
  if (input.status === "PAID" || input.status === "SKIPPED" || input.status === "RESCHEDULED") return { status: input.status, days };
  if (days < 0) return { status: "OVERDUE", days };
  if (input.status === "PARTIALLY_PAID") return { status: "PARTIALLY_PAID", days };
  if (days === 0) return { status: "DUE_TODAY", days };
  if (days <= urgent) return { status: "URGENT", days };
  if (days <= dueSoon) return { status: "DUE_SOON", days };
  return { status: "UPCOMING", days };
}

export function isOpenItemStatus(status: StoredItemStatus): boolean {
  return status === "SCHEDULED" || status === "PARTIALLY_PAID";
}
