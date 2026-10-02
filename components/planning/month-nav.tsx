import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatYearMonth, formatYearMonthLabel, shiftYearMonth, type YearMonth } from "@/lib/finance/dates";

/** Previous / next month links that keep the other search params. */
export function MonthNav({ month, basePath, params = {} }: { month: YearMonth; basePath: string; params?: Record<string, string | undefined> }) {
  const href = (m: YearMonth) => {
    const q = new URLSearchParams(Object.entries({ ...params, month: formatYearMonth(m) }).filter((e): e is [string, string] => Boolean(e[1])));
    return `${basePath}?${q}`;
  };
  return (
    <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
      <Link href={href(shiftYearMonth(month, -1))} aria-label="Предыдущий месяц" className="grid size-8 place-items-center rounded-md hover:bg-muted">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-36 px-2 text-center text-sm font-medium">{formatYearMonthLabel(month)}</span>
      <Link href={href(shiftYearMonth(month, 1))} aria-label="Следующий месяц" className="grid size-8 place-items-center rounded-md hover:bg-muted">
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

export function CurrencySwitch({ current, currencies, basePath, params = {} }: { current: string; currencies: string[]; basePath: string; params?: Record<string, string | undefined> }) {
  if (currencies.length < 2) return null;
  return (
    <div className="flex gap-1 rounded-md border bg-card p-0.5" role="group" aria-label="Валюта">
      {currencies.map((c) => {
        const q = new URLSearchParams(Object.entries({ ...params, currency: c }).filter((e): e is [string, string] => Boolean(e[1])));
        return (
          <Link
            key={c}
            href={`${basePath}?${q}`}
            aria-current={c === current ? "true" : undefined}
            className={`rounded px-2.5 py-1 text-xs font-medium ${c === current ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {c}
          </Link>
        );
      })}
    </div>
  );
}
