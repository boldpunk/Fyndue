import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { QuickAddProvider } from "@/components/layout/quick-add";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([
    listAccounts(user.id),
    listCategories(user.id, { includeSystem: false }),
  ]);

  return (
    <QuickAddProvider
      accounts={accounts.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }))}
      categories={categories.map(({ id, name, type, icon, color }) => ({ id, name, type, icon, color }))}
      today={todayIn(user.timezone)}
    >
      <div className="flex min-h-dvh">
        <AppSidebar user={user} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
            {children}
          </main>
        </div>
      </div>
      <MobileNav user={user} />
    </QuickAddProvider>
  );
}
