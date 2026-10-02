import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ExchangeRates } from "@/components/planning/exchange-rates";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { listExchangeRates } from "@/lib/services/exchange-rates";
import { latestCentralBankRates } from "@/lib/services/central-bank-rates";
import { CentralBankRates } from "@/components/planning/central-bank-rates";

export const metadata: Metadata = { title: "Курсы валют" };

export default async function ExchangeRatesPage() {
  const user = await requireUser();
  const [rates, official] = await Promise.all([listExchangeRates(user.id), latestCentralBankRates()]);
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Настройки
      </Link>
      <PageHeader
        title="Курсы валют"
        description="Для пересчёта валютных счетов в сумы и общего баланса. Сами счета никогда не пересчитываются."
      />
      <CentralBankRates rates={official} />
      <div className="grid gap-1">
        <h2 className="font-semibold">Свой курс</h2>
        <p className="text-sm text-muted-foreground">Необязательно. Если указать курс на дату, он будет использоваться вместо курса ЦБ, пока не выйдет более свежий курс ЦБ.</p>
      </div>
      <ExchangeRates rates={rates} baseCurrency={user.baseCurrency} today={todayIn(user.timezone)} />
    </div>
  );
}
