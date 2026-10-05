"use client";
import { ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { formatPhone, normalizePhone } from "@/lib/auth/phone";

type Mode = "login" | "register";
const RESEND_SECONDS = 60;

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function errorText(error: { status?: number; code?: string; message?: string } | null): string {
  if (!error) return "Не получилось. Попробуйте ещё раз.";
  if (error.status === 429) return "Слишком много попыток. Подождите минуту.";
  switch (error.code) {
    case "INVALID_OTP":
      return "Неверный код. Проверьте сообщение от бота.";
    case "OTP_EXPIRED":
      return "Код устарел. Запросите новый.";
    case "OTP_NOT_FOUND":
      return "Сначала запросите код.";
    case "TOO_MANY_ATTEMPTS":
      return "Слишком много неверных попыток. Запросите новый код.";
    case "INVALID_PHONE_NUMBER":
      return "Проверьте номер телефона.";
    default:
      return "Не получилось войти. Если аккаунта с этим номером нет, зарегистрируйтесь.";
  }
}

/**
 * Sign-in / sign-up by phone number. The code comes from the Fyndue Telegram
 * bot: if the number was never confirmed there, the user opens the bot,
 * shares their contact, and the waiting code arrives right away.
 */
export function PhoneAuthForm({ mode, botUsername, emailHref }: { mode: Mode; botUsername: string; emailHref?: string }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [name, setName] = useState("");
  const [phoneInput, setPhoneInput] = useState("+998 ");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();
  const botLink = `https://t.me/${botUsername}?start=login`;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = (number: string) =>
    startTransition(async () => {
      setError(null);
      const { error: e } = await authClient.phoneNumber.sendOtp({ phoneNumber: number });
      if (e) return setError(errorText(e));
      setPhone(number);
      setStep("code");
      setCooldown(RESEND_SECONDS);
    });

  const submitPhone = () => {
    if (mode === "register" && name.trim().length < 2) return setError("Как вас зовут?");
    const number = normalizePhone(phoneInput);
    if (!number) return setError("Введите номер, например +998 90 123 45 67.");
    requestCode(number);
  };

  const verify = () =>
    startTransition(async () => {
      setError(null);
      const { data, error: e } = await authClient.phoneNumber.verify({ phoneNumber: phone, code: code.trim() });
      if (e || !data) return setError(errorText(e));
      // New phone accounts start with the number as their name.
      if (mode === "register" && name.trim()) await authClient.updateUser({ name: name.trim().slice(0, 60) });
      router.replace(next);
      router.refresh();
    });

  return (
    <Card className="grid gap-6 p-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{mode === "login" ? "Войти" : "Создайте аккаунт"}</h1>
        <p className="text-sm text-muted-foreground">
          {step === "phone"
            ? mode === "login"
              ? "По номеру телефона — код придёт в Telegram."
              : "Нужен только номер телефона — код придёт в Telegram."
            : `Код отправлен в Telegram для ${formatPhone(phone)}.`}
        </p>
      </div>

      {step === "phone" ? (
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitPhone();
          }}
        >
          {mode === "register" ? (
            <Field label="Имя" htmlFor="name">
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
          ) : null}
          <Field label="Номер телефона" htmlFor="phone">
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} autoFocus={mode === "login"} />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Отправляем…" : "Получить код"}
          </Button>
        </form>
      ) : (
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <div className="grid gap-3 rounded-xl border bg-primary-subtle/50 p-4 text-sm">
            <p>
              Код пришёл в чат с ботом <b>@{botUsername}</b>.
            </p>
            <p className="text-muted-foreground">
              Не пришёл? Если входите впервые, откройте бота и нажмите <b>«📱 Поделиться номером»</b> — код придёт сразу.
            </p>
            <Button asChild variant="outline" className="w-full bg-card">
              <a href={botLink} target="_blank" rel="noopener">
                <Send /> Открыть @{botUsername} <ExternalLink className="ml-auto" />
              </a>
            </Button>
          </div>
          <Field label="Код из Telegram" htmlFor="code">
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-lg tracking-[.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending || code.length < 6}>
            {pending ? "Проверяем…" : mode === "login" ? "Войти" : "Создать аккаунт"}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => (setStep("phone"), setCode(""), setError(null))}>
              Изменить номер
            </button>
            <button type="button" className="font-medium text-primary disabled:text-muted-foreground" disabled={cooldown > 0 || pending} onClick={() => requestCode(phone)}>
              {cooldown > 0 ? `Ещё раз через ${cooldown} с` : "Отправить код ещё раз"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-2 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <p>
            Впервые в Fyndue?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Создать аккаунт
            </Link>
          </p>
        ) : (
          <p>
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Войти
            </Link>
          </p>
        )}
        {emailHref ? (
          <Link href={emailHref} className="hover:text-foreground hover:underline">
            Войти по email и паролю
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
