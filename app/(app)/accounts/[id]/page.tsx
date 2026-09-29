import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountActions } from "@/components/accounts/account-actions";
import { AccountIcon } from "@/components/accounts/account-card";
import { Money } from "@/components/finance/money";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants/finance";
import { NotFoundError } from "@/lib/errors";
import { todayIn } from "@/lib/finance/dates";
import { getAccount } from "@/lib/services/accounts";
import { listTransactions } from "@/lib/services/transactions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const account = await getAccount(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const transactions = await listTransactions(user.id, { page: 1, account: account.id });

  return (
    <div className="grid gap-6">
      <Link href="/accounts" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Accounts
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <AccountIcon account={account} className="size-12" />
          <div className="grid gap-1">
            <p className="text-sm text-muted-foreground">
              {account.name} · {ACCOUNT_TYPE_LABELS[account.type]}
              {account.bank ? ` · ${account.bank}` : ""}
            </p>
            <Money
              amount={account.currentBalance}
              currency={account.currency}
              tone={account.currentBalance.startsWith("-") ? "negative" : "neutral"}
              className="text-3xl font-semibold tracking-tight"
            />
            <div className="flex flex-wrap gap-1.5">
              <Badge>
                Opening <Money amount={account.openingBalance} currency={account.currency} />
              </Badge>
              {!account.includeInTotal ? <Badge>Excluded from total</Badge> : null}
              {account.isArchived ? <Badge tone="warning">Archived</Badge> : null}
            </div>
          </div>
        </div>
        <AccountActions account={account} today={todayIn(user.timezone)} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          {transactions.total > transactions.items.length ? (
            <Link href={`/transactions?account=${account.id}`} className="text-sm font-medium text-primary hover:underline">
              View all {transactions.total}
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-0.5 pt-3">
          {transactions.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No transactions on this account yet.</p>
          ) : (
            transactions.items.map((t) => <TransactionRow key={t.id} transaction={t} perspectiveAccountId={account.id} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
