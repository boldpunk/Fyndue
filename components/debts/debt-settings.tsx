"use client";
import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveDebtAction, updateDebtAction } from "@/app/(app)/debts/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

export function DebtSettings({
  debt,
}: {
  debt: { id: string; name: string; lender: string | null; notes: string | null; status: "ACTIVE" | "PAID_OFF" | "ARCHIVED" };
}) {
  const router = useRouter();
  const [name, setName] = useState(debt.name);
  const [lender, setLender] = useState(debt.lender ?? "");
  const [notes, setNotes] = useState(debt.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await updateDebtAction({ id: debt.id, name, lender, notes });
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success("Debt updated");
      router.refresh();
    });

  const toggleArchive = () =>
    startTransition(async () => {
      const archived = debt.status !== "ARCHIVED";
      const result = await archiveDebtAction({ id: debt.id, archived });
      if (!result.ok) return void toast.error(result.error);
      toast.success(archived ? "Debt archived" : "Debt restored");
      router.refresh();
    });

  return (
    <div className="grid gap-8">
      <form
        className="grid max-w-xl gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" htmlFor="debt-name" error={errors.name}>
          <Input id="debt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Lender" htmlFor="debt-lender" error={errors.lender}>
          <Input id="debt-lender" value={lender} onChange={(e) => setLender(e.target.value)} maxLength={80} placeholder="Optional" />
        </Field>
        <Field label="Notes" htmlFor="debt-notes" error={errors.notes}>
          <Textarea id="debt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} />
        </Field>
        {errors.form ? <p role="alert" className="text-sm text-danger">{errors.form}</p> : null}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <div className="grid max-w-xl gap-2 rounded-xl border p-4">
        <p className="text-sm font-medium">{debt.status === "ARCHIVED" ? "Restore this debt" : "Archive this debt"}</p>
        <p className="text-[13px] text-muted-foreground">
          {debt.status === "ARCHIVED"
            ? "It returns to your active or paid-off debts."
            : "Hides it from active debts and reminders. Its schedule, payments and history are kept."}
        </p>
        <div>
          <Button variant="outline" onClick={toggleArchive} disabled={pending}>
            {debt.status === "ARCHIVED" ? <ArchiveRestore /> : <Archive />}
            {debt.status === "ARCHIVED" ? "Restore" : "Archive"}
          </Button>
        </div>
      </div>
    </div>
  );
}
