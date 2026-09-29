import type { Metadata } from "next";
import { AccountForm } from "@/components/accounts/account-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <PageHeader title="New account" description="A card, cash wallet, savings or anything that holds money." />
      <Card className="p-6">
        <AccountForm defaultCurrency={user.baseCurrency} />
      </Card>
    </div>
  );
}
