"use client";

import { useMemo, useState } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { Glyph } from "@/components/mfm-ui";
import { buildHistory } from "@/lib/calculations";
import { parseISODate } from "@/lib/dates";
import type { FinanceState, HistoryItem, HistoryItemKind, ISODate } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface HistoryScreenProps {
  state: FinanceState;
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
      <svg width="10" height="10" style={{ display: "block" }}>
        <line x1="5" y1="1.5" x2="5" y2="8.5" stroke="var(--ink)" strokeWidth="1.4" />
        <line x1="1.5" y1="5" x2="8.5" y2="5" stroke="var(--ink)" strokeWidth="1.4" />
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
function HistoryHeader({ count }: { count: number }) {
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
          {count} операций
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
            {f.id !== "all" && <FilterChipGlyph id={f.id} on={on} />}
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
        borderLeft: divider ? "0.5px solid var(--ink-80)" : "none"
      }}
    >
      <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>
        {label}
      </div>
      <span className="slab tnum" style={{ fontSize: 12, color }}>
        {value}
      </span>
      <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)", marginLeft: 3 }}>
        ₽
      </span>
    </div>
  );
}

// ─── List + row ─────────────────────────────────────────
interface HistoryListItem extends HistoryItem {
  balance: number;
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
            letterSpacing: "-0.005em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {e.title}
          {e.detail ? (
            <span style={{ color: "var(--ink-55)" }}> · {e.detail}</span>
          ) : null}
        </span>
        <span
          className="mono tnum"
          style={{ fontSize: 9, color: "var(--ink-35)", marginTop: 1 }}
        >
          {fmtRowDate(e.date)}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span className="slab tnum" style={{ fontSize: 12, color }}>
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
// `items` are sorted DESC by date (newest first) per buildHistory.
// HistoryItem.amount is the signed effect on operationalBalance:
//   income +amount, expense −amount, transfer-to-savings −amount,
//   withdrawal-from-savings +amount, mandatory-payment −amount.
// Therefore: balanceAfter[items[0]] = state.operationalBalance,
//            balanceAfter[items[i]]  = state.operationalBalance
//                                      − sum(items[0..i−1].amount)
function attachBalances(items: HistoryItem[], current: number): HistoryListItem[] {
  let cumulativeNewer = 0;
  const out: HistoryListItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const balance = i === 0 ? current : current - cumulativeNewer;
    out.push({ ...items[i], balance });
    cumulativeNewer += items[i].amount;
  }
  return out;
}

// ─── Screen ─────────────────────────────────────────────
export function HistoryScreen({ state }: HistoryScreenProps) {
  const [active, setActive] = useState<FilterId>("all");

  const itemsAll = useMemo(() => {
    const raw = buildHistory(state);
    return attachBalances(raw, state.operationalBalance);
  }, [state]);

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

  const visible = useMemo(
    () => (active === "all" ? itemsAll : itemsAll.filter((it) => kindToFilter(it.kind) === active)),
    [active, itemsAll]
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
      <HistoryHeader count={itemsAll.length} />
      <HistoryFilter active={active} onChange={setActive} counts={counts} />
      <HistorySummary d={summary} />
      <HistoryList items={visible} />
    </div>
  );
}
