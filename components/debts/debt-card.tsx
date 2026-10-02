import { Car, CreditCard, HandCoins, Home, Landmark, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/finance/money";
import { PaymentStatusBadge, daysLabel } from "@/components/finance/payment-status-badge";
import { ProgressBar } from "@/components/finance/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DEBT_TYPE_LABELS } from "@/lib/constants/debts";
import { formatLocalDate, formatYearMonthLabel, yearMonthOf } from "@/lib/finance/dates";
import type { DebtSummaryDTO } from "@/lib/services/debts";
import { formatPercent } from "@/lib/finance/money";

export const DEBT_TYPE_ICONS: Record<DebtSummaryDTO["type"], LucideIcon> = {
  CREDIT: Landmark,
  CAR_LOAN: Car,
  INSTALLMENT: ReceiptText,
  MICROLOAN: HandCoins,
  CREDIT_CARD: CreditCard,
  MORTGAGE: Home,
  PERSONAL: Wallet,
  OTHER: Wallet,
};

export function DebtIcon({ type, className = "size-10" }: { type: DebtSummaryDTO["type"]; className?: string }) {
  const Icon = DEBT_TYPE_ICONS[type];
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary ${className}`}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

export function DebtCard({ debt }: { debt: DebtSummaryDTO }) {
  return (
    <Link href={`/debts/${debt.id}`} className="group rounded-xl">
      <Card className="grid h-full gap-4 p-5 transition-shadow group-hover:shadow-md">
        <div className="flex items-start gap-3">
          <DebtIcon type={debt.type} />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="truncate font-medium">{debt.name}</p>
            <p className="truncate text-[13px] text-muted-foreground">
              {debt.lender ? `${debt.lender} · ` : ""}
              {DEBT_TYPE_LABELS[debt.type]}
            </p>
          </div>
          {debt.status === "PAID_OFF" ? <Badge tone="success">Погашен</Badge> : null}
        </div>

        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">Осталось выплатить</p>
          <Money amount={debt.currentPrincipal} currency={debt.currency} className="text-xl font-semibold tracking-tight" />
        </div>

        <div className="grid gap-1.5">
          <ProgressBar percent={debt.paidPercent} label={`${debt.name}: выплачено`} tone={debt.status === "PAID_OFF" ? "success" : "primary"} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              выплачено <span className="tabular font-medium text-foreground">{formatPercent(debt.paidPercent)}</span> ·{" "}
              <Money amount={debt.paidPrincipal} currency={debt.currency} />
            </span>
            <span>
              из <Money amount={debt.principalBasis} currency={debt.currency} />
            </span>
          </div>
        </div>

        {debt.nextPayment ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2">
            <div className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">Следующий платёж · {daysLabel(debt.nextPayment.daysUntil)}</span>
              <span className="text-sm">
                <Money amount={debt.nextPayment.amountDue} currency={debt.currency} className="font-semibold" /> —{" "}
                {formatLocalDate(debt.nextPayment.dueDate, undefined, { day: "numeric", month: "short" })}
              </span>
            </div>
            <PaymentStatusBadge status={debt.nextPayment.displayStatus} />
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Оплачено платежей: {debt.paymentsCompleted} · осталось: {debt.paymentsRemaining}
          {debt.projectedPayoffDate ? ` · погашение в ${formatYearMonthLabel(yearMonthOf(debt.projectedPayoffDate)).toLowerCase()}` : ""}
        </p>
      </Card>
    </Link>
  );
}
