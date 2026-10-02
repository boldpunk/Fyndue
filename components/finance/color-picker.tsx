"use client";
import { Check } from "lucide-react";
import { CATEGORY_COLORS, type CategoryColor } from "@/lib/constants/categories";
import { cn } from "@/lib/utils/cn";
import { CATEGORY_SWATCH_CLASSES } from "./category-icon";

export function ColorPicker({ value, onChange }: { value: string | undefined; onChange: (value: CategoryColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Цвет" className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className={cn(
            "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-background transition-shadow",
            CATEGORY_SWATCH_CLASSES[color],
            value === color && "ring-2 ring-foreground",
          )}
        >
          {value === color ? <Check className="size-4 text-white" aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
}
