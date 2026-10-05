import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { QuickAddProvider } from "@/components/layout/quick-add";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { listMerchantMemory } from "@/lib/services/transactions";
import { latestCentralBankRates, refreshCentralBankRates } from "@/lib/services/central-bank-rates";
import { after } from "next/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [accounts, categories, cbuRates, merchants] = await Promise.all([
    listAccounts(user.id),
    listCategories(user.id, { includeSystem: false }),
    latestCentralBankRates(),
    listMerchantMemory(user.id),
  ]);
  // Today's official rates are fetched after the page is sent; a no-op once stored.
  after(() => refreshCentralBankRates());

  return (
    <QuickAddProvider
      accounts={accounts.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }))}
      categories={categories.map(({ id, name, type, icon, color }) => ({ id, name, type, icon, color }))}
      today={todayIn(user.timezone)}
      fxRates={Object.fromEntries(cbuRates.map((r) => [r.currency, r.rate]))}
      merchants={merchants}
    >
      <div className="flex min-h-dvh">
        <AppSidebar user={user} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</main>
          <SiteFooter className="mx-auto mt-12 w-full max-w-6xl px-4 pb-28 sm:px-6 lg:px-10 lg:pb-8" />
        </div>
      </div>
      <MobileNav user={user} />
    </QuickAddProvider>
  );
}
