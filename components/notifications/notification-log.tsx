import { AlertTriangle, BellRing, CalendarClock, Check, CircleSlash, Clock, Send } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatLocalDate } from "@/lib/finance/dates";
import type { NotificationLogDTO } from "@/lib/services/notifications";

const TYPE_LABEL: Record<NotificationLogDTO["type"], { label: string; icon: typeof BellRing }> = {
  DUE_IN_DAYS: { label: "Upcoming payment", icon: CalendarClock },
  DUE_TODAY: { label: "Due today", icon: BellRing },
  OVERDUE: { label: "Overdue", icon: AlertTriangle },
  TEST: { label: "Test message", icon: Send },
};

const STATUS: Record<NotificationLogDTO["status"], { label: string; tone: BadgeTone; icon: typeof Check }> = {
  SENT: { label: "Sent", tone: "success", icon: Check },
  PENDING: { label: "Sending", tone: "info", icon: Clock },
  FAILED: { label: "Will retry", tone: "warning", icon: AlertTriangle },
  CANCELLED: { label: "Cancelled", tone: "neutral", icon: CircleSlash },
};

export function NotificationLog({ entries, timeZone }: { entries: NotificationLogDTO[]; timeZone: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No reminders yet. They appear here once Telegram is connected and a payment is coming up.</p>;
  }
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ul className="-my-2 divide-y">
      {entries.map((e) => {
        const type = TYPE_LABEL[e.type];
        // A failed row that used up its retries is final.
        const status = e.status === "FAILED" && e.attempts >= 5 ? { ...STATUS.FAILED, label: "Failed", tone: "danger" as const } : STATUS[e.status];
        const Icon = type.icon;
        const StatusIcon = status.icon;
        return (
          <li key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{e.debtName ?? type.label}</span>
              <span className="text-[13px] text-muted-foreground">
                {e.debtName ? type.label : null}
                {e.dueDate ? ` · due ${formatLocalDate(e.dueDate, undefined, { day: "numeric", month: "short" })}` : null}
                {e.debtName || e.dueDate ? " · " : null}
                {time.format(new Date(e.sentAt ?? e.createdAt))}
              </span>
            </div>
            <Badge tone={status.tone}>
              <StatusIcon aria-hidden /> {status.label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
