"use client";
import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveDebtAction, setDebtWeekendShiftAction, updateDebtAction } from "@/app/(app)/debts/actions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

export function DebtSettings({
  debt,
}: {
  debt: { id: string; name: string; lender: string | null; notes: string | null; status: "ACTIVE" | "PAID_OFF" | "ARCHIVED"; shiftWeekends: boolean };
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
      toast.success("Долг обновлён");
      router.refresh();
    });

  const toggleWeekendShift = (on: boolean) =>
    startTransition(async () => {
      const result = await setDebtWeekendShiftAction({ id: debt.id, shiftWeekends: on });
      if (!result.ok) return void toast.error(result.error);
      const moved = result.data.moved;
      toast.success(
        on
          ? moved
            ? `Перенесено платежей: ${moved}. График обновлён новой версией.`
            : "Включено. Сейчас ни один платёж не выпадает на выходной."
          : moved
            ? "Платежи возвращены на даты по договору."
            : "Выключено.",
      );
      router.refresh();
    });

  const toggleArchive = () =>
    startTransition(async () => {
      const archived = debt.status !== "ARCHIVED";
      const result = await archiveDebtAction({ id: debt.id, archived });
      if (!result.ok) return void toast.error(result.error);
      toast.success(archived ? "Долг перенесён в архив" : "Долг восстановлен");
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
        <Field label="Название" htmlFor="debt-name" error={errors.name}>
          <Input id="debt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Кредитор" htmlFor="debt-lender" error={errors.lender}>
          <Input id="debt-lender" value={lender} onChange={(e) => setLender(e.target.value)} maxLength={80} placeholder="Необязательно" />
        </Field>
        <Field label="Заметки" htmlFor="debt-notes" error={errors.notes}>
          <Textarea id="debt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} />
        </Field>
        {errors.form ? <p role="alert" className="text-sm text-danger">{errors.form}</p> : null}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </form>

      <label className="flex max-w-xl items-start justify-between gap-4 rounded-xl border p-4">
        <span className="grid gap-1">
          <span className="text-sm font-medium">Переносить платёж с выходных и праздников</span>
          <span className="text-[13px] text-muted-foreground">
            Как в банке: платёж на субботу, воскресенье или праздник переносится на следующий рабочий день, а проценты за эти дни добавляются к следующему платежу. Меняются только неоплаченные платежи; старый график сохранится в истории версий.
          </span>
        </span>
        <Switch checked={debt.shiftWeekends} onCheckedChange={toggleWeekendShift} disabled={pending} aria-label="Переносить платёж с выходных и праздников" />
      </label>

      <div className="grid max-w-xl gap-2 rounded-xl border p-4">
        <p className="text-sm font-medium">{debt.status === "ARCHIVED" ? "Восстановить долг" : "Перенести долг в архив"}</p>
        <p className="text-[13px] text-muted-foreground">
          {debt.status === "ARCHIVED"
            ? "Он вернётся в активные или погашенные долги."
            : "Скроет его из активных долгов и напоминаний. График, платежи и история сохранятся."}
        </p>
        <div>
          <Button variant="outline" onClick={toggleArchive} disabled={pending}>
            {debt.status === "ARCHIVED" ? <ArchiveRestore /> : <Archive />}
            {debt.status === "ARCHIVED" ? "Восстановить" : "В архив"}
          </Button>
        </div>
      </div>
    </div>
  );
}
