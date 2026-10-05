import { AlertTriangle, BellRing, CalendarClock, Check, CircleSlash, Clock, Repeat, Send, Crown } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatLocalDate } from "@/lib/finance/dates";
import type { NotificationLogDTO } from "@/lib/services/notifications";

const TYPE_LABEL: Record<NotificationLogDTO["type"], { label: string; icon: typeof BellRing }> = {
  DUE_IN_DAYS: { label: "Скоро платёж", icon: CalendarClock },
  DUE_TODAY: { label: "Платёж сегодня", icon: BellRing },
  OVERDUE: { label: "Просрочка", icon: AlertTriangle },
  TEST: { label: "Тестовое сообщение", icon: Send },
  SUBSCRIPTION_CHARGE: { label: "Списание подписки", icon: Repeat },
  PRO_EXPIRY: { label: "Окончание Pro", icon: Crown },
};

const STATUS: Record<NotificationLogDTO["status"], { label: string; tone: BadgeTone; icon: typeof Check }> = {
  SENT: { label: "Отправлено", tone: "success", icon: Check },
  PENDING: { label: "Отправляется", tone: "info", icon: Clock },
  FAILED: { label: "Повторим", tone: "warning", icon: AlertTriangle },
  CANCELLED: { label: "Отменено", tone: "neutral", icon: CircleSlash },
};

export function NotificationLog({ entries, timeZone }: { entries: NotificationLogDTO[]; timeZone: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Напоминаний пока нет. Они появятся, когда Telegram будет подключён и подойдёт срок платежа.</p>;
  }
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ul className="-my-2 divide-y">
      {entries.map((e) => {
        const type = TYPE_LABEL[e.type];
        // A failed row that used up its retries is final.
        const status = e.status === "FAILED" && e.attempts >= 5 ? { ...STATUS.FAILED, label: "Не доставлено", tone: "danger" as const } : STATUS[e.status];
        const Icon = type.icon;
        const StatusIcon = status.icon;
        return (
          <li key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{e.debtName ?? type.label}</span>
              <span className="text-[13px] text-muted-foreground">
                {e.debtName ? type.label : null}
                {e.dueDate ? ` · срок ${formatLocalDate(e.dueDate, undefined, { day: "numeric", month: "short" })}` : null}
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
