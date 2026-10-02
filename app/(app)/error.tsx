"use client";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/finance/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Что-то пошло не так"
      description="Ваши данные в безопасности. Попробуйте ещё раз, а если ошибка повторится — перезагрузите страницу."
      action={<Button onClick={reset}>Попробовать снова</Button>}
    />
  );
}
