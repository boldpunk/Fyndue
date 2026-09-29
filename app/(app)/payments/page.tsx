import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Payments" };

export default function Page() {
  return (
    <ComingSoon
      title="Payments"
      icon={Receipt}
      phase="Phase 2"
      description="Upcoming, overdue and completed debt payments with one-tap Mark as Paid."
    />
  );
}
