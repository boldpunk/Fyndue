import type { Metadata } from "next";
import { DebtWizard } from "@/components/debts/debt-wizard";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";

export const metadata: Metadata = { title: "Add debt" };

export default async function NewDebtPage() {
  const user = await requireUser();
  const accounts = (await listAccounts(user.id)).map(({ id, name, currency, currentBalance }) => ({ id, name, currency, currentBalance }));
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <PageHeader title="Add debt" description="A few guided steps. The debt and its schedule are saved together." />
      <DebtWizard accounts={accounts} today={todayIn(user.timezone)} defaultCurrency={user.baseCurrency} />
    </div>
  );
}
