import { ArrowLeftRight, Landmark, Scale } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/finance/money";
import { Badge } from "@/components/ui/badge";
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants/finance";
import { formatLocalDate } from "@/lib/finance/dates";
import type { TransactionDTO } from "@/lib/services/transactions";
import { cn } from "@/lib/utils/cn";

function describe(t: TransactionDTO, perspectiveAccountId?: string) {
  if (t.type === "TRANSFER") {
    const incoming = perspectiveAccountId ? t.direction === "INFLOW" : false;
    return incoming ? `Перевод со счёта ${t.counterpart?.accountName ?? ""}` : `Перевод на счёт ${t.counterpart?.accountName ?? ""}`;
  }
  if (t.type === "EXPENSE" || t.type === "INCOME") return t.merchant ?? t.category?.name ?? TRANSACTION_TYPE_LABELS[t.type];
  if (t.debt) return t.type === "LOAN_DISBURSEMENT" ? `${t.debt.name} · получен заём` : t.debt.name;
  return TRANSACTION_TYPE_LABELS[t.type];
}

function RowIcon({ t }: { t: TransactionDTO }) {
  if (t.category && t.type !== "DEBT_PAYMENT") return <CategoryIcon icon={t.category.icon} color={t.category.color} />;
  const Icon = t.type === "TRANSFER" ? ArrowLeftRight : t.type === "BALANCE_ADJUSTMENT" ? Scale : Landmark;
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
      <Icon className="size-4" />
    </span>
  );
}

/**
 * One transaction. `perspectiveAccountId` shows a transfer from that
 * account's point of view (incoming vs outgoing).
 */
export function TransactionRow({
  transaction: t,
  perspectiveAccountId,
  showDate = true,
}: {
  transaction: TransactionDTO;
  perspectiveAccountId?: string;
  showDate?: boolean;
}) {
  const isTransferView = t.type === "TRANSFER" && !perspectiveAccountId;
  const sign = isTransferView ? undefined : t.direction === "INFLOW" ? "+" : "-";
  const secondary = [
    t.type === "EXPENSE" || t.type === "INCOME" ? (t.merchant ? t.category?.name : null) : t.debt ? TRANSACTION_TYPE_LABELS[t.type] : null,
    t.account.name,
    showDate ? formatLocalDate(t.date, undefined, { day: "numeric", month: "short" }) : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/transactions/${t.id}`}
      className={cn("flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/70", t.isVoided && "opacity-60")}
    >
      <RowIcon t={t} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate text-sm font-medium">{describe(t, perspectiveAccountId)}</p>
        <p className="truncate text-[13px] text-muted-foreground">{secondary.join(" · ")}</p>
      </div>
      <div className="grid justify-items-end gap-1">
        <Money
          amount={sign === "-" ? `-${t.amount}` : t.amount}
          currency={t.currency}
          signed={sign !== undefined}
          tone={t.status === "EXPECTED" ? "muted" : sign === "+" ? "positive" : "neutral"}
          className={cn("text-sm font-medium", t.isVoided && "line-through")}
        />
        {t.status === "EXPECTED" ? <Badge tone="info">Expected</Badge> : null}
        {t.isVoided ? <Badge>Voided</Badge> : null}
      </div>
    </Link>
  );
}
