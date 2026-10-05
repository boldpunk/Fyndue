import { ChevronRight, Plus, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountCard } from "@/components/accounts/account-card";
import { EmptyState } from "@/components/finance/empty-state";
import { Money } from "@/components/finance/money";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { totalsByCurrency } from "@/lib/finance/balance";
import { toMoneyString } from "@/lib/finance/money";
import { listAccounts } from "@/lib/services/accounts";
import { ratesForUser } from "@/lib/services/central-bank-rates";
import { listSharedWithMe } from "@/lib/services/shared-accounts";
import { formatLocalDate, todayIn } from "@/lib/finance/dates";
import { combineInBase, convert, findRate } from "@/lib/finance/fx";

export const metadata: Metadata = { title: "Счета" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const user = await requireUser();
  const showArchived = (await searchParams).archived === "1";
  const [accounts, rates, sharedWithMe] = await Promise.all([listAccounts(user.id, { includeArchived: true }), ratesForUser(user.id), listSharedWithMe(user.id)]);
  const today = todayIn(user.timezone);
  const base = user.baseCurrency;
  /** Amount in the primary currency at the latest rate, or null without a rate. */
  const inBase = (amount: string, currency: string) => {
    if (currency === base) return null;
    const rate = findRate(rates, currency, base, today);
    return rate ? { amount: toMoneyString(convert(amount, rate.rate)), currency: base, rateDate: rate.effectiveDate, source: rate.source } : null;
  };
  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);
  const totals = totalsByCurrency(active);
  const currencies = [...new Set(active.map((a) => a.currency))].sort((a, b) =>
    a === user.baseCurrency ? -1 : b === user.baseCurrency ? 1 : a.localeCompare(b),
  );
  const combined =
    currencies.length > 1
      ? combineInBase(
          currencies.map((c) => ({ currency: c, amount: totals.get(c) ?? 0 })),
          base,
          rates,
          today,
        )
      : null;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Счета"
        description="Каждый счёт хранит деньги в своей валюте: на долларовом — доллары. Общий итог считается по курсу ЦБ."
        actions={
          <Button asChild>
            <Link href="/accounts/new">
              <Plus /> Новый счёт
            </Link>
          </Button>
        }
      />

      {combined?.total ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border bg-card px-5 py-4">
          <span className="text-sm text-muted-foreground">Всего на всех счетах</span>
          <span className="grid justify-items-end">
            <span className="text-xl font-semibold tracking-tight">
              ≈ <Money amount={toMoneyString(combined.total)} currency={base} />
            </span>
            {combined.oldestRateDate ? (
              <span className="text-[13px] text-muted-foreground">по курсу ЦБ на {formatLocalDate(combined.oldestRateDate, undefined, { day: "numeric", month: "long" })}</span>
            ) : null}
          </span>
        </div>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Счетов пока нет"
          description="Добавьте карты, наличные и накопления, которые хотите отслеживать: например Uzcard, Visa, наличные в сумах."
          action={
            <Button asChild>
              <Link href="/accounts/new">Добавить счёт</Link>
            </Button>
          }
        />
      ) : (
        currencies.map((currency) => {
          const total = totals.get(currency);
          return (
            <section key={currency} className="grid gap-3" aria-labelledby={`cur-${currency}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`cur-${currency}`} className="text-sm font-medium text-muted-foreground">
                  {currency}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Всего{" "}
                  <Money amount={total ? toMoneyString(total) : "0"} currency={currency} className="font-semibold text-foreground" />
                  {(() => {
                    const eq = total ? inBase(toMoneyString(total), currency) : null;
                    return eq ? (
                      <>
                        {" "}
                        ≈ <Money amount={eq.amount} currency={eq.currency} />
                      </>
                    ) : null;
                  })()}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active
                  .filter((a) => a.currency === currency)
                  .map((account) => (
                    <AccountCard key={account.id} account={account} equivalent={inBase(account.currentBalance, account.currency)} />
                  ))}
              </div>
            </section>
          );
        })
      )}

      {sharedWithMe.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="shared-with-me">
          <h2 id="shared-with-me" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Users className="size-4" aria-hidden /> Общие со мной
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sharedWithMe.map((s) => (
              <Link key={s.shareId} href={`/shared/${s.account.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
                <span className="grid size-10 place-items-center rounded-full bg-primary-subtle text-primary">
                  <Users className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.account.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">владелец {s.owner.name}</span>
                  <Money amount={s.account.currentBalance} currency={s.account.currency} className="text-base font-semibold" />
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {archived.length > 0 ? (
        <section className="grid gap-3">
          <Link href={showArchived ? "/accounts" : "/accounts?archived=1"} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            {showArchived ? "Скрыть" : "Показать"} счета в архиве ({archived.length})
          </Link>
          {showArchived ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archived.map((account) => (
                <AccountCard key={account.id} account={account} equivalent={inBase(account.currentBalance, account.currency)} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
