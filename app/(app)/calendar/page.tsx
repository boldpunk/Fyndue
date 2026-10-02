import { CalendarDays, List } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarView } from "@/components/planning/calendar-view";
import { MonthNav } from "@/components/planning/month-nav";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { addDays, formatYearMonth, monthBounds, parseYearMonth, todayIn, yearMonthOf } from "@/lib/finance/dates";
import { money, sumMoney, toMoneyString } from "@/lib/finance/money";
import { listAccounts } from "@/lib/services/accounts";
import { getCalendarEvents } from "@/lib/services/calendar";
import { getSettings } from "@/lib/services/settings";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Календарь" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const today = todayIn(user.timezone);
  const month = parseYearMonth(query.month) ?? yearMonthOf(today);
  const view = query.view === "list" ? "list" : "month";
  const bounds = monthBounds(month);
  const [{ events }, accounts, settings] = await Promise.all([
    getCalendarEvents(user.id, bounds.start, addDays(bounds.endExclusive, -1)),
    listAccounts(user.id),
    getSettings(user.id),
  ]);

  // Month totals in the primary currency (other currencies are listed per event, never summed).
  const open = events.filter((e) => !e.done && e.currency === user.baseCurrency);
  const total = (kinds: string[]) => toMoneyString(sumMoney(open.filter((e) => kinds.includes(e.kind)).map((e) => money(e.amount))));
  const monthParam = formatYearMonth(month);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Календарь"
        description="Платежи по долгам, ожидаемый доход, счета и подписки — всё запланированное по датам."
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 rounded-md border bg-card p-0.5" role="group" aria-label="Вид">
              {(
                [
                  ["month", "Месяц", CalendarDays],
                  ["list", "Лента", List],
                ] as const
              ).map(([value, label, Icon]) => (
                <Link
                  key={value}
                  href={`/calendar?month=${monthParam}${value === "list" ? "&view=list" : ""}`}
                  aria-current={view === value ? "true" : undefined}
                  className={cn("inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", view === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="size-3.5" aria-hidden /> {label}
                </Link>
              ))}
            </div>
            <MonthNav month={month} basePath="/calendar" params={{ view: view === "list" ? "list" : undefined }} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Ещё заплатить по долгам", ["DEBT_PAYMENT"], "neutral"],
            ["Счета и подписки", ["RECURRING_EXPENSE", "SUBSCRIPTION"], "neutral"],
            ["Ожидается доход", ["EXPECTED_INCOME", "RECURRING_INCOME"], "positive"],
          ] as const
        ).map(([label, kinds, tone]) => (
          <Card key={label} className="grid gap-1 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <Money amount={total([...kinds])} currency={user.baseCurrency} tone={tone} className="font-semibold" />
          </Card>
        ))}
        <Card className="grid gap-1 p-4">
          <p className="text-xs text-muted-foreground">Событий в этом месяце</p>
          <p className="tabular font-semibold">
            {events.filter((e) => !e.done).length} впереди · {events.filter((e) => e.done).length} выполнено
          </p>
        </Card>
      </div>

      <CalendarView
        month={month}
        view={view}
        events={events}
        today={today}
        weekStartsOn={settings.weekStartsOn}
        accounts={accounts.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }))}
        primaryCurrency={user.baseCurrency}
      />
    </div>
  );
}
