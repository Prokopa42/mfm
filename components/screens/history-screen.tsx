"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { Glyph } from "@/components/mfm-ui";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildHistory } from "@/lib/calculations";
import { addDays, compareDates, isAfterOrSame, isBeforeOrSame, parseISODate } from "@/lib/dates";
import type { CalculationSnapshot, FinanceState, HistoryItem, HistoryItemKind, ISODate, Rubric } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface HistoryScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  // onAction kept in the type for parity with shell wiring; History is a
  // quiet secondary screen with no CTAs in hi-fi (hifi-history.jsx::HiFiHistory
  // has TabBar but no action footer), so we don't read it here.
  onAction?: (action: ActionDialogKind) => void;
}

/* ─────────────────────────────────────────────────────────────
   Hi-fi 04/05 — History screen.
   Direct port of design/final/МФМ/hifi-history.jsx onto live state.
   Quiet, tabular, secondary. No hero, no CTA, no banner.

   Notes on data fidelity:
   - We don't store time-of-day on any ledger entry, so the hifi "14:20"
     time column is omitted (honest absence over a fake hh:mm).
   - "balance" under each row is the operationalBalance immediately AFTER
     that event. Reconstructed from current state.operationalBalance by
     walking backward through HistoryItem.amount (which is already the
     signed effect on operational; see lib/calculations.ts::buildHistory).
     This is honest provided the ledger is complete — which it is in
     this app's storage shape.
   ───────────────────────────────────────────────────────────── */

// ─── ru locale month-short ──────────────────────────────
const RU_MONTH_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек"
];
const RU_DOW_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function fmtDayLabel(iso: ISODate) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${RU_MONTH_SHORT[d.getMonth()]} · ${RU_DOW_SHORT[d.getDay()]}`;
}

function fmtRowDate(iso: ISODate) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${RU_MONTH_SHORT[d.getMonth()]}`;
}

function fmtPeriod(items: HistoryItem[]) {
  if (items.length === 0) return "нет операций";

  const oldest = items[items.length - 1];
  const newest = items[0];
  const oldestDate = parseISODate(oldest.date);
  const newestDate = parseISODate(newest.date);
  const sameMonth =
    oldestDate.getFullYear() === newestDate.getFullYear() &&
    oldestDate.getMonth() === newestDate.getMonth();

  if (sameMonth) {
    return `${RU_MONTH_SHORT[newestDate.getMonth()]} ${newestDate.getFullYear()}`;
  }

  return `${fmtRowDate(oldest.date)} → ${fmtRowDate(newest.date)}`;
}

// ─── Filter taxonomy ────────────────────────────────────
// 5 chips, exact match with hifi-history.jsx. mandatory-payment maps onto
// the "expense" filter (it IS an expense, just scheduled). Same minus glyph.
type FilterId = "all" | "income" | "expense" | "transfer" | "withdraw";

function kindToFilter(kind: HistoryItemKind): Exclude<FilterId, "all"> {
  switch (kind) {
    case "income":
      return "income";
    case "expense":
    case "mandatory-payment":
      return "expense";
    case "transfer-to-savings":
      return "transfer";
    case "withdrawal-from-savings":
      return "withdraw";
  }
}

interface FilterDef {
  id: FilterId;
  label: string;
}

const FILTERS: FilterDef[] = [
  { id: "all", label: "Все" },
  { id: "income", label: "Доход" },
  { id: "expense", label: "Расход" },
  { id: "transfer", label: "Перевод" },
  { id: "withdraw", label: "Снятие" }
];

// ─── TypeGlyph ──────────────────────────────────────────
function TypeGlyph({ kind }: { kind: HistoryItemKind }) {
  if (kind === "income") {
    return (
      <svg width="11" height="11" style={{ display: "block" }}>
        <line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="var(--ink)" strokeWidth="1.6" />
        <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="var(--ink)" strokeWidth="1.6" />
      </svg>
    );
  }
  if (kind === "expense" || kind === "mandatory-payment") {
    return (
      <svg width="10" height="10" style={{ display: "block" }}>
        <line x1="1.5" y1="5" x2="8.5" y2="5" stroke="var(--ink)" strokeWidth="1.4" />
      </svg>
    );
  }
  if (kind === "transfer-to-savings") {
    return (
      <svg width="10" height="10" style={{ display: "block" }}>
        <path d="M 1.5 5 L 8.5 5 M 6 3 L 8.5 5 L 6 7" fill="none" stroke="var(--blue)" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === "withdrawal-from-savings") {
    return <Glyph shape="square" fill="none" stroke="var(--ink)" sw={1.2} size={8} />;
  }
  return null;
}

// ─── Filter chip glyph (mini, for chip prefix) ──────────
function FilterChipGlyph({ id, on }: { id: FilterId; on: boolean }) {
  const active = on ? "var(--paper)" : "var(--ink)";
  const accent = on ? "var(--paper)" : "var(--blue)";
  if (id === "all") {
    return <Glyph shape="circle" fill="none" stroke={active} size={7} sw={1} />;
  }
  if (id === "income") {
    return (
      <svg width="8" height="8" style={{ display: "block" }}>
        <line x1="4" y1="1" x2="4" y2="7" stroke={active} strokeWidth="1.2" />
        <line x1="1" y1="4" x2="7" y2="4" stroke={active} strokeWidth="1.2" />
      </svg>
    );
  }
  if (id === "expense") {
    return (
      <svg width="8" height="8" style={{ display: "block" }}>
        <line x1="1" y1="4" x2="7" y2="4" stroke={active} strokeWidth="1.2" />
      </svg>
    );
  }
  if (id === "transfer") {
    return (
      <svg width="8" height="8" style={{ display: "block" }}>
        <path d="M 1 4 L 7 4 M 5 2 L 7 4 L 5 6" fill="none" stroke={accent} strokeWidth="1" />
      </svg>
    );
  }
  if (id === "withdraw") {
    return <Glyph shape="square" fill={active} size={7} />;
  }
  return null;
}

// ─── Header ─────────────────────────────────────────────
function HistoryHeader({ count, period }: { count: number; period: string }) {
  return (
    <div
      style={{
        padding: "12px var(--pad-x) 10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderBottom: "0.5px solid var(--hair)"
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          className="slab"
          style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          История
        </span>
        <div style={{ width: 14, height: 0.5, background: "var(--ink-55)" }} />
        <span className="mono tnum" style={{ fontSize: 10, color: "var(--ink-55)" }}>
          {count} операций · {period}
        </span>
      </div>
    </div>
  );
}

// ─── Filter chips ───────────────────────────────────────
interface FilterBarProps {
  active: FilterId;
  onChange: (id: FilterId) => void;
  counts: Record<FilterId, number>;
}

function HistoryFilter({ active, onChange, counts }: FilterBarProps) {
  return (
    <div
      style={{
        padding: "8px var(--pad-x) 6px",
        display: "flex",
        gap: 6,
        overflowX: "auto"
      }}
    >
      {FILTERS.map((f) => {
        const on = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className="tap-highlight"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 9px",
              border: on ? "1px solid var(--ink)" : "0.5px solid var(--ink-35)",
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink-55)",
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0
            }}
          >
            <FilterChipGlyph id={f.id} on={on} />
            <span
              className="slab"
              style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {f.label}
            </span>
            <span
              className="mono tnum"
              style={{
                fontSize: 8.5,
                color: on ? "var(--paper)" : "var(--ink-35)",
                marginLeft: 2
              }}
            >
              {counts[f.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface RubricFilterOption {
  id: string;
  title: string;
  isArchived: boolean;
  count: number;
}

type PeriodFilter = "all" | "30d" | "90d" | "cycle" | "custom";

interface HistoryAdvancedFilters {
  period: PeriodFilter;
  fromDate?: ISODate;
  toDate?: ISODate;
  categoryIds: string[];
}

const DEFAULT_ADVANCED_FILTERS: HistoryAdvancedFilters = {
  period: "all",
  categoryIds: []
};

const PERIOD_OPTIONS: Array<{ id: PeriodFilter; label: string }> = [
  { id: "all", label: "Всё время" },
  { id: "30d", label: "30 дней" },
  { id: "90d", label: "90 дней" },
  { id: "cycle", label: "Текущий цикл" },
  { id: "custom", label: "От / до" }
];

function resolvePeriodRange(filters: HistoryAdvancedFilters, snapshot: CalculationSnapshot) {
  if (filters.period === "all") return null;
  if (filters.period === "30d") return { from: addDays(snapshot.today, -30), to: snapshot.today };
  if (filters.period === "90d") return { from: addDays(snapshot.today, -90), to: snapshot.today };
  if (filters.period === "cycle") {
    return { from: snapshot.previousPaycheckDate, to: snapshot.nextPaycheckDate };
  }
  return {
    from: filters.fromDate,
    to: filters.toDate
  };
}

function applyPeriodFilter(
  items: HistoryListItem[],
  filters: HistoryAdvancedFilters,
  snapshot: CalculationSnapshot
) {
  const range = resolvePeriodRange(filters, snapshot);
  if (!range) return items;
  return items.filter((item) => {
    if (range.from && !isAfterOrSame(item.date, range.from)) return false;
    if (range.to && !isBeforeOrSame(item.date, range.to)) return false;
    return true;
  });
}

function periodFilterLabel(filters: HistoryAdvancedFilters, snapshot: CalculationSnapshot) {
  if (filters.period === "all") return "всё время";
  if (filters.period === "30d") return "30 дней";
  if (filters.period === "90d") return "90 дней";
  if (filters.period === "cycle") {
    return `${fmtRowDate(snapshot.previousPaycheckDate)} → ${fmtRowDate(snapshot.nextPaycheckDate)}`;
  }
  if (filters.fromDate && filters.toDate) return `${fmtRowDate(filters.fromDate)} → ${fmtRowDate(filters.toDate)}`;
  if (filters.fromDate) return `от ${fmtRowDate(filters.fromDate)}`;
  if (filters.toDate) return `до ${fmtRowDate(filters.toDate)}`;
  return "период";
}

function filterCount(filters: HistoryAdvancedFilters) {
  let count = 0;
  if (filters.period !== "all") count += 1;
  if (filters.categoryIds.length > 0) count += 1;
  return count;
}

function HistoryFilterSummary({
  filters,
  rubricTitles,
  snapshot,
  onOpen
}: {
  filters: HistoryAdvancedFilters;
  rubricTitles: Map<string, string>;
  snapshot: CalculationSnapshot;
  onOpen: () => void;
}) {
  const rubricsLabel =
    filters.categoryIds.length === 0
      ? "все"
      : filters.categoryIds
          .map((id) => rubricTitles.get(id) ?? "Рубрика")
          .slice(0, 2)
          .join(", ") + (filters.categoryIds.length > 2 ? ` +${filters.categoryIds.length - 2}` : "");
  const activeCount = filterCount(filters);

  return (
    <div
      style={{
        padding: "0 var(--pad-x) 6px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 8
      }}
    >
      <div className="mono" style={{ fontSize: 8.8, color: "var(--ink-55)", lineHeight: 1.45 }}>
        Период: {periodFilterLabel(filters, snapshot)}
        <br />
        Рубрики: {rubricsLabel}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="tap-highlight"
        style={{
          border: activeCount > 0 ? "1px solid var(--ink)" : "0.5px solid var(--ink-35)",
          background: "transparent",
          color: "var(--ink)",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "6px 8px"
        }}
      >
        <span className="slab" style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Фильтры{activeCount > 0 ? ` · ${activeCount}` : ""}
        </span>
      </button>
    </div>
  );
}

function HistoryFiltersDialog({
  open,
  draft,
  items,
  rubrics,
  snapshot,
  onDraftChange,
  onOpenChange,
  onApply,
  onReset
}: {
  open: boolean;
  draft: HistoryAdvancedFilters;
  items: HistoryListItem[];
  rubrics: Rubric[];
  snapshot: CalculationSnapshot;
  onDraftChange: (filters: HistoryAdvancedFilters) => void;
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const periodItems = useMemo(
    () => applyPeriodFilter(items, draft, snapshot),
    [draft, items, snapshot]
  );
  const rubricOptions = useMemo(
    () => buildRubricOptions(periodItems, rubrics),
    [periodItems, rubrics]
  );

  function setPeriod(period: PeriodFilter) {
    onDraftChange({ ...draft, period });
  }

  function toggleRubric(id: string) {
    const exists = draft.categoryIds.includes(id);
    onDraftChange({
      ...draft,
      categoryIds: exists
        ? draft.categoryIds.filter((categoryId) => categoryId !== id)
        : [...draft.categoryIds, id]
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Фильтры</DialogTitle>
          <DialogDescription>
            Выберите период и рубрики. На историю это попадёт только после кнопки Применить.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div style={{ display: "grid", gap: 7 }}>
            <div className="eyebrow eyebrow--ink" style={{ fontSize: 8 }}>
              Период
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {PERIOD_OPTIONS.map((option) => {
                const selected = draft.period === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPeriod(option.id)}
                    className="tap-highlight"
                    style={{
                      minHeight: 32,
                      border: selected ? "1px solid var(--ink)" : "0.5px solid var(--ink-35)",
                      background: selected ? "var(--ink)" : "transparent",
                      color: selected ? "var(--paper)" : "var(--ink)",
                      cursor: "pointer",
                      fontFamily: "inherit"
                    }}
                  >
                    <span className="slab" style={{ fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ display: "grid", gap: 4 }}>
                <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
                  От
                </span>
                <Input
                  type="date"
                  value={draft.fromDate ?? ""}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      period: "custom",
                      fromDate: (event.currentTarget.value || undefined) as ISODate | undefined
                    })
                  }
                />
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
                  До
                </span>
                <Input
                  type="date"
                  value={draft.toDate ?? ""}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      period: "custom",
                      toDate: (event.currentTarget.value || undefined) as ISODate | undefined
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 7 }}>
            <div className="eyebrow eyebrow--ink" style={{ fontSize: 8 }}>
              Рубрики
            </div>
            <div style={{ display: "grid", gap: 4, maxHeight: 210, overflow: "auto" }}>
              {rubricOptions.length === 0 ? (
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
                  В выбранном срезе нет операций с рубриками.
                </div>
              ) : (
                rubricOptions.map((option) => {
                  const selected = draft.categoryIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleRubric(option.id)}
                      className="tap-highlight"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "14px 1fr auto",
                        alignItems: "center",
                        gap: 8,
                        border: "none",
                        borderTop: "0.5px solid var(--hair)",
                        background: "transparent",
                        color: "var(--ink)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        padding: "7px 0",
                        textAlign: "left"
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          border: "0.5px solid var(--ink)",
                          background: selected ? "var(--ink)" : "transparent"
                        }}
                      />
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-80)" }}>
                        {option.title}
                        {option.isArchived ? " · архив" : ""}
                      </span>
                      <span className="mono tnum" style={{ fontSize: 9, color: "var(--ink-55)" }}>
                        {option.count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogBody>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            borderTop: "0.5px solid var(--ink)"
          }}
        >
          <button
            type="button"
            onClick={onReset}
            className="tap-highlight"
            style={{
              padding: "12px 10px",
              border: "none",
              background: "transparent",
              color: "var(--ink)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Сбросить
            </span>
          </button>
          <button
            type="button"
            onClick={onApply}
            className="tap-highlight"
            style={{
              padding: "12px 10px",
              border: "none",
              borderLeft: "0.5px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--paper)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Применить
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary triad — доход / расход / перевод ───────────
interface SummaryData {
  income: number;
  expense: number; // sum(|expense| + |mandatory-payment|), positive
  transfer: number; // sum(|transfer-to-savings|), positive
}

function HistorySummary({ d }: { d: SummaryData }) {
  return (
    <div
      style={{
        margin: "4px var(--pad-x) 6px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        border: "0.5px solid var(--ink-80)"
      }}
    >
      <SumCell label="доход" value={"+" + formatMoney(d.income)} color="var(--ink)" />
      <SumCell label="расход" value={"−" + formatMoney(d.expense)} color="var(--ink)" divider />
      <SumCell label="перевод" value={"−" + formatMoney(d.transfer)} color="var(--blue)" divider />
    </div>
  );
}

function SumCell({
  label,
  value,
  color,
  divider
}: {
  label: string;
  value: string;
  color: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        padding: "7px 9px",
        borderLeft: divider ? "0.5px solid var(--ink-80)" : "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch"
      }}
    >
      <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline" }}>
        <span className="slab tnum" style={{ fontSize: 12, color, textAlign: "right" }}>
          {value}
        </span>
        <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)", marginLeft: 3 }}>
          ₽
        </span>
      </div>
    </div>
  );
}

// ─── List + row ─────────────────────────────────────────
interface HistoryListItem extends HistoryItem {
  balance: number;
  sequence: number;
  categoryTitle?: string;
  categoryArchived?: boolean;
}

function HistoryList({ items }: { items: HistoryListItem[] }) {
  // group by date (in display order — already sorted desc by buildHistory)
  const groups: Array<{ key: string; items: HistoryListItem[] }> = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === it.date) last.items.push(it);
    else groups.push({ key: it.date, items: [it] });
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: "16px var(--pad-x)", color: "var(--ink-55)" }}>
        <span className="mono" style={{ fontSize: 11 }}>
          Нет операций этого типа.
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "2px var(--pad-x) 8px", flex: 1, overflow: "auto" }}>
      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              padding: "6px 0 4px",
              borderBottom: "0.5px solid var(--ink-80)"
            }}
          >
            <span
              className="slab"
              style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              {fmtDayLabel(g.key)}
            </span>
            <span className="mono tnum" style={{ fontSize: 9, color: "var(--ink-55)" }}>
              {g.items.length} оп.
            </span>
          </div>
          {g.items.map((e, i) => (
            <HistoryRow key={`${e.kind}_${e.id}`} e={e} last={i === g.items.length - 1} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HistoryRow({ e, last }: { e: HistoryListItem; last: boolean }) {
  const sign = e.amount > 0 ? "+" : "−";
  const income = e.kind === "income";
  const color = e.kind === "transfer-to-savings" ? "var(--blue)" : "var(--ink)";
  const balanceText =
    (e.balance < 0 ? "−" : "") + formatMoney(Math.abs(e.balance));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "14px 1fr auto",
        alignItems: "center",
        columnGap: 10,
        padding: "8px 0",
        borderBottom: last ? "none" : "0.5px solid var(--hair)"
      }}
    >
      <TypeGlyph kind={e.kind} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: income ? 700 : 400,
            color: income ? "var(--ink)" : "var(--ink-80)",
            letterSpacing: "-0.005em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {e.title}
        </span>
        {(e.categoryTitle || e.detail) ? (
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              color: "var(--ink-55)",
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {e.categoryTitle ? (
              <>
                {e.categoryTitle}
                {e.categoryArchived ? " · архив" : ""}
                {e.detail ? " · " : ""}
              </>
            ) : null}
            {e.detail}
          </span>
        ) : null}
        <span
          className="mono tnum"
          style={{ fontSize: 9, color: "var(--ink-35)", marginTop: 1 }}
        >
          {fmtRowDate(e.date)}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span className="slab tnum" style={{ fontSize: income ? 13 : 12, color }}>
          {sign}
          {formatMoney(Math.abs(e.amount))}
          <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
            {" "}
            ₽
          </span>
        </span>
        <span
          className="mono tnum"
          style={{ fontSize: 8.5, color: "var(--ink-35)" }}
          title="Оперативный остаток сразу после операции"
        >
          {balanceText}
        </span>
      </div>
    </div>
  );
}

// ─── Reconstruct operational balance after each event ───
// `items` are sorted DESC by the exact order displayed on screen.
// HistoryItem.amount is the display meaning of the operation.
// HistoryItem.cashEffect is the signed effect on operationalBalance when it
// differs from display amount (credit expense: display −N, cash effect 0).
// Therefore: balanceAfter[items[0]] = state.operationalBalance,
//            balanceAfter[items[i]]  = state.operationalBalance
//                                      − sum(items[0..i−1].cashEffect)
function attachBalances(items: HistoryItem[], current: number): HistoryListItem[] {
  let cumulativeNewer = 0;
  const out: HistoryListItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const balance = i === 0 ? current : current - cumulativeNewer;
    out.push({ ...items[i], balance, sequence: i });
    cumulativeNewer += items[i].cashEffect ?? items[i].amount;
  }
  return out;
}

function orderHistoryForDisplay(items: HistoryItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const byDate = compareDates(b.item.date, a.item.date);
      return byDate !== 0 ? byDate : a.index - b.index;
    })
    .map(({ item }) => item);
}

function attachRubrics(items: HistoryListItem[], rubrics: Rubric[]): HistoryListItem[] {
  const byId = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
  return items.map((item) => {
    const rubric = item.categoryId ? byId.get(item.categoryId) : undefined;
    return {
      ...item,
      categoryTitle: rubric?.title ?? item.legacyCategory,
      categoryArchived: rubric?.isArchived
    };
  });
}

function buildRubricOptions(items: HistoryListItem[], rubrics: Rubric[]): RubricFilterOption[] {
  const byId = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.categoryId) continue;
    counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, count]) => {
      const rubric = byId.get(id);
      return {
        id,
        title: rubric?.title ?? "Рубрика",
        isArchived: Boolean(rubric?.isArchived),
        order: rubric?.order ?? 9999,
        count
      };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"))
    .map(({ id, title, isArchived, count }) => ({ id, title, isArchived, count }));
}

// ─── Screen ─────────────────────────────────────────────
export function HistoryScreen({ state, snapshot }: HistoryScreenProps) {
  const [active, setActive] = useState<FilterId>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<HistoryAdvancedFilters>(DEFAULT_ADVANCED_FILTERS);
  const [draftFilters, setDraftFilters] = useState<HistoryAdvancedFilters>(DEFAULT_ADVANCED_FILTERS);

  const itemsAll = useMemo(() => {
    const raw = orderHistoryForDisplay(buildHistory(state));
    return attachRubrics(attachBalances(raw, state.operationalBalance), state.rubrics);
  }, [state]);

  const period = useMemo(() => fmtPeriod(itemsAll), [itemsAll]);

  const counts: Record<FilterId, number> = useMemo(() => {
    const c: Record<FilterId, number> = {
      all: itemsAll.length,
      income: 0,
      expense: 0,
      transfer: 0,
      withdraw: 0
    };
    for (const it of itemsAll) c[kindToFilter(it.kind)] += 1;
    return c;
  }, [itemsAll]);

  const visibleByType = useMemo(
    () => (active === "all" ? itemsAll : itemsAll.filter((it) => kindToFilter(it.kind) === active)),
    [active, itemsAll]
  );

  const visibleByPeriod = useMemo(
    () => applyPeriodFilter(visibleByType, filters, snapshot),
    [filters, snapshot, visibleByType]
  );

  useEffect(() => {
    if (filtersOpen) setDraftFilters(filters);
  }, [filters, filtersOpen]);

  const visible = useMemo(
    () =>
      filters.categoryIds.length === 0
        ? visibleByPeriod
        : visibleByPeriod.filter((item) => item.categoryId && filters.categoryIds.includes(item.categoryId)),
    [filters.categoryIds, visibleByPeriod]
  );

  const rubricTitles = useMemo(
    () => new Map(state.rubrics.map((rubric) => [rubric.id, `${rubric.title}${rubric.isArchived ? " · архив" : ""}`])),
    [state.rubrics]
  );

  // Summary always reflects the currently visible slice — matches hifi behaviour.
  const summary: SummaryData = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfer = 0;
    for (const it of visible) {
      if (it.kind === "income") income += it.amount;
      else if (it.kind === "expense" || it.kind === "mandatory-payment")
        expense += Math.abs(it.amount);
      else if (it.kind === "transfer-to-savings") transfer += Math.abs(it.amount);
      // withdrawals are intentionally not in the triad — same as hifi
    }
    return { income, expense, transfer };
  }, [visible]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "var(--paper)"
      }}
    >
      <HistoryHeader count={itemsAll.length} period={period} />
      <HistoryFilter active={active} onChange={setActive} counts={counts} />
      <HistoryFilterSummary
        filters={filters}
        rubricTitles={rubricTitles}
        snapshot={snapshot}
        onOpen={() => setFiltersOpen(true)}
      />
      <HistorySummary d={summary} />
      <HistoryList items={visible} />
      <HistoryFiltersDialog
        open={filtersOpen}
        draft={draftFilters}
        items={visibleByType}
        rubrics={state.rubrics}
        snapshot={snapshot}
        onDraftChange={setDraftFilters}
        onOpenChange={setFiltersOpen}
        onApply={() => {
          setFilters(draftFilters);
          setFiltersOpen(false);
        }}
        onReset={() => setDraftFilters(DEFAULT_ADVANCED_FILTERS)}
      />
    </div>
  );
}
