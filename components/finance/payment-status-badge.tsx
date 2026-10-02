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
import { pluralRu } from "@/lib/finance/recurrence";

export const PAYMENT_STATUS_META: Record<DisplayPaymentStatus, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  UPCOMING: { label: "Скоро", tone: "neutral", icon: Clock },
  DUE_SOON: { label: "Скоро срок", tone: "warning", icon: CalendarClock },
  URGENT: { label: "Срочно", tone: "warning", icon: AlarmClock },
  DUE_TODAY: { label: "Сегодня", tone: "warning", icon: BellRing },
  OVERDUE: { label: "Просрочен", tone: "danger", icon: CircleAlert },
  PARTIALLY_PAID: { label: "Оплачен частично", tone: "info", icon: CircleDashed },
  PAID: { label: "Оплачен", tone: "success", icon: CheckCircle2 },
  SKIPPED: { label: "Пропущен", tone: "neutral", icon: CircleSlash },
  RESCHEDULED: { label: "Перенесён", tone: "neutral", icon: Repeat },
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
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  const n = Math.abs(days);
  const word = `${n} ${pluralRu(n, ["день", "дня", "дней"])}`;
  return days < 0 ? `просрочен на ${word}` : `через ${word}`;
}
