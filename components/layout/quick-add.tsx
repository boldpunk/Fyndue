"use client";
import { Plus } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { TransactionForm, type TransactionKind } from "@/components/transactions/transaction-form";
import type { AccountOption, CategoryOption } from "@/components/transactions/types";
import type { TemplateDTO } from "@/lib/services/templates";
import type { MerchantMemory } from "@/lib/services/transactions";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

/** Optional prefill, e.g. «record an eSIM purchase» opens with that category and the usual card. */
export type QuickAddPreset = { categoryId?: string; accountId?: string };
type QuickAddContextValue = { open: (kind?: TransactionKind, preset?: QuickAddPreset) => void };
const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used inside <QuickAddProvider>");
  return ctx;
}

/** One global Quick Add sheet, opened from the header, bottom nav or pages. */
export function QuickAddProvider({
  accounts,
  categories,
  today,
  fxRates,
  merchants,
  templates,
  children,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  today: string;
  fxRates: Record<string, string>;
  merchants: MerchantMemory[];
  templates: TemplateDTO[];
  children: ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; kind: TransactionKind; key: number; preset?: QuickAddPreset }>({
    open: false,
    kind: "EXPENSE",
    key: 0,
  });
  const open = useCallback(
    (kind: TransactionKind = "EXPENSE", preset?: QuickAddPreset) => setState((s) => ({ open: true, kind, preset, key: s.key + 1 })),
    [],
  );
  const value = useMemo(() => ({ open }), [open]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <ResponsiveDialog
        open={state.open}
        onOpenChange={(next) => setState((s) => ({ ...s, open: next }))}
        title="Добавить операцию"
      >
        <TransactionForm
          key={state.key}
          accounts={accounts}
          categories={categories}
          today={today}
          fxRates={fxRates}
          merchants={merchants}
          templates={templates}
          defaultKind={state.kind}
          defaultAccountId={state.preset?.accountId}
          defaultCategoryId={state.preset?.categoryId}
          onDone={() => setState((s) => ({ ...s, open: false }))}
        />
      </ResponsiveDialog>
    </QuickAddContext.Provider>
  );
}

export function QuickAddButton({ kind, label = "Добавить", className }: { kind?: TransactionKind; label?: string; className?: string }) {
  const { open } = useQuickAdd();
  return (
    <Button onClick={() => open(kind)} className={className}>
      <Plus />
      {label}
    </Button>
  );
}
