import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ExchangeRates } from "@/components/planning/exchange-rates";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { listExchangeRates } from "@/lib/services/exchange-rates";

export const metadata: Metadata = { title: "Exchange rates" };

export default async function ExchangeRatesPage() {
  const user = await requireUser();
  const rates = await listExchangeRates(user.id);
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <PageHeader
        title="Exchange rates"
        description="Your own rates, used only to show an approximate combined balance. Fyndue never fetches or guesses rates, and never converts your accounts."
      />
      <ExchangeRates rates={rates} baseCurrency={user.baseCurrency} today={todayIn(user.timezone)} />
    </div>
  );
}
