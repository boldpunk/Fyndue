"use client";
import { Plus } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { TransactionForm, type TransactionKind } from "@/components/transactions/transaction-form";
import type { AccountOption, CategoryOption } from "@/components/transactions/types";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

type QuickAddContextValue = { open: (kind?: TransactionKind) => void };
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
  children,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  today: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; kind: TransactionKind; key: number }>({
    open: false,
    kind: "EXPENSE",
    key: 0,
  });
  const open = useCallback((kind: TransactionKind = "EXPENSE") => setState((s) => ({ open: true, kind, key: s.key + 1 })), []);
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
          defaultKind={state.kind}
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
