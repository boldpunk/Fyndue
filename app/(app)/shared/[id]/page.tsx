import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedAccountView } from "@/components/accounts/shared-account-view";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { todayIn } from "@/lib/finance/dates";
import { getSharedAccount } from "@/lib/services/shared-accounts";

export const metadata: Metadata = { title: "Общий счёт" };

/** A member's view of an account someone shared with them (lib/services/shared-accounts.ts). */
export default async function SharedAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const shared = await getSharedAccount(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Link href="/accounts" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Счета
      </Link>
      <SharedAccountView shared={shared} today={todayIn(user.timezone)} />
    </div>
  );
}
