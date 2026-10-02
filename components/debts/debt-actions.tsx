"use client";
import { CheckCircle2, TrendingDown } from "lucide-react";
import { useState } from "react";
import type { AccountOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { EarlyRepaymentDialog } from "./early-repayment-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";
import type { PaymentDebt, PaymentItem } from "./types";

export function DebtActions({
  debt,
  nextItem,
  accounts,
  today,
  canPay,
}: {
  debt: PaymentDebt;
  nextItem: PaymentItem | null;
  accounts: AccountOption[];
  today: string;
  canPay: boolean;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  if (!canPay) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {nextItem ? (
        <Button onClick={() => setPayOpen(true)}>
          <CheckCircle2 /> Оплатить следующий
        </Button>
      ) : null}
      <Button variant="outline" onClick={() => setExtraOpen(true)}>
        <TrendingDown /> Досрочный платёж
      </Button>
      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} debt={debt} item={nextItem} accounts={accounts} today={today} />
      <EarlyRepaymentDialog open={extraOpen} onOpenChange={setExtraOpen} debt={debt} accounts={accounts} today={today} />
    </div>
  );
}
