import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <ComingSoon
      title="Analytics"
      icon={BarChart3}
      phase="Phase 4"
      description="Spending by category, income vs expenses, debt cost and cash flow."
    />
  );
}
