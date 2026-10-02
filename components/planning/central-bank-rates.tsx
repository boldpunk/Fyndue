"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { refreshCentralBankRatesAction } from "@/app/(app)/planning-actions";
import { Money } from "@/components/finance/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CURRENCY_LABELS, type CurrencyCode } from "@/lib/constants/finance";
import { formatLocalDate } from "@/lib/finance/dates";
import type { CentralBankRateDTO } from "@/lib/services/central-bank-rates";

/** Today's official rates (cbu.uz), refreshed automatically every day. */
export function CentralBankRates({ rates }: { rates: CentralBankRateDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = () =>
    startTransition(async () => {
      const result = await refreshCentralBankRatesAction();
      if (!result.ok) return void toast.error(result.error);
      toast.success("Курс ЦБ обновлён");
      router.refresh();
    });
  const date = rates[0]?.rateDate;
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="font-semibold">Курс Центробанка Узбекистана</h2>
          <p className="text-sm text-muted-foreground">
            {date ? `Официальный курс на ${formatLocalDate(date, undefined, { day: "numeric", month: "long", year: "numeric" })}. Обновляется автоматически каждый день.` : "Курс ещё не загружен."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={pending}>
          <RefreshCw className={pending ? "animate-spin" : undefined} /> {pending ? "Обновляем…" : "Обновить"}
        </Button>
      </div>
      {rates.length ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          {rates.map((r) => (
            <li key={r.currency} className="grid gap-0.5 rounded-lg bg-muted/60 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">
                1 {r.currency} · {CURRENCY_LABELS[r.currency as CurrencyCode] ?? r.currency}
              </span>
              <Money amount={r.rate} currency="UZS" className="font-semibold" />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[13px] text-muted-foreground">
        По этому курсу Fyndue показывает долларовые и другие валютные счета в сумах и считает общий баланс. Сами счета не пересчитываются: на долларовом счёте
        всегда хранятся доллары.
      </p>
    </Card>
  );
}
