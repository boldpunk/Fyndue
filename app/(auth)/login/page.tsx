import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { googleAuthEnabled, phoneAuthEnabled } from "@/lib/env";
import { botUsername } from "@/lib/telegram/server";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ method?: string }> }) {
  const bot = botUsername();
  const byPhone = phoneAuthEnabled && bot && (await searchParams).method !== "email";
  return (
    <Suspense>
      {byPhone ? (
        <PhoneAuthForm mode="login" botUsername={bot} emailHref="/login?method=email" />
      ) : (
        <AuthForm mode="login" googleEnabled={googleAuthEnabled} phoneHref={phoneAuthEnabled && bot ? "/login" : undefined} />
      )}
    </Suspense>
  );
}
