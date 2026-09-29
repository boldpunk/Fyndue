import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return (
    <ComingSoon
      title="Calendar"
      icon={CalendarDays}
      phase="Phase 4"
      description="Month and timeline views of payments, expected income and recurring expenses."
    />
  );
}
