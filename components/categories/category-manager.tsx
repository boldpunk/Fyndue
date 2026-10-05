"use client";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Lock,
  Pencil,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  archiveCategoryAction,
  createCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from "@/app/(app)/settings/categories/actions";
import {
  CATEGORY_ICON_COMPONENTS,
  CategoryIcon,
} from "@/components/finance/category-icon";
import { ColorPicker } from "@/components/finance/color-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Segmented } from "@/components/ui/segmented";
import {
  CATEGORY_ICONS,
  suggestCategoryIcon,
  type CategoryColor,
  type CategoryIconKey,
} from "@/lib/constants/categories";
import type { CategoryDTO } from "@/lib/services/categories";
import { cn } from "@/lib/utils/cn";
import { orderTree } from "@/lib/categories/tree";
import { toastActionError } from "@/lib/utils/action-toast";

export type CategoryDraft = Draft;
type Draft = {
  id?: string;
  name: string;
  icon: CategoryIconKey;
  color: CategoryColor | undefined;
  parentId?: string | null;
};
type ParentOption = { id: string; name: string };

/** Create or edit a category; also opened from the operation form («+ Новая»). */
export function CategoryEditor({
  draft,
  type,
  parents = [],
  onDone,
}: {
  draft: Draft;
  type: "EXPENSE" | "INCOME";
  /** Top-level categories this one can be placed inside. */
  parents?: ParentOption[];
  onDone: (createdId?: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(draft);
  // A new category's icon follows its name until the user picks one.
  const [iconPicked, setIconPicked] = useState(Boolean(draft.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = value.id
        ? await updateCategoryAction({
            id: value.id,
            name: value.name,
            icon: value.icon,
            color: value.color,
            parentId: value.parentId ?? null,
          })
        : await createCategoryAction({
            name: value.name,
            icon: value.icon,
            color: value.color,
            type,
            parentId: value.parentId ?? null,
          });
      if (!result.ok)
        return setError(
          result.fieldErrors?.name ??
            result.fieldErrors?.parentId ??
            result.error,
        );
      toast.success(value.id ? "Категория обновлена" : "Категория создана");
      router.refresh();
      onDone(value.id ? undefined : (result.data as { id: string }).id);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Opened from the operation form: the dialog is portalled, but React still bubbles submit to that form.
        e.stopPropagation();
        save();
      }}
      className="grid gap-5"
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={value.icon} color={value.color} size="lg" />
        <Field
          label="Название"
          htmlFor="category-name"
          error={error ?? undefined}
          className="flex-1"
        >
          <Input
            id="category-name"
            value={value.name}
            maxLength={40}
            autoFocus
            onChange={(e) => {
              const name = e.target.value;
              const hinted = iconPicked ? null : suggestCategoryIcon(name);
              setValue({ ...value, name, icon: hinted ?? value.icon });
            }}
          />
        </Field>
      </div>
      {parents.length > 0 ? (
        <Field
          label="Внутри категории"
          htmlFor="category-parent"
          hint="Например, «Парковка» внутри «Автомобиль» — в аналитике и бюджетах суммы сложатся."
        >
          <NativeSelect
            id="category-parent"
            value={value.parentId ?? ""}
            onChange={(e) =>
              setValue({ ...value, parentId: e.target.value || null })
            }
          >
            <option value="">— Отдельная категория —</option>
            {parents
              .filter((p) => p.id !== value.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
      ) : null}
      <Field label="Иконка" htmlFor="category-icon">
        <div
          id="category-icon"
          role="radiogroup"
          aria-label="Иконка"
          className="grid max-h-44 grid-cols-7 gap-1.5 overflow-y-auto sm:grid-cols-10"
        >
          {CATEGORY_ICONS.map((key) => {
            const Icon = CATEGORY_ICON_COMPONENTS[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={value.icon === key}
                aria-label={key}
                onClick={() => {
                  setIconPicked(true);
                  setValue({ ...value, icon: key });
                }}
                className={cn(
                  "grid aspect-square place-items-center rounded-md border",
                  value.icon === key
                    ? "border-primary bg-primary-subtle text-primary"
                    : "border-transparent bg-muted/60 text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Цвет" htmlFor="category-color">
        <ColorPicker
          value={value.color}
          onChange={(color) => setValue({ ...value, color })}
        />
      </Field>
      <Button type="submit" disabled={pending || !value.name.trim()}>
        {pending ? "Сохраняем…" : value.id ? "Сохранить" : "Создать категорию"}
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
  const active = orderTree(visible.filter((c) => !c.isArchived));
  const archived = visible.filter((c) => c.isArchived);
  const isRoot = (c: CategoryDTO) =>
    !c.parentId || !active.some((p) => p.id === c.parentId);
  const siblingsOf = (c: CategoryDTO) =>
    active.filter((x) => (isRoot(c) ? isRoot(x) : x.parentId === c.parentId));
  const parentOptions = active
    .filter((c) => isRoot(c) && !c.isSystem)
    .map(({ id, name }) => ({ id, name }));

  // Arrows move a category among its siblings: top-level ones, or the children of one parent.
  const move = (category: CategoryDTO, delta: -1 | 1) => {
    const ids = siblingsOf(category).map((c) => c.id);
    const index = ids.indexOf(category.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    startTransition(async () => {
      const result = await reorderCategoriesAction({ type, orderedIds: ids });
      if (!result.ok) toastActionError(result);
      router.refresh();
    });
  };

  const archive = (category: CategoryDTO, archivedValue: boolean) =>
    startTransition(async () => {
      const result = await archiveCategoryAction({
        id: category.id,
        archived: archivedValue,
      });
      if (!result.ok) return void toastActionError(result);
      toast.success(
        archivedValue
          ? `«${category.name}» в архиве`
          : `«${category.name}» восстановлена`,
      );
      router.refresh();
    });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Тип категории"
          value={type}
          onChange={setType}
          options={[
            { value: "EXPENSE", label: "Расходы" },
            { value: "INCOME", label: "Доходы" },
          ]}
          className="w-full sm:w-64"
        />
        <Button
          onClick={() =>
            setEditing({ name: "", icon: "circle-dashed", color: "indigo" })
          }
        >
          <Plus /> Новая категория
        </Button>
      </div>

      <Card className={cn("divide-y", pending && "opacity-70")}>
        {active.map((category) => {
          const siblings = siblingsOf(category);
          const index = siblings.findIndex((c) => c.id === category.id);
          return (
            <div
              key={category.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                !isRoot(category) && "pl-10",
              )}
            >
              <CategoryIcon icon={category.icon} color={category.color} />
              <span className="flex-1 truncate text-sm font-medium">
                {category.name}
              </span>
              {category.isSystem ? (
                <Badge>
                  <Lock /> Системная
                </Badge>
              ) : null}
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Переместить «${category.name}» выше`}
                  disabled={index === 0 || pending}
                  onClick={() => move(category, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Переместить «${category.name}» ниже`}
                  disabled={index === siblings.length - 1 || pending}
                  onClick={() => move(category, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Изменить «${category.name}»`}
                  onClick={() =>
                    setEditing({
                      id: category.id,
                      name: category.name,
                      icon: category.icon as CategoryIconKey,
                      color: (category.color ?? undefined) as
                        CategoryColor | undefined,
                      parentId: category.parentId,
                    })
                  }
                >
                  <Pencil />
                </Button>
                {!category.isSystem ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`В архив «${category.name}»`}
                    disabled={pending}
                    onClick={() => archive(category, true)}
                  >
                    <Archive />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </Card>

      {archived.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            В архиве
          </h2>
          <Card className="divide-y">
            {archived.map((category) => (
              <div
                key={category.id}
                className="flex items-center gap-3 px-3 py-2.5 opacity-70"
              >
                <CategoryIcon icon={category.icon} color={category.color} />
                <span className="flex-1 truncate text-sm">{category.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => archive(category, false)}
                >
                  <ArchiveRestore /> Восстановить
                </Button>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <ResponsiveDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.id ? "Изменить категорию" : "Новая категория"}
      >
        {editing ? (
          <CategoryEditor
            key={editing.id ?? "new"}
            draft={editing}
            type={type}
            // A category with subcategories stays top-level; system ones too.
            parents={
              editing.id &&
              (active.some((c) => c.parentId === editing.id) ||
                active.find((c) => c.id === editing.id)?.isSystem)
                ? []
                : parentOptions
            }
            onDone={() => setEditing(null)}
          />
        ) : null}
      </ResponsiveDialog>
    </div>
  );
}
