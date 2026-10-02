import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { TransactionForm, type TransactionKind } from "@/components/transactions/transaction-form";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/finance/dates";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";

export const metadata: Metadata = { title: "Новая операция" };

const KINDS: TransactionKind[] = ["EXPENSE", "INCOME", "TRANSFER"];

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ type?: string; account?: string }> }) {
  const user = await requireUser();
  const { type, account } = await searchParams;
  const kind = KINDS.find((k) => k === type?.toUpperCase()) ?? "EXPENSE";
  const [accounts, categories] = await Promise.all([listAccounts(user.id), listCategories(user.id, { includeSystem: false })]);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <PageHeader title="Новая операция" />
      <Card className="p-6">
        <TransactionForm
          accounts={accounts}
          categories={categories}
          today={todayIn(user.timezone)}
          defaultKind={kind}
          defaultAccountId={accounts.some((a) => a.id === account) ? account : undefined}
        />
      </Card>
    </div>
  );
}
