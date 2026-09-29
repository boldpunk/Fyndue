"use client";
import Link from "next/link";
import { useState } from "react";
import { Money } from "@/components/finance/money";
import { PaymentStatusBadge, daysLabel } from "@/components/finance/payment-status-badge";
import type { AccountOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatLocalDate } from "@/lib/finance/dates";
import type { UpcomingPaymentDTO } from "@/lib/services/debts";
import { cn } from "@/lib/utils/cn";
import { RecordPaymentDialog } from "./record-payment-dialog";

/** SPEC §12: debt, lender, amount, due date, days remaining, status, Mark as Paid. */
export function UpcomingPayments({ items, accounts, today }: { items: UpcomingPaymentDTO[]; accounts: AccountOption[]; today: string }) {
  const [paying, setPaying] = useState<UpcomingPaymentDTO | null>(null);
  return (
    <>
      <Card className="divide-y">
        {items.map((item) => (
          <div key={item.id} className={cn("flex flex-wrap items-center gap-3 p-4", item.displayStatus === "OVERDUE" && "bg-danger-subtle/40")}>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <Link href={`/debts/${item.debt.id}?tab=schedule`} className="truncate text-sm font-medium hover:underline">
                {item.debt.name}
              </Link>
              <p className="truncate text-[13px] text-muted-foreground">
                {item.debt.lender ? `${item.debt.lender} · ` : ""}#{item.installmentNumber} · {formatLocalDate(item.dueDate, "en-US", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                {daysLabel(item.days)}
              </p>
            </div>
            <div className="grid justify-items-end gap-1">
              <Money amount={item.remainingTotal} currency={item.debt.currency} className="font-semibold" />
              <PaymentStatusBadge status={item.displayStatus} />
            </div>
            <Button size="sm" variant={item.days <= 0 ? "default" : "outline"} onClick={() => setPaying(item)}>
              Mark as paid
            </Button>
          </div>
        ))}
      </Card>
      {paying ? (
        <RecordPaymentDialog
          open
          onOpenChange={(open) => !open && setPaying(null)}
          debt={{ id: paying.debt.id, name: paying.debt.name, currency: paying.debt.currency, feeMode: paying.debt.feeMode, currentPrincipal: paying.debt.currentPrincipal }}
          item={paying}
          accounts={accounts}
          today={today}
        />
      ) : null}
    </>
  );
}
