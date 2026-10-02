import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/finance/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
      <EmptyState
        icon={SearchX}
        title="Страница не найдена"
        description="Возможно, её перенесли или она относится к другому аккаунту."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Вернуться к обзору</Link>
          </Button>
        }
      />
    </main>
  );
}
