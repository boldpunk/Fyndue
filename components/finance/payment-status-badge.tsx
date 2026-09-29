import {
  AlarmClock,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleSlash,
  Clock,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { DisplayPaymentStatus } from "@/lib/finance/payment-status";

export const PAYMENT_STATUS_META: Record<DisplayPaymentStatus, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  UPCOMING: { label: "Upcoming", tone: "neutral", icon: Clock },
  DUE_SOON: { label: "Due soon", tone: "warning", icon: CalendarClock },
  URGENT: { label: "Urgent", tone: "warning", icon: AlarmClock },
  DUE_TODAY: { label: "Due today", tone: "warning", icon: BellRing },
  OVERDUE: { label: "Overdue", tone: "danger", icon: CircleAlert },
  PARTIALLY_PAID: { label: "Partially paid", tone: "info", icon: CircleDashed },
  PAID: { label: "Paid", tone: "success", icon: CheckCircle2 },
  SKIPPED: { label: "Skipped", tone: "neutral", icon: CircleSlash },
  RESCHEDULED: { label: "Rescheduled", tone: "neutral", icon: Repeat },
};

/** Status is always icon + text + colour — never colour alone (SPEC §7). */
export function PaymentStatusBadge({ status, className }: { status: DisplayPaymentStatus; className?: string }) {
  const meta = PAYMENT_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} className={className}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function daysLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${-days} days overdue`;
  return `in ${days} days`;
}
