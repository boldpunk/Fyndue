import type { Metadata } from "next";
import { ProView } from "@/components/billing/pro-view";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getPlan, getUsage, listMyProPayments } from "@/lib/services/billing";

export const metadata: Metadata = { title: "Fyndue Pro" };

export default async function ProPage({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const user = await requireUser();
  const [plan, usage, payments, { feature }] = await Promise.all([getPlan(user.id), getUsage(user.id), listMyProPayments(user.id), searchParams]);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <ProView
        plan={{ ...plan, until: plan.until?.toISOString() ?? null }}
        usage={usage}
        pending={payments.find((p) => p.status === "PENDING") ?? null}
        paymentDetails={env.PRO_PAYMENT_DETAILS?.split("|").map((l) => l.trim()).filter(Boolean) ?? []}
        contactUrl={env.PRO_CONTACT_URL ?? null}
        reference={user.id.slice(-6).toUpperCase()}
        highlight={feature === "export" ? "export" : null}
      />
    </div>
  );
}
