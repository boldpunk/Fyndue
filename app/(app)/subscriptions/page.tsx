import type { Metadata } from "next";
import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { latestCentralBankRates } from "@/lib/services/central-bank-rates";
import { getSubscriptions } from "@/lib/services/subscriptions";

export const metadata: Metadata = { title: "Подписки" };

export default async function SubscriptionsPage() {
  const user = await requireUser();
  const [data, accounts, categories, cbuRates] = await Promise.all([
    getSubscriptions(user.id),
    listAccounts(user.id),
    listCategories(user.id, { includeSystem: false }),
    latestCentralBankRates(),
  ]);
  const expense = categories.filter((c) => c.type === "EXPENSE");
  const defaultCategoryId = (expense.find((c) => c.name === "Подписки") ?? expense[0])?.id ?? "";

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <SubscriptionsView
        data={data}
        accounts={accounts.map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }))}
        categories={categories.map(({ id, name, type, icon, color, parentId }) => ({ id, name, type, icon, color, parentId }))}
        defaultCategoryId={defaultCategoryId}
        fxRates={Object.fromEntries(cbuRates.map((r) => [r.currency, r.rate]))}
      />
    </div>
  );
}
