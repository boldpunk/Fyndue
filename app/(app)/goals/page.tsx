import type { Metadata } from "next";
import { GoalsView } from "@/components/goals/goals-view";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/accounts";
import { listGoals } from "@/lib/services/goals";

export const metadata: Metadata = { title: "Цели" };

export default async function GoalsPage() {
  const user = await requireUser();
  const [{ goals }, accounts] = await Promise.all([listGoals(user.id), listAccounts(user.id)]);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <GoalsView goals={goals} accounts={accounts.map(({ id, name, currency }) => ({ id, name, currency }))} baseCurrency={user.baseCurrency} />
    </div>
  );
}
