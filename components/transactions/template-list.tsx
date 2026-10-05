"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteTemplateAction } from "@/app/(app)/transactions/template-actions";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/finance/money";
import type { TemplateDTO } from "@/lib/services/templates";
import { toastActionError } from "@/lib/utils/action-toast";

export function TemplateList({
  templates,
  categories,
  accounts,
}: {
  templates: TemplateDTO[];
  categories: { id: string; name: string; icon: string; color: string | null }[];
  accounts: { id: string; name: string; currency: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (templates.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Шаблонов пока нет. Добавьте операцию и отметьте «Запомнить как шаблон» — она появится здесь и в окне добавления.
      </Card>
    );
  }

  const remove = (t: TemplateDTO) =>
    startTransition(async () => {
      const result = await deleteTemplateAction(t.id);
      if (!result.ok) return void toastActionError(result);
      toast.success(`Шаблон «${t.name}» удалён`);
      router.refresh();
    });

  return (
    <Card className="divide-y">
      {templates.map((t) => {
        const category = categories.find((c) => c.id === t.categoryId);
        const account = accounts.find((a) => a.id === t.accountId);
        return (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
            {category ? <CategoryIcon icon={category.icon} color={category.color} /> : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {t.kind === "INCOME" ? "Доход" : "Расход"} · {category?.name}
                {account ? ` · ${account.name}` : ""}
              </div>
            </div>
            {t.amount ? <span className="tabular text-sm">{formatMoney(t.amount, account?.currency ?? "", { hideCurrency: !account })}</span> : null}
            <Button variant="ghost" size="icon-sm" aria-label={`Удалить «${t.name}»`} disabled={pending} onClick={() => remove(t)}>
              <Trash2 />
            </Button>
          </div>
        );
      })}
    </Card>
  );
}
