import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/finance/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="It may have been moved, or it belongs to another account."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to overview</Link>
          </Button>
        }
      />
    </main>
  );
}
