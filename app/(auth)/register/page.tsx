import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { env, googleAuthEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Регистрация" };

export default function RegisterPage() {
  if (!env.ALLOW_REGISTRATION) {
    return <p className="text-center text-sm text-muted-foreground">Регистрация сейчас закрыта.</p>;
  }
  return (
    <Suspense>
      <AuthForm mode="register" googleEnabled={googleAuthEnabled} />
    </Suspense>
  );
}
