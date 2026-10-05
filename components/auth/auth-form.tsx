"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

type Mode = "login" | "register";
type Values = { name: string; email: string; password: string };

/** Only allow same-origin relative redirects after sign-in (no open redirect). */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode, googleEnabled, phoneHref }: { mode: Mode; googleEnabled: boolean; phoneHref?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, setError: setFieldError, formState } = useForm<Values>({
    defaultValues: { name: "", email: "", password: "" },
  });
  const errors = formState.errors;
  const next = safeNext(searchParams.get("next"));

  const onSubmit = handleSubmit((values) => {
    setError(null);
    const schema = mode === "login" ? loginSchema : registerSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setFieldError(issue.path[0] as keyof Values, { message: issue.message });
      }
      return;
    }
    startTransition(async () => {
      const { error: authError } =
        mode === "login"
          ? await authClient.signIn.email({ email: values.email.trim(), password: values.password })
          : await authClient.signUp.email({ name: values.name.trim(), email: values.email.trim(), password: values.password });
      if (authError) {
        setError(
          authError.status === 429
            ? "Слишком много попыток. Подождите минуту и попробуйте снова."
            : mode === "login"
              ? "Неверный email или пароль."
              : (authError.message ?? "Не удалось создать аккаунт."),
        );
        return;
      }
      router.replace(next);
      router.refresh();
    });
  });

  return (
    <Card className="grid gap-6 p-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{mode === "login" ? "Войти" : "Создайте аккаунт"}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "login" ? "С возвращением в Fyndue." : "Начните следить за долгами, расходами и деньгами."}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {mode === "register" ? (
          <Field label="Имя" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="name" aria-invalid={Boolean(errors.name) || undefined} {...register("name")} />
          </Field>
        ) : null}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={Boolean(errors.email) || undefined} {...register("email")} />
        </Field>
        <Field
          label="Пароль"
          htmlFor="password"
          error={errors.password?.message}
          hint={mode === "register" ? "Не меньше 10 символов." : undefined}
        >
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-invalid={Boolean(errors.password) || undefined}
            {...register("password")}
          />
        </Field>

        {error ? (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="mt-1">
          {pending ? "Подождите…" : mode === "login" ? "Войти" : "Создать аккаунт"}
        </Button>
      </form>

      {googleEnabled ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => void (await authClient.signIn.social({ provider: "google", callbackURL: next })))}
        >
          Продолжить с Google
        </Button>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Впервые в Fyndue?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Создать аккаунт
            </Link>
          </>
        ) : (
          <>
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Войти
            </Link>
          </>
        )}
      </p>
      {phoneHref ? (
        <Link href={phoneHref} className="-mt-3 text-center text-sm text-muted-foreground hover:text-foreground hover:underline">
          Войти по номеру телефона
        </Link>
      ) : null}
    </Card>
  );
}
