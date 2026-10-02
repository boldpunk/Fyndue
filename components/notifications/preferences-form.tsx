"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateNotificationPreferencesAction } from "@/app/(app)/settings/notifications/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { NotificationPreferencesDTO } from "@/lib/services/notifications";
import { cn } from "@/lib/utils/cn";
import { pluralRu } from "@/lib/finance/recurrence";

const DAY_CHOICES = [14, 7, 5, 3, 2, 1];

function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function NotificationPreferencesForm({ defaults }: { defaults: NotificationPreferencesDTO }) {
  const router = useRouter();
  const [v, setV] = useState({ ...defaults, overdueRepeatDays: String(defaults.overdueRepeatDays) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((s) => ({ ...s, [key]: value }));
  const toggleDay = (day: number) =>
    set("notifyDaysBefore", v.notifyDaysBefore.includes(day) ? v.notifyDaysBefore.filter((d) => d !== day) : [...v.notifyDaysBefore, day]);
  const customDays = v.notifyDaysBefore.filter((d) => !DAY_CHOICES.includes(d));

  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await updateNotificationPreferencesAction(v);
      if (!result.ok) return setErrors({ ...(result.fieldErrors ?? {}), form: result.error });
      toast.success("Настройки напоминаний сохранены");
      router.refresh();
    });

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <ToggleRow id="pref-telegram" label="Присылать напоминания в Telegram" checked={v.telegramEnabled} onChange={(x) => set("telegramEnabled", x)} />

      <fieldset className={cn("grid gap-5", !v.telegramEnabled && "opacity-60")} disabled={!v.telegramEnabled}>
        <div className="grid gap-2">
          <span id="pref-days-label" className="text-sm font-medium">
            Напомнить до срока
          </span>
          <div role="group" aria-labelledby="pref-days-label" className="flex flex-wrap gap-2">
            {[...DAY_CHOICES, ...customDays].map((day) => {
              const on = v.notifyDaysBefore.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "border-primary bg-primary-subtle text-primary" : "bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {`за ${day} ${pluralRu(day, ["день", "дня", "дней"])}`}
                </button>
              );
            })}
          </div>
          {errors.notifyDaysBefore ? (
            <p role="alert" className="text-[13px] text-danger">
              {errors.notifyDaysBefore}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {v.notifyDaysBefore.length ? "Одно сообщение на каждый срок, даже если в какой-то день напоминание не сработало." : "Без напоминаний до срока."}
            </p>
          )}
        </div>

        <ToggleRow id="pref-today" label="В день платежа" checked={v.notifyOnDueDate} onChange={(x) => set("notifyOnDueDate", x)} />
        <ToggleRow id="pref-overdue" label="Когда платёж просрочен" checked={v.notifyWhenOverdue} onChange={(x) => set("notifyWhenOverdue", x)} />
        {v.notifyWhenOverdue ? (
          <Field label="Повторять при просрочке каждые" htmlFor="pref-repeat" error={errors.overdueRepeatDays} hint="Дней. Первое напоминание — на следующий день после срока." className="max-w-56">
            <Input id="pref-repeat" inputMode="numeric" value={v.overdueRepeatDays} onChange={(e) => set("overdueRepeatDays", e.target.value)} />
          </Field>
        ) : null}

        <ToggleRow
          id="pref-quiet"
          label="Тихие часы"
          hint="Напоминания, выпавшие на тихие часы, придут после их окончания."
          checked={v.quietHoursEnabled}
          onChange={(x) => set("quietHoursEnabled", x)}
        />
        {v.quietHoursEnabled ? (
          <div className="grid max-w-80 grid-cols-2 gap-3">
            <Field label="С" htmlFor="pref-quiet-start" error={errors.quietHoursStart}>
              <Input id="pref-quiet-start" type="time" value={v.quietHoursStart} onChange={(e) => set("quietHoursStart", e.target.value)} />
            </Field>
            <Field label="До" htmlFor="pref-quiet-end" error={errors.quietHoursEnd}>
              <Input id="pref-quiet-end" type="time" value={v.quietHoursEnd} onChange={(e) => set("quietHoursEnd", e.target.value)} />
            </Field>
          </div>
        ) : null}
      </fieldset>

      {errors.form ? (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </form>
  );
}
