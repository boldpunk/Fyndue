import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/finance/money";
import { TransactionDetailActions } from "@/components/transactions/transaction-detail-actions";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants/finance";
import { NotFoundError } from "@/lib/errors";
import { formatLocalDate, todayIn } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { getTransaction } from "@/lib/services/transactions";

export const metadata: Metadata = { title: "Transaction" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTransaction(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [accounts, categories] = t.editable
    ? await Promise.all([listAccounts(user.id), listCategories(user.id, { includeSystem: false })])
    : [[], []];
  const signed = t.type !== "TRANSFER";

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link href="/transactions" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Transactions
      </Link>

      <Card>
        <CardContent className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {t.category ? <CategoryIcon icon={t.category.icon} color={t.category.color} size="lg" /> : null}
              <div className="grid gap-1">
                <p className="text-sm text-muted-foreground">{TRANSACTION_TYPE_LABELS[t.type]}</p>
                <Money
                  amount={signed && t.direction === "OUTFLOW" ? `-${t.amount}` : t.amount}
                  currency={t.currency}
                  signed={signed}
                  tone={t.direction === "INFLOW" && signed ? "positive" : "neutral"}
                  className={t.isVoided ? "text-3xl font-semibold tracking-tight line-through" : "text-3xl font-semibold tracking-tight"}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              {t.isVoided ? <Badge>Voided</Badge> : null}
              {t.status === "EXPECTED" ? <Badge tone="info">Expected</Badge> : null}
            </div>
          </div>
          <dl className="divide-y">
            <Row label="Date">{formatLocalDate(t.date, "en-US", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</Row>
            <Row label={t.type === "TRANSFER" ? "From" : "Account"}>
              <Link href={`/accounts/${t.account.id}`} className="hover:underline">{t.account.name}</Link>
            </Row>
            {t.counterpart ? (
              <Row label="To">
                <Link href={`/accounts/${t.counterpart.accountId}`} className="hover:underline">{t.counterpart.accountName}</Link>
                {t.counterpart.currency !== t.currency ? (
                  <span className="block text-muted-foreground">
                    received <Money amount={t.counterpart.amount} currency={t.counterpart.currency} />
                  </span>
                ) : null}
              </Row>
            ) : null}
            {t.debt ? (
              <Row label="Debt">
                <Link href={`/debts/${t.debt.id}?tab=payments`} className="hover:underline">{t.debt.name}</Link>
              </Row>
            ) : null}
            {t.category ? <Row label="Category">{t.category.name}</Row> : null}
            {t.merchant ? <Row label="Merchant">{t.merchant}</Row> : null}
            {t.note ? <Row label="Note">{t.note}</Row> : null}
            {t.isVoided && t.voidReason ? <Row label="Void reason">{t.voidReason}</Row> : null}
          </dl>
          <TransactionDetailActions transaction={t} />
        </CardContent>
      </Card>

      {t.editable ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionForm accounts={accounts} categories={categories} today={todayIn(user.timezone)} initial={t} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
