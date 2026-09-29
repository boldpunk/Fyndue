"use client";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/finance/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description="Your data is safe. Try again, and if it keeps happening, reload the page."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
