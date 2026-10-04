import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/finance/money";
import { ConvertAdjustment } from "@/components/transactions/convert-adjustment";
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
import { latestCentralBankRates } from "@/lib/services/central-bank-rates";
import { getTransaction } from "@/lib/services/transactions";
import { money, toMoneyString } from "@/lib/finance/money";

export const metadata: Metadata = { title: "Операция" };

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
  const convertible = t.type === "BALANCE_ADJUSTMENT" && !t.isVoided;
  const [allAccounts, cbuRates] = convertible ? await Promise.all([listAccounts(user.id), latestCentralBankRates()]) : [[], []];
  // Exchange rate of a conversion, as "1 USD = 12 650 UZS".
  const conversionRate =
    t.type === "TRANSFER" && t.counterpart && t.counterpart.currency !== t.currency
      ? t.currency === "UZS"
        ? { unit: t.counterpart.currency, uzs: toMoneyString(money(t.amount).div(t.counterpart.amount)) }
        : t.counterpart.currency === "UZS"
          ? { unit: t.currency, uzs: toMoneyString(money(t.counterpart.amount).div(t.amount)) }
          : null
      : null;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link href="/transactions" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Операции
      </Link>

      <Card>
        <CardContent className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {t.category ? <CategoryIcon icon={t.category.icon} color={t.category.color} size="lg" /> : null}
              <div className="grid gap-1">
                <p className="text-sm text-muted-foreground">
                  {t.type === "TRANSFER" && t.counterpart && t.counterpart.currency !== t.currency ? "Конвертация" : TRANSACTION_TYPE_LABELS[t.type]}
                </p>
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
              {t.isVoided ? <Badge>Аннулирована</Badge> : null}
              {t.status === "EXPECTED" ? <Badge tone="info">Ожидается</Badge> : null}
            </div>
          </div>
          <dl className="divide-y">
            <Row label="Дата">{formatLocalDate(t.date, undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</Row>
            <Row label={t.type === "TRANSFER" ? "Откуда" : "Счёт"}>
              <Link href={`/accounts/${t.account.id}`} className="hover:underline">{t.account.name}</Link>
            </Row>
            {t.counterpart ? (
              <Row label="Куда">
                <Link href={`/accounts/${t.counterpart.accountId}`} className="hover:underline">{t.counterpart.accountName}</Link>
                {t.counterpart.currency !== t.currency ? (
                  <span className="block text-muted-foreground">
                    зачислено <Money amount={t.counterpart.amount} currency={t.counterpart.currency} />
                  </span>
                ) : null}
              </Row>
            ) : null}
            {conversionRate ? (
              <Row label="Курс обмена">
                1 {conversionRate.unit} = <Money amount={conversionRate.uzs} currency="UZS" />
              </Row>
            ) : null}
            {t.debt ? (
              <Row label="Долг">
                <Link href={`/debts/${t.debt.id}?tab=payments`} className="hover:underline">{t.debt.name}</Link>
              </Row>
            ) : null}
            {t.category ? <Row label="Категория">{t.category.name}</Row> : null}
            {t.merchant ? <Row label="Где">{t.merchant}</Row> : null}
            {t.note ? <Row label="Комментарий">{t.note}</Row> : null}
            {t.isVoided && t.voidReason ? <Row label="Причина аннулирования">{t.voidReason}</Row> : null}
          </dl>
          <TransactionDetailActions transaction={t} />
        </CardContent>
      </Card>

      {convertible ? (
        <Card>
          <CardHeader>
            <CardTitle>Это была конвертация?</CardTitle>
          </CardHeader>
          <CardContent>
            <ConvertAdjustment
              transaction={{ id: t.id, amount: t.amount, currency: t.currency, direction: t.direction as "INFLOW" | "OUTFLOW", accountId: t.account.id }}
              accounts={allAccounts.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }))}
              fxRates={Object.fromEntries(cbuRates.map((r) => [r.currency, r.rate]))}
            />
          </CardContent>
        </Card>
      ) : null}

      {t.editable ? (
        <Card>
          <CardHeader>
            <CardTitle>Изменить</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionForm accounts={accounts} categories={categories} today={todayIn(user.timezone)} initial={t} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
