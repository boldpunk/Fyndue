import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { env, googleAuthEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  if (!env.ALLOW_REGISTRATION) {
    return <p className="text-center text-sm text-muted-foreground">Registration is currently closed.</p>;
  }
  return (
    <Suspense>
      <AuthForm mode="register" googleEnabled={googleAuthEnabled} />
    </Suspense>
  );
}
