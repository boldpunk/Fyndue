"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeChoice } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils/cn";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearancePicker() {
  const { theme, choose } = useThemeChoice();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors",
            theme === value ? "border-primary bg-primary-subtle" : "hover:bg-muted",
          )}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
