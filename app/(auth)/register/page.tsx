import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { env, googleAuthEnabled, phoneAuthEnabled } from "@/lib/env";
import { botUsername } from "@/lib/telegram/server";

export const metadata: Metadata = { title: "Регистрация" };

export default function RegisterPage() {
  const bot = botUsername();
  if (phoneAuthEnabled && bot && env.ALLOW_PHONE_SIGNUP) {
    return (
      <Suspense>
        <PhoneAuthForm mode="register" botUsername={bot} />
      </Suspense>
    );
  }
  if (!env.ALLOW_REGISTRATION) {
    return <p className="text-center text-sm text-muted-foreground">Регистрация сейчас закрыта.</p>;
  }
  return (
    <Suspense>
      <AuthForm mode="register" googleEnabled={googleAuthEnabled} />
    </Suspense>
  );
}
