import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryManager } from "@/components/categories/category-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";
import { listCategories } from "@/lib/services/categories";

export const metadata: Metadata = { title: "Категории" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const categories = await listCategories(user.id, { includeArchived: true });
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Настройки
      </Link>
      <PageHeader title="Категории" description="Переименовывайте, меняйте порядок и цвет, убирайте в архив. Категории в архиве сохраняют историю." />
      <CategoryManager categories={categories} />
    </div>
  );
}
