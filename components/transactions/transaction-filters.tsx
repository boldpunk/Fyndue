"use client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { formatYearMonth, formatYearMonthLabel, parseYearMonth, shiftYearMonth, type YearMonth } from "@/lib/finance/dates";
import { cn } from "@/lib/utils/cn";

const TYPE_FILTERS = [
  { value: "", label: "Все" },
  { value: "EXPENSE", label: "Расходы" },
  { value: "INCOME", label: "Доходы" },
  { value: "TRANSFER", label: "Переводы" },
  { value: "BALANCE_ADJUSTMENT", label: "Корректировки" },
] as const;

/** Filters live in the URL so every view is linkable and server-rendered. */
export function TransactionFilters({
  accounts,
  currentMonth,
}: {
  accounts: { id: string; name: string }[];
  currentMonth: YearMonth;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    startTransition(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  const month = parseYearMonth(params.get("month"));
  const type = params.get("type") ?? "";

  return (
    <div className={cn("grid gap-3 transition-opacity", pending && "opacity-60")}>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => update({ type: f.value || null })}
            aria-pressed={type === f.value}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors",
              type === f.value ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
        <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Предыдущий месяц"
            onClick={() => update({ month: formatYearMonth(shiftYearMonth(month ?? currentMonth, -1)) })}
          >
            <ChevronLeft />
          </Button>
          <button type="button" onClick={() => update({ month: month ? null : formatYearMonth(currentMonth) })} className="min-w-32 px-2 text-sm font-medium">
            {month ? formatYearMonthLabel(month) : "За всё время"}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Следующий месяц"
            onClick={() => update({ month: formatYearMonth(shiftYearMonth(month ?? currentMonth, 1)) })}
          >
            <ChevronRight />
          </Button>
        </div>
        <NativeSelect aria-label="Счёт" value={params.get("account") ?? ""} onChange={(e) => update({ account: e.target.value || null })}>
          <option value="">Все счета</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: q.trim() || null });
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по комментарию, месту, категории" aria-label="Поиск операций" className="pl-9" />
        </form>
      </div>
    </div>
  );
}
