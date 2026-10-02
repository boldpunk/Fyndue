"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateProfileAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { CURRENCIES, CURRENCY_LABELS, TIMEZONES } from "@/lib/constants/finance";
import { profileSchema, type ProfileInput } from "@/lib/validations/settings";

export function ProfileForm({ defaults }: { defaults: ProfileInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, setError, formState } = useForm<ProfileInput>({ defaultValues: defaults });

  const onSubmit = handleSubmit((values) => {
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as keyof ProfileInput, { message: issue.message });
      return;
    }
    startTransition(async () => {
      const result = await updateProfileAction(values);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Профиль сохранён");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <Field label="Имя" htmlFor="name" error={formState.errors.name?.message}>
        <Input id="name" autoComplete="name" {...register("name")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Основная валюта" htmlFor="baseCurrency" hint="Показывается первой в итогах. Другие валюты никогда не пересчитываются.">
          <NativeSelect id="baseCurrency" {...register("baseCurrency")}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} — {CURRENCY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Часовой пояс" htmlFor="timezone" hint="По этому поясу считаются сроки платежей и «сегодня».">
          <NativeSelect id="timezone" {...register("timezone")}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить профиль"}
        </Button>
      </div>
    </form>
  );
}
