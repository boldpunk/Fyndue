"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { updateThemeAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
  { value: "system", label: "Как в системе", icon: Monitor },
] as const;

const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

export function useThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const choose = (value: string) => {
    setTheme(value);
    void updateThemeAction(value.toUpperCase());
  };
  return { theme: mounted ? (theme ?? "system") : "system", choose };
}

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const { theme, choose } = useThemeChoice();
  const Current = THEMES.find((t) => t.value === theme)?.icon ?? Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={withLabel ? "default" : "icon"} className={withLabel ? "w-full justify-start px-3 text-muted-foreground hover:text-foreground" : undefined} aria-label="Тема">
          <Current />
          {withLabel ? <span>Тема</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Тема</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={choose}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
