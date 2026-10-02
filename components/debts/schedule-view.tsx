"use client";
import { useState } from "react";
import { Money } from "@/components/finance/money";
import { PaymentStatusBadge, daysLabel } from "@/components/finance/payment-status-badge";
import type { AccountOption } from "@/components/transactions/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLocalDate } from "@/lib/finance/dates";
import { money } from "@/lib/finance/money";
import type { ScheduleItemDTO } from "@/lib/services/debts";
import { cn } from "@/lib/utils/cn";
import { RecordPaymentDialog } from "./record-payment-dialog";
import type { PaymentDebt } from "./types";

/**
 * Repayment schedule (SPEC §20): a table on desktop, expandable cards on
 * phones. `readOnly` is used for historical versions.
 */
export function ScheduleView({
  items,
  debt,
  accounts,
  today,
  readOnly = false,
  feeLabel = "Комиссии",
}: {
  items: ScheduleItemDTO[];
  debt: PaymentDebt;
  accounts: AccountOption[];
  today: string;
  readOnly?: boolean;
  feeLabel?: string;
}) {
  const [paying, setPaying] = useState<ScheduleItemDTO | null>(null);
  const firstOpenId = items.find((i) => i.isOpen)?.id;
  const cur = debt.currency;
  const show = (amount: string) => <Money amount={amount} currency={cur} hideCurrency />;
  const payButton = (item: ScheduleItemDTO, size: "sm" | "default" = "sm") =>
    !readOnly && item.isOpen ? (
      <Button size={size} variant={item.id === firstOpenId ? "default" : "outline"} onClick={() => setPaying(item)}>
        Оплатить
      </Button>
    ) : null;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Repayment schedule in {cur}</caption>
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">#</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Срок</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Остаток до</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Основной долг</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Проценты</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">{feeLabel}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">По графику</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Оплачено</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Остаток после</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Статус</th>
              {!readOnly ? <th scope="col" className="px-3 py-2.5"><span className="sr-only">Действия</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.id} className={cn(item.id === firstOpenId && "bg-primary-subtle/40", !item.isOpen && "text-muted-foreground")}>
                <td className="tabular px-3 py-2.5">{item.installmentNumber}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {formatLocalDate(item.dueDate)}
                  {item.versionNumber ? <span className="ml-1 text-xs text-muted-foreground">v{item.versionNumber}</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right">{show(item.openingPrincipal)}</td>
                <td className="px-3 py-2.5 text-right">{show(item.plannedPrincipal)}</td>
                <td className="px-3 py-2.5 text-right">
                  {show(item.plannedInterest)}
                  {item.isEstimate && money(item.plannedInterest).gt(0) ? <span className="ml-0.5 text-xs text-muted-foreground" title="Оценка">*</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right">{show(item.plannedFees)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-foreground">{show(item.plannedTotal)}</td>
                <td className="px-3 py-2.5 text-right">{money(item.paidTotal).gt(0) ? show(item.paidTotal) : "—"}</td>
                <td className="px-3 py-2.5 text-right">{show(item.closingPrincipal)}</td>
                <td className="px-3 py-2.5">
                  <PaymentStatusBadge status={item.displayStatus} />
                </td>
                {!readOnly ? <td className="px-3 py-2 text-right">{payButton(item)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2 md:hidden" aria-label={`График платежей в ${cur}`}>
        {items.map((item) => (
          <li key={item.id} className={cn("rounded-xl border bg-card", item.id === firstOpenId && "border-primary/40")}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">{item.installmentNumber}</span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm font-medium">{formatLocalDate(item.dueDate)}</span>
                  <span className="text-xs text-muted-foreground">{item.isOpen ? daysLabel(item.days) : "Закрыт"}</span>
                </span>
                <span className="grid justify-items-end gap-1">
                  <Money amount={item.isOpen ? item.remainingTotal : item.plannedTotal} currency={cur} className="text-sm font-semibold" />
                  <PaymentStatusBadge status={item.displayStatus} />
                </span>
              </summary>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t px-3 py-3 text-[13px]">
                <dt className="text-muted-foreground">Остаток до</dt>
                <dd className="text-right">{show(item.openingPrincipal)}</dd>
                <dt className="text-muted-foreground">Основной долг</dt>
                <dd className="text-right">{show(item.plannedPrincipal)}</dd>
                <dt className="text-muted-foreground">Проценты{item.isEstimate && money(item.plannedInterest).gt(0) ? " (estimate)" : ""}</dt>
                <dd className="text-right">{show(item.plannedInterest)}</dd>
                <dt className="text-muted-foreground">{feeLabel}</dt>
                <dd className="text-right">{show(item.plannedFees)}</dd>
                <dt className="text-muted-foreground">Платёж по графику</dt>
                <dd className="text-right font-medium">{show(item.plannedTotal)}</dd>
                <dt className="text-muted-foreground">Фактически оплачено</dt>
                <dd className="text-right">{show(item.paidTotal)}</dd>
                <dt className="text-muted-foreground">Остаток после</dt>
                <dd className="text-right">{show(item.closingPrincipal)}</dd>
              </dl>
              {!readOnly && item.isOpen ? <div className="border-t p-3">{payButton(item, "default")}</div> : null}
            </details>
          </li>
        ))}
      </ul>

      {items.some((i) => i.isEstimate && money(i.plannedInterest).gt(0)) ? (
        <p className="text-xs text-muted-foreground">
          <Badge className="mr-1">*</Badge>
          Проценты рассчитаны примерно по условиям займа. График банка всегда главнее — замените его через «Изменить график».
        </p>
      ) : null}

      <RecordPaymentDialog
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        debt={debt}
        item={paying}
        accounts={accounts}
        today={today}
      />
    </>
  );
}
