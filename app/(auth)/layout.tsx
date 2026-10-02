import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { getSession } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="grid w-full max-w-sm gap-8">
        <div className="grid justify-items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-muted-foreground">Ни одного пропущенного платежа. Вся картина денег — в одном месте.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
