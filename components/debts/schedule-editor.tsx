"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { replaceScheduleAction } from "@/app/(app)/debts/actions";
import { Money } from "@/components/finance/money";
import { MoneyInput } from "@/components/finance/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Segmented } from "@/components/ui/segmented";
import { addMonthsClamped } from "@/lib/finance/dates";
import { formatMoney, money, parseMoneyInput, toMoneyString } from "@/lib/finance/money";
import type { ScheduleItemDTO } from "@/lib/services/debts";

type Row = { dueDate: string; principal: string; interest: string; fees: string };
const plain = (v: string) => formatMoney(v, "", { hideCurrency: true });

/**
 * Replace the open part of the schedule — typed by hand or copied from the
 * bank (SPEC §17). Paid lines are never touched; a new version is created.
 */
export function ScheduleEditor({
  debtId,
  currency,
  openItems,
  principalToPlan,
}: {
  debtId: string;
  currency: string;
  openItems: ScheduleItemDTO[];
  principalToPlan: string;
}) {
  const router = useRouter();
  const initialRows = (): Row[] =>
    openItems.map((i) => ({ dueDate: i.dueDate, principal: plain(i.plannedPrincipal), interest: plain(i.plannedInterest), fees: plain(i.plannedFees) }));
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [reason, setReason] = useState<"BANK_IMPORT" | "MANUAL_EDIT">("BANK_IMPORT");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = rows.reduce((s, r) => s.plus(parseMoneyInput(r.principal) ?? 0), money(0));
  const difference = money(principalToPlan).minus(total);

  const update = (index: number, key: keyof Row, value: string) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  const addRow = () =>
    setRows((rs) => {
      const last = rs.at(-1);
      return [...rs, { dueDate: last ? addMonthsClamped(last.dueDate, 1) : "", principal: "", interest: "0", fees: "0" }];
    });

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await replaceScheduleAction({
        debtId,
        reason,
        lines: rows.map((r) => ({ dueDate: r.dueDate, principal: r.principal || "0", interest: r.interest, fees: r.fees })),
      });
      if (!result.ok) return setError(result.error);
      toast.success("Schedule updated — previous version kept in history");
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setRows(initialRows());
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil /> Edit schedule
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit remaining schedule"
        description="Paid installments stay as they are. Saving creates a new schedule version; earlier versions remain viewable."
      >
        <div className="grid gap-4">
          <Segmented
            label="Source"
            value={reason}
            onChange={setReason}
            options={[
              { value: "BANK_IMPORT", label: "Bank's schedule" },
              { value: "MANUAL_EDIT", label: "Manual edit" },
            ]}
          />
          <div className="grid max-h-[45dvh] gap-2 overflow-y-auto pr-1">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] gap-2 text-xs text-muted-foreground">
              <span>Due date</span>
              <span>Principal</span>
              <span>Interest</span>
              <span>Fees</span>
              <span className="sr-only">Remove</span>
            </div>
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] items-center gap-2">
                <Input type="date" aria-label={`Payment ${i + 1} due date`} value={row.dueDate} onChange={(e) => update(i, "dueDate", e.target.value)} className="px-2" />
                <MoneyInput aria-label={`Payment ${i + 1} principal`} value={row.principal} onChange={(v) => update(i, "principal", v)} className="px-2" />
                <MoneyInput aria-label={`Payment ${i + 1} interest`} value={row.interest} onChange={(v) => update(i, "interest", v)} className="px-2" />
                <MoneyInput aria-label={`Payment ${i + 1} fees`} value={row.fees} onChange={(v) => update(i, "fees", v)} className="px-2" />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove payment ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={addRow}>
            <Plus /> Add payment
          </Button>
          <p className="text-sm">
            Principal to schedule <Money amount={principalToPlan} currency={currency} className="font-medium" />
            {difference.isZero() ? (
              <span className="ml-2 text-success">✓ adds up</span>
            ) : (
              <span className="ml-2 text-danger">
                {difference.gt(0) ? "missing" : "over by"} <Money amount={toMoneyString(difference.abs())} currency={currency} />
              </span>
            )}
          </p>
          {error ? <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</p> : null}
          <Button onClick={save} disabled={pending || !difference.isZero() || rows.length === 0}>
            {pending ? "Saving…" : "Save as new version"}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
