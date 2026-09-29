import { Landmark } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Debts" };

export default function Page() {
  return (
    <ComingSoon
      title="Debts"
      icon={Landmark}
      phase="Phase 2"
      description="Differential, annuity and interest-free schedules, microloans with fees, payment tracking and progress."
    />
  );
}
