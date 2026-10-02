"use client";
import { ArrowDownLeft, CheckCircle2, Landmark, Repeat, Tv } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmIncomeAction } from "@/app/(app)/transactions/actions";
import { RecordPaymentDialog } from "@/components/debts/record-payment-dialog";
import { Money } from "@/components/finance/money";
import { PaymentStatusBadge } from "@/components/finance/payment-status-badge";
import type { AccountOption } from "@/components/transactions/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { formatLocalDate, monthGrid, parseLocalDate, type YearMonth } from "@/lib/finance/dates";
import type { CalendarEvent, CalendarEventKind } from "@/lib/services/calendar";
import { cn } from "@/lib/utils/cn";
import { RecordOccurrenceDialog, type OccurrenceTarget } from "./record-occurrence-dialog";

const KIND_META: Record<CalendarEventKind, { label: string; dot: string; icon: typeof Landmark }> = {
  DEBT_PAYMENT: { label: "Debt payment", dot: "bg-primary", icon: Landmark },
  EXPECTED_INCOME: { label: "Expected income", dot: "bg-success", icon: ArrowDownLeft },
  RECURRING_INCOME: { label: "Recurring income", dot: "bg-success", icon: Repeat },
  RECURRING_EXPENSE: { label: "Recurring expense", dot: "bg-warning", icon: Repeat },
  SUBSCRIPTION: { label: "Subscription", dot: "bg-info", icon: Tv },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function EventRow({
  event,
  onPay,
  onRecord,
  onConfirm,
  pending,
}: {
  event: CalendarEvent;
  onPay: (e: CalendarEvent) => void;
  onRecord: (e: CalendarEvent) => void;
  onConfirm: (e: CalendarEvent) => void;
  pending: boolean;
}) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const href = event.debt ? `/debts/${event.debt.id}?tab=schedule` : event.recurring?.transactionId ? `/transactions/${event.recurring.transactionId}` : event.transactionId ? `/transactions/${event.transactionId}` : null;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 py-3", event.done && "opacity-60")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {href ? (
          <Link href={href} className="truncate text-sm font-medium hover:underline">
            {event.title}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{event.title}</p>
        )}
        <p className="truncate text-[13px] text-muted-foreground">
          {meta.label}
          {event.subtitle ? ` · ${event.subtitle}` : ""}
        </p>
      </div>
      <div className="grid justify-items-end gap-1">
        <Money
          amount={event.direction === "OUT" ? `-${event.amount}` : event.amount}
          currency={event.currency}
          signed
          tone={event.direction === "IN" ? "positive" : "neutral"}
          className={cn("text-sm font-semibold", event.done && "line-through")}
        />
        {event.displayStatus ? (
          <PaymentStatusBadge status={event.displayStatus} />
        ) : event.done ? (
          <Badge tone="success">
            <CheckCircle2 aria-hidden /> Recorded
          </Badge>
        ) : (
          <Badge>Planned</Badge>
        )}
      </div>
      {!event.done ? (
        <div className="basis-full sm:basis-auto">
          {event.kind === "DEBT_PAYMENT" ? (
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => onPay(event)}>
              Mark as paid
            </Button>
          ) : event.kind === "EXPECTED_INCOME" ? (
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => onConfirm(event)} disabled={pending}>
              Mark received
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => onRecord(event)}>
              Record
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CalendarView({
  month,
  view,
  events,
  today,
  weekStartsOn,
  accounts,
  primaryCurrency,
}: {
  month: YearMonth;
  view: "month" | "list";
  events: CalendarEvent[];
  today: string;
  weekStartsOn: number;
  accounts: AccountOption[];
  primaryCurrency: string;
}) {
  const router = useRouter();
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const [selected, setSelected] = useState<string | null>(null);
  const [paying, setPaying] = useState<CalendarEvent | null>(null);
  const [recording, setRecording] = useState<OccurrenceTarget | null>(null);
  const [pending, startTransition] = useTransition();

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);
  const grid = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn]);
  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + weekStartsOn) % 7]);

  const onPay = (e: CalendarEvent) => setPaying(e);
  const onRecord = (e: CalendarEvent) =>
    e.recurring &&
    setRecording({ recurringId: e.recurring.recurringId, occurrenceDate: e.recurring.occurrenceDate, name: e.title, amount: e.amount, currency: e.currency, accountId: e.recurring.accountId, direction: e.direction });
  const onConfirm = (e: CalendarEvent) =>
    startTransition(async () => {
      if (!e.transactionId) return;
      const result = await confirmIncomeAction(e.transactionId);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Income received — balance updated");
      router.refresh();
    });
  const rowProps = { onPay, onRecord, onConfirm, pending };

  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];
  const timelineDates = [...byDate.keys()].sort();

  return (
    <>
      {view === "month" ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
            {weekdays.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map(({ date, inMonth }) => {
              const dayEvents = byDate.get(date) ?? [];
              const overdue = dayEvents.some((e) => e.displayStatus === "OVERDUE");
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelected(date)}
                  aria-label={`${formatLocalDate(date, undefined, { weekday: "long", day: "numeric", month: "long" })}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                  className={cn(
                    "flex min-h-16 flex-col items-stretch gap-1 border-r border-b p-1.5 text-left transition-colors hover:bg-muted/60 lg:min-h-28",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                    selected === date && "bg-primary-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "tabular grid size-6 place-items-center self-start rounded-full text-xs font-medium",
                      isToday && "bg-primary text-primary-foreground",
                      overdue && !isToday && "bg-danger-subtle text-danger",
                    )}
                  >
                    {parseLocalDate(date).day}
                  </span>
                  {desktop ? (
                    <span className="grid gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span key={e.id} className={cn("flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px]", e.done ? "text-muted-foreground line-through" : "bg-muted/70")}>
                          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", KIND_META[e.kind].dot)} />
                          <span className="truncate">{e.title}</span>
                        </span>
                      ))}
                      {dayEvents.length > 3 ? <span className="px-1 text-[11px] text-muted-foreground">+{dayEvents.length - 3} more</span> : null}
                    </span>
                  ) : dayEvents.length ? (
                    <span className="flex flex-wrap gap-0.5" aria-hidden>
                      {dayEvents.slice(0, 4).map((e) => (
                        <span key={e.id} className={cn("size-1.5 rounded-full", KIND_META[e.kind].dot, e.done && "opacity-40")} />
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {timelineDates.length === 0 ? (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Nothing planned in this period.</p>
          ) : (
            timelineDates.map((date) => (
              <section key={date} aria-label={date} className="grid gap-1">
                <h2 className={cn("px-1 text-xs font-medium tracking-wide uppercase", date === today ? "text-primary" : date < today ? "text-muted-foreground" : "text-foreground")}>
                  {date === today ? "Today · " : ""}
                  {formatLocalDate(date, undefined, { weekday: "short", day: "numeric", month: "short" })}
                </h2>
                <Card className="divide-y px-4">
                  {byDate.get(date)!.map((e) => (
                    <EventRow key={e.id} event={e} {...rowProps} />
                  ))}
                </Card>
              </section>
            ))
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
        {(Object.keys(KIND_META) as CalendarEventKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-full", KIND_META[k].dot)} />
            {KIND_META[k].label}
          </span>
        ))}
        <span>· amounts in {primaryCurrency} unless shown otherwise</span>
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side={desktop ? "right" : "bottom"}>
          <SheetHeader>
            <SheetTitle>{selected ? formatLocalDate(selected, undefined, { weekday: "long", day: "numeric", month: "long" }) : ""}</SheetTitle>
            <SheetDescription>{selectedEvents.length ? `${selectedEvents.length} planned item${selectedEvents.length === 1 ? "" : "s"}` : "Nothing planned on this day."}</SheetDescription>
          </SheetHeader>
          <div className="divide-y">
            {selectedEvents.map((e) => (
              <EventRow key={e.id} event={e} {...rowProps} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/transactions/recurring">
                <Repeat /> Recurring items
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {paying?.debt && paying.item ? (
        <RecordPaymentDialog open onOpenChange={(o) => !o && setPaying(null)} debt={paying.debt} item={paying.item} accounts={accounts} today={today} />
      ) : null}
      <RecordOccurrenceDialog target={recording} onClose={() => setRecording(null)} accounts={accounts} today={today} />
    </>
  );
}

