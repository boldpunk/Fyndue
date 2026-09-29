"use client";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Lock, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  archiveCategoryAction,
  createCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from "@/app/(app)/settings/categories/actions";
import { CATEGORY_ICON_COMPONENTS, CategoryIcon } from "@/components/finance/category-icon";
import { ColorPicker } from "@/components/finance/color-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Segmented } from "@/components/ui/segmented";
import { CATEGORY_ICONS, type CategoryColor, type CategoryIconKey } from "@/lib/constants/categories";
import type { CategoryDTO } from "@/lib/services/categories";
import { cn } from "@/lib/utils/cn";

type Draft = { id?: string; name: string; icon: CategoryIconKey; color: CategoryColor | undefined };

function CategoryEditor({ draft, type, onDone }: { draft: Draft; type: "EXPENSE" | "INCOME"; onDone: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = value.id
        ? await updateCategoryAction({ id: value.id, name: value.name, icon: value.icon, color: value.color })
        : await createCategoryAction({ name: value.name, icon: value.icon, color: value.color, type });
      if (!result.ok) return setError(result.fieldErrors?.name ?? result.error);
      toast.success(value.id ? "Category updated" : "Category created");
      router.refresh();
      onDone();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-5"
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={value.icon} color={value.color} size="lg" />
        <Field label="Name" htmlFor="category-name" error={error ?? undefined} className="flex-1">
          <Input id="category-name" value={value.name} maxLength={40} autoFocus onChange={(e) => setValue({ ...value, name: e.target.value })} />
        </Field>
      </div>
      <Field label="Icon" htmlFor="category-icon">
        <div id="category-icon" role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
          {CATEGORY_ICONS.map((key) => {
            const Icon = CATEGORY_ICON_COMPONENTS[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={value.icon === key}
                aria-label={key}
                onClick={() => setValue({ ...value, icon: key })}
                className={cn("grid aspect-square place-items-center rounded-md border", value.icon === key ? "border-primary bg-primary-subtle text-primary" : "border-transparent bg-muted/60 text-muted-foreground")}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Colour" htmlFor="category-color">
        <ColorPicker value={value.color} onChange={(color) => setValue({ ...value, color })} />
      </Field>
      <Button type="submit" disabled={pending || !value.name.trim()}>
        {pending ? "Saving…" : value.id ? "Save" : "Create category"}
      </Button>
    </form>
  );
}

export function CategoryManager({ categories }: { categories: CategoryDTO[] }) {
  const router = useRouter();
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = categories.filter((c) => c.type === type);
  const active = visible.filter((c) => !c.isArchived);
  const archived = visible.filter((c) => c.isArchived);

  const move = (index: number, delta: -1 | 1) => {
    const ids = active.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    startTransition(async () => {
      const result = await reorderCategoriesAction({ type, orderedIds: ids });
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  };

  const archive = (category: CategoryDTO, archivedValue: boolean) =>
    startTransition(async () => {
      const result = await archiveCategoryAction({ id: category.id, archived: archivedValue });
      if (!result.ok) return void toast.error(result.error);
      toast.success(archivedValue ? `“${category.name}” archived` : `“${category.name}” restored`);
      router.refresh();
    });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Category type"
          value={type}
          onChange={setType}
          options={[
            { value: "EXPENSE", label: "Expenses" },
            { value: "INCOME", label: "Income" },
          ]}
          className="w-full sm:w-64"
        />
        <Button onClick={() => setEditing({ name: "", icon: "circle-dashed", color: "indigo" })}>
          <Plus /> New category
        </Button>
      </div>

      <Card className={cn("divide-y", pending && "opacity-70")}>
        {active.map((category, index) => (
          <div key={category.id} className="flex items-center gap-3 px-3 py-2.5">
            <CategoryIcon icon={category.icon} color={category.color} />
            <span className="flex-1 truncate text-sm font-medium">{category.name}</span>
            {category.isSystem ? (
              <Badge>
                <Lock /> System
              </Badge>
            ) : null}
            <div className="flex items-center">
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${category.name} up`} disabled={index === 0 || pending} onClick={() => move(index, -1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${category.name} down`} disabled={index === active.length - 1 || pending} onClick={() => move(index, 1)}>
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${category.name}`}
                onClick={() => setEditing({ id: category.id, name: category.name, icon: category.icon as CategoryIconKey, color: (category.color ?? undefined) as CategoryColor | undefined })}
              >
                <Pencil />
              </Button>
              {!category.isSystem ? (
                <Button variant="ghost" size="icon-sm" aria-label={`Archive ${category.name}`} disabled={pending} onClick={() => archive(category, true)}>
                  <Archive />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </Card>

      {archived.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
          <Card className="divide-y">
            {archived.map((category) => (
              <div key={category.id} className="flex items-center gap-3 px-3 py-2.5 opacity-70">
                <CategoryIcon icon={category.icon} color={category.color} />
                <span className="flex-1 truncate text-sm">{category.name}</span>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => archive(category, false)}>
                  <ArchiveRestore /> Restore
                </Button>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <ResponsiveDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing?.id ? "Edit category" : "New category"}>
        {editing ? <CategoryEditor key={editing.id ?? "new"} draft={editing} type={type} onDone={() => setEditing(null)} /> : null}
      </ResponsiveDialog>
    </div>
  );
}
