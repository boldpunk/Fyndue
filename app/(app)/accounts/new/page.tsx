import type { Metadata } from "next";
import { AccountForm } from "@/components/accounts/account-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Новый счёт" };

export default async function NewAccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <PageHeader title="Новый счёт" description="Карта, наличные, накопления — всё, где лежат деньги." />
      <Card className="p-6">
        <AccountForm defaultCurrency={user.baseCurrency} />
      </Card>
    </div>
  );
}
