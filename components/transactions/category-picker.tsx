"use client";
import { Plus } from "lucide-react";
import { orderTree } from "@/lib/categories/tree";
import { CategoryIcon } from "@/components/finance/category-icon";
import { cn } from "@/lib/utils/cn";
import type { CategoryOption } from "./types";

/** Tap-friendly category grid (radiogroup) for the few-seconds expense flow. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  invalid,
  describedBy,
  onCreate,
}: {
  categories: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Shows a «Новая» tile at the end that opens the category editor. */
  onCreate?: () => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Категория"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4"
    >
      {orderTree(categories.map((c) => ({ ...c, parentId: c.parentId ?? null }))).map((category) => {
        const selected = category.id === value;
        const parent = category.parentId ? categories.find((c) => c.id === category.parentId) : undefined;
        return (
          <button
            key={category.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(category.id)}
            title={parent ? `${parent.name} → ${category.name}` : category.name}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-xs font-medium transition-colors duration-150",
              selected ? "border-primary bg-primary-subtle text-foreground" : "border-transparent bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <CategoryIcon icon={category.icon} color={category.color} size="sm" />
            <span className="w-full truncate">{category.name}</span>
            {parent ? <span className="-mt-1 w-full truncate text-[10px] font-normal text-muted-foreground">{parent.name}</span> : null}
          </button>
        );
      })}
      {onCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-1 py-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary"
        >
          <span className="grid size-7 place-items-center rounded-full bg-muted">
            <Plus className="size-4" aria-hidden />
          </span>
          <span className="w-full truncate">Новая</span>
        </button>
      ) : null}
    </div>
  );
}
