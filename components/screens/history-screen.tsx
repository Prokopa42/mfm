"use client";

import { useMemo, useState } from "react";
import { Filter, Plus } from "lucide-react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { EmptyNote, Panel, SectionTitle } from "@/components/mfm-ui";
import { Button } from "@/components/ui/button";
import { buildHistory } from "@/lib/calculations";
import { formatShortDate } from "@/lib/dates";
import type { FinanceState, HistoryItemKind } from "@/lib/types";
import { cn, formatSignedMoney } from "@/lib/utils";

interface HistoryScreenProps {
  state: FinanceState;
  onAction: (action: ActionDialogKind) => void;
}

const filters: Array<{ id: "all" | HistoryItemKind; label: string }> = [
  { id: "all", label: "Всё" },
  { id: "expense", label: "Расходы" },
  { id: "income", label: "Доходы" },
  { id: "transfer-to-savings", label: "Переводы" },
  { id: "withdrawal-from-savings", label: "Снятия" },
  { id: "mandatory-payment", label: "Платежи" }
];

export function HistoryScreen({ state, onAction }: HistoryScreenProps) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const history = useMemo(() => buildHistory(state), [state]);
  const visible = filter === "all" ? history : history.filter((item) => item.kind === filter);

  return (
    <div className="grid gap-4">
      <SectionTitle title="История" eyebrow="Доходы, расходы, переводы и снятия" />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "tap-highlight inline-flex h-9 shrink-0 items-center gap-2 border-2 border-[var(--ink)] px-3 text-xs font-black uppercase",
              filter === item.id ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--paper)] text-[var(--ink)]"
            )}
            onClick={() => setFilter(item.id)}
          >
            <Filter className="h-3 w-3" />
            {item.label}
          </button>
        ))}
      </div>

      <Panel className="p-4">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Button variant="default" onClick={() => onAction("expense")}>
            <Plus className="mr-2 h-4 w-4" />
            Расход
          </Button>
          <Button variant="outline" onClick={() => onAction("income")}>
            <Plus className="mr-2 h-4 w-4" />
            Доход
          </Button>
        </div>
        <div className="grid gap-2">
          {visible.length === 0 ? (
            <EmptyNote>Здесь пока нет операций этого типа.</EmptyNote>
          ) : (
            visible.map((item) => (
              <div
                key={`${item.kind}_${item.id}`}
                className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b-2 border-dashed border-[var(--thin)] py-3 last:border-b-0"
              >
                <KindMark kind={item.kind} />
                <div className="min-w-0">
                  <div className="slab truncate text-sm uppercase">{item.title}</div>
                  <div className="truncate text-xs text-[var(--muted-ink)]">
                    {formatShortDate(item.date)}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </div>
                </div>
                <div
                  className={cn(
                    "slab whitespace-nowrap text-sm uppercase",
                    item.amount > 0 ? "text-[var(--blue)]" : "text-[var(--ink)]"
                  )}
                >
                  {formatSignedMoney(item.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function KindMark({ kind }: { kind: HistoryItemKind }) {
  const classes: Record<HistoryItemKind, string> = {
    income: "bg-[var(--blue-soft)] border-[var(--blue-line)]",
    expense: "bg-[var(--ink)]",
    "transfer-to-savings": "bg-[var(--blue-soft)] border-[var(--blue-line)]",
    "withdrawal-from-savings": "bg-[var(--yellow-soft)] border-[var(--yellow-line)]",
    "mandatory-payment": "bg-[var(--red-soft)] border-[var(--red-line)]"
  };

  return <span className={cn("h-6 w-6 border-2 border-[var(--ink)]", classes[kind])} />;
}
