import { Plus, Wallet } from "lucide-react";
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

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const user = await requireUser();
  const showArchived = (await searchParams).archived === "1";
  const accounts = await listAccounts(user.id, { includeArchived: true });
  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);
  const totals = totalsByCurrency(active);
  const currencies = [...new Set(active.map((a) => a.currency))].sort((a, b) =>
    a === user.baseCurrency ? -1 : b === user.baseCurrency ? 1 : a.localeCompare(b),
  );

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Accounts"
        description="Balances are totalled per currency and never mixed."
        actions={
          <Button asChild>
            <Link href="/accounts/new">
              <Plus /> New account
            </Link>
          </Button>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add the cards, cash and savings you want Fyndue to track — e.g. Uzcard, Visa, Cash UZS."
          action={
            <Button asChild>
              <Link href="/accounts/new">Add account</Link>
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
                  Total{" "}
                  <Money amount={total ? toMoneyString(total) : "0"} currency={currency} className="font-semibold text-foreground" />
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active
                  .filter((a) => a.currency === currency)
                  .map((account) => (
                    <AccountCard key={account.id} account={account} />
                  ))}
              </div>
            </section>
          );
        })
      )}

      {archived.length > 0 ? (
        <section className="grid gap-3">
          <Link href={showArchived ? "/accounts" : "/accounts?archived=1"} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            {showArchived ? "Hide" : "Show"} archived accounts ({archived.length})
          </Link>
          {showArchived ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archived.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
