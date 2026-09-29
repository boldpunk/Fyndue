import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryManager } from "@/components/categories/category-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";
import { listCategories } from "@/lib/services/categories";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const categories = await listCategories(user.id, { includeArchived: true });
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <PageHeader title="Categories" description="Rename, reorder, recolour or archive. Archived categories keep their history." />
      <CategoryManager categories={categories} />
    </div>
  );
}
