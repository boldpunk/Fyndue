import { PiggyBank } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Budgets" };

export default function Page() {
  return (
    <ComingSoon
      title="Budgets"
      icon={PiggyBank}
      phase="Phase 4"
      description="Monthly overall and per-category budgets."
    />
  );
}
