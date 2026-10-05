import { Crown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** In place of a Pro-only feature on the Free plan. */
export function ProUpsell({ text }: { text: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-primary/40 bg-primary-subtle/40 p-4">
      <p className="text-sm">{text}</p>
      <Button asChild size="sm">
        <Link href="/pro">
          <Crown /> Fyndue Pro
        </Link>
      </Button>
    </div>
  );
}
