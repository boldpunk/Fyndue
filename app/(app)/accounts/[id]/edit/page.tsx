import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/accounts/account-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { getAccount } from "@/lib/services/accounts";

export const metadata: Metadata = { title: "Изменить счёт" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const account = await getAccount(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <PageHeader title="Изменить счёт" description={account.name} />
      <Card className="p-6">
        <AccountForm account={account} defaultCurrency={account.currency} />
      </Card>
    </div>
  );
}
