import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateList } from "@/components/transactions/template-list";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/accounts";
import { listCategories } from "@/lib/services/categories";
import { listTemplates } from "@/lib/services/templates";

export const metadata: Metadata = { title: "Шаблоны" };

export default async function TemplatesPage() {
  const user = await requireUser();
  const [templates, categories, accounts] = await Promise.all([listTemplates(user.id), listCategories(user.id), listAccounts(user.id)]);
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <PageHeader
        title="Шаблоны"
        description="Частые операции одним нажатием. Новый шаблон — галочка «Запомнить как шаблон» при добавлении операции."
      />
      <TemplateList
        templates={templates}
        categories={categories.map(({ id, name, icon, color }) => ({ id, name, icon, color }))}
        accounts={accounts.map(({ id, name, currency }) => ({ id, name, currency }))}
      />
    </div>
  );
}
