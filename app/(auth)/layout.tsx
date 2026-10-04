import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getSession } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh grid-rows-[1fr_auto] justify-items-center bg-background px-4 pt-10 pb-6">
      <div className="grid w-full max-w-sm content-center gap-8">
        <div className="grid justify-items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-muted-foreground">Ни одного пропущенного платежа. Вся картина денег — в одном месте.</p>
        </div>
        {children}
      </div>
      <SiteFooter className="mt-10 w-full max-w-5xl" />
    </main>
  );
}
