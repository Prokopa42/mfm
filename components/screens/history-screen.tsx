"use client";

import { useMemo, useState } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { Glyph, InlineNumber } from "@/components/mfm-ui";
import { buildHistory, calculateDailyCheckOutcome } from "@/lib/calculations";
import { addDays, compareDates, isAfterOrSame, isBeforeOrSame, parseISODate } from "@/lib/dates";
import type {
  CalculationSnapshot,
  DailyCheck,
  DailyCheckReason,
  DailyCheckStatus,
  FinanceState,
  HistoryItemKind,
  ISODate
} from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface HistoryScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction?: (action: ActionDialogKind) => void;
  onDeleteHistoryItem?: (kind: HistoryItemKind, id: string) => void;
  onDeleteQuickSpentEntry?: (date: ISODate, entryId: string) => void;
}

type DiaryFilter = "all" | "30d" | "cycle";
type DiaryView = "operations" | "days";
type OperationKind =
  | HistoryItemKind
  | "quick-expense"
  | "quick-credit-expense"
  | "quick-credit-payment";

interface OperationItem {
  id: string;
  source: "history" | "quick";
  kind: OperationKind;
  date: ISODate;
  title: string;
  detail?: string;
  amount: number;
  cashEffect: number;
  debtEffect?: number;
  createdAt?: string;
}

const FILTERS: Array<{ id: DiaryFilter; label: string }> = [
  { id: "all", label: "Всё" },
  { id: "30d", label: "30 дней" },
  { id: "cycle", label: "Цикл" }
];

const VIEWS: Array<{ id: DiaryView; label: string }> = [
  { id: "operations", label: "Операции" },
  { id: "days", label: "Итоги дней" }
];

const RU_MONTH_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек"
];
const RU_DOW_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const STATUS_LABELS: Record<DailyCheckStatus, string> = {
  draft: "черновик",
  ok: "норма",
  warning: "внимание",
  risk: "риск",
  missed: "пропущено"
};

const STATUS_COLORS: Record<DailyCheckStatus, string> = {
  draft: "var(--ink-55)",
  ok: "var(--blue)",
  warning: "var(--yellow)",
  risk: "var(--red)",
  missed: "var(--ink-35)"
};

const REASON_LABELS: Record<DailyCheckReason, string> = {
  food: "еда",
  transport: "транспорт",
  family: "семья",
  health: "здоровье",
  work: "работа",
  "force-majeure": "форс-мажор",
  extra: "лишнее",
  unknown: "неясно",
  other: "другое"
};

function fmtDayLabel(iso: ISODate) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${RU_MONTH_SHORT[d.getMonth()]} · ${RU_DOW_SHORT[d.getDay()]}`;
}

function periodText(filter: DiaryFilter, snapshot: CalculationSnapshot) {
  if (filter === "30d") return "последние 30 дней";
  if (filter === "cycle") {
    return `${fmtDayLabel(snapshot.previousPaycheckDate)} → ${fmtDayLabel(snapshot.nextPaycheckDate)}`;
  }
  return "всё время";
}

function pluralRu(count: number, forms: [string, string, string]) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function filterChecks(checks: DailyCheck[], filter: DiaryFilter, snapshot: CalculationSnapshot) {
  const sorted = checks.slice().sort((a, b) => compareDates(b.date, a.date));
  if (filter === "30d") {
    const from = addDays(snapshot.today, -29);
    return sorted.filter((check) => isAfterOrSame(check.date, from));
  }
  if (filter === "cycle") {
    return sorted
      .filter((check) => isAfterOrSame(check.date, snapshot.previousPaycheckDate))
      .filter((check) => isBeforeOrSame(check.date, snapshot.nextPaycheckDate));
  }
  return sorted;
}

function matchesFilterDate(date: ISODate, filter: DiaryFilter, snapshot: CalculationSnapshot) {
  if (filter === "30d") return isAfterOrSame(date, addDays(snapshot.today, -29));
  if (filter === "cycle") {
    return isAfterOrSame(date, snapshot.previousPaycheckDate) && isBeforeOrSame(date, snapshot.nextPaycheckDate);
  }
  return true;
}

function buildOperations(state: FinanceState, filter: DiaryFilter, snapshot: CalculationSnapshot): OperationItem[] {
  const creditTitleById = new Map(state.credits.map((credit) => [credit.id, credit.title]));
  const expenseById = new Map(state.variableExpenses.map((expense) => [expense.id, expense]));
  const mandatoryById = new Map(state.mandatoryPayments.map((payment) => [payment.id, payment]));
  const linkedCreditPaymentByMandatoryId = new Map(
    state.creditEvents
      .filter((event) => event.kind === "payment" && event.linkedMandatoryPaymentId)
      .map((event) => [event.linkedMandatoryPaymentId!, event])
  );
  const linkedMandatoryTransferIds = new Set(
    state.transfersToSavings
      .filter((transfer) => transfer.linkedMandatoryPaymentId)
      .map((transfer) => transfer.id)
  );
  const regularOperations: OperationItem[] = buildHistory(state)
    .filter((item) => !(item.kind === "transfer-to-savings" && linkedMandatoryTransferIds.has(item.id)))
    .map((item) => {
      const mandatoryPayment = item.kind === "mandatory-payment" ? mandatoryById.get(item.id) : undefined;
      const expense = item.kind === "expense" ? expenseById.get(item.id) : undefined;
      const linkedCreditEvent = mandatoryPayment ? linkedCreditPaymentByMandatoryId.get(mandatoryPayment.id) : undefined;
      const linkedCreditTitle = mandatoryPayment?.linkedCreditId
        ? creditTitleById.get(mandatoryPayment.linkedCreditId)
        : undefined;
      const detail = mandatoryPayment?.linkedCreditId
        ? ["погашение долга", linkedCreditTitle].filter(Boolean).join(" · ")
        : item.detail;
      return {
        id: item.id,
        source: "history" as const,
        kind: item.kind,
        date: item.date,
        title: item.title,
        detail,
        amount: item.amount,
        cashEffect: mandatoryPayment?.paidFrom === "credit" ? 0 : item.cashEffect ?? item.amount,
        debtEffect: expense?.paymentSource === "credit"
          ? expense.amount
          : mandatoryPayment?.linkedCreditId
          ? -(linkedCreditEvent?.amount ?? mandatoryPayment.amount)
          : undefined
      };
    });

  const quickOperations: OperationItem[] = state.dailyChecks.flatMap((check) =>
    (check.quickSpentEntries ?? []).map((entry) => {
      const isCreditPayment = entry.operation === "credit-payment";
      const isCreditExpense = entry.paymentSource === "credit" && !isCreditPayment;
      const kind: OperationKind = isCreditPayment
        ? "quick-credit-payment"
        : isCreditExpense
          ? "quick-credit-expense"
          : "quick-expense";
      return {
        id: entry.id,
        source: "quick" as const,
        kind,
        date: check.date,
        createdAt: entry.createdAt,
        title:
          entry.note ||
          (isCreditPayment ? "Погашение долга" : isCreditExpense ? "Расход в долг" : "Быстрый расход"),
        detail: isCreditPayment ? "Погашение долга" : isCreditExpense ? "Заёмные деньги" : "Свои деньги",
        amount: -entry.amount,
        cashEffect: isCreditExpense ? 0 : -entry.amount,
        debtEffect: isCreditPayment ? -entry.amount : isCreditExpense ? entry.amount : 0
      };
    })
  );

  return [...regularOperations, ...quickOperations]
    .filter((item) => matchesFilterDate(item.date, filter, snapshot))
    .sort((a, b) => {
      const byDate = compareDates(b.date, a.date);
      if (byDate !== 0) return byDate;
      return (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id);
    });
}

function Header({ countLabel, period }: { countLabel: string; period: string }) {
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
        <span className="slab" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Дневник
        </span>
        <div style={{ width: 14, height: 0.5, background: "var(--ink-55)" }} />
        <span className="mono tnum" style={{ fontSize: 10, color: "var(--ink-55)" }}>
          {countLabel} · {period}
        </span>
      </div>
    </div>
  );
}

function FilterBar({
  active,
  onChange,
  counts
}: {
  active: DiaryFilter;
  onChange: (filter: DiaryFilter) => void;
  counts: Record<DiaryFilter, number>;
}) {
  return (
    <div style={{ padding: "8px var(--pad-x) 6px", display: "flex", gap: 6 }}>
      {FILTERS.map((filter) => {
        const on = active === filter.id;
        return (
          <button
            key={filter.id}
            type="button"
            onClick={() => onChange(filter.id)}
            className="tap-highlight"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 9px",
              border: on ? "1px solid var(--ink)" : "0.5px solid var(--ink-35)",
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink-55)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <Glyph shape={filter.id === "cycle" ? "bar" : "circle"} fill={on ? "var(--paper)" : "none"} stroke={on ? null : "var(--ink-55)"} size={7} />
            <span className="slab" style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {filter.label}
            </span>
            <span className="mono tnum" style={{ fontSize: 8.5, color: on ? "var(--paper)" : "var(--ink-35)" }}>
              {counts[filter.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ViewBar({
  active,
  onChange,
  counts
}: {
  active: DiaryView;
  onChange: (view: DiaryView) => void;
  counts: Record<DiaryView, number>;
}) {
  return (
    <div
      style={{
        padding: "2px var(--pad-x) 8px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6
      }}
    >
      {VIEWS.map((view) => {
        const on = active === view.id;
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onChange(view.id)}
            className="tap-highlight"
            style={{
              minHeight: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              border: on ? "1px solid var(--ink)" : "0.5px solid var(--ink-35)",
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink-55)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span className="slab" style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {view.label}
            </span>
            <span className="mono tnum" style={{ fontSize: 8.8, color: on ? "var(--paper)" : "var(--ink-35)" }}>
              {counts[view.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function operationKindLabel(kind: OperationKind) {
  switch (kind) {
    case "income":
      return "доход";
    case "expense":
      return "расход";
    case "transfer-to-savings":
      return "в накопления";
    case "withdrawal-from-savings":
      return "из котла";
    case "mandatory-payment":
      return "обязательный платёж";
    case "quick-credit-expense":
      return "в долг";
    case "quick-credit-payment":
      return "погашение долга";
    case "quick-expense":
      return "быстрый расход";
    default:
      return "операция";
  }
}

function signedMoney(value: number) {
  if (value === 0) return `${formatMoney(0)} ₽`;
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))} ₽`;
}

function operationMainAmount(item: OperationItem) {
  if (item.cashEffect === 0 && item.debtEffect) {
    return `долг ${signedMoney(item.debtEffect)}`;
  }
  return signedMoney(item.cashEffect);
}

function operationDetail(item: OperationItem) {
  const chunks = [operationKindLabel(item.kind), item.detail].filter(Boolean);
  if (item.cashEffect !== 0 && item.debtEffect) {
    chunks.push(`долг ${signedMoney(item.debtEffect)}`);
  }
  return chunks.join(" · ");
}

function OperationsSection({
  operations,
  onDeleteHistoryItem,
  onDeleteQuickSpentEntry
}: {
  operations: OperationItem[];
  onDeleteHistoryItem?: (kind: HistoryItemKind, id: string) => void;
  onDeleteQuickSpentEntry?: (date: ISODate, entryId: string) => void;
}) {
  return (
    <section style={{ borderTop: "1px solid var(--ink)", padding: "11px 0 13px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Операции
        </span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono tnum" style={{ fontSize: 9, color: "var(--ink-55)" }}>
          {operations.length}
        </span>
      </div>

      {operations.length === 0 ? (
        <div className="mono" style={{ marginTop: 8, fontSize: 9.5, color: "var(--ink-55)", lineHeight: 1.45 }}>
          За выбранный период операций нет.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
          {operations.map((item) => (
            <OperationRow
              key={`${item.source}:${item.id}`}
              item={item}
              onDeleteHistoryItem={onDeleteHistoryItem}
              onDeleteQuickSpentEntry={onDeleteQuickSpentEntry}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OperationRow({
  item,
  onDeleteHistoryItem,
  onDeleteQuickSpentEntry
}: {
  item: OperationItem;
  onDeleteHistoryItem?: (kind: HistoryItemKind, id: string) => void;
  onDeleteQuickSpentEntry?: (date: ISODate, entryId: string) => void;
}) {
  const canDelete = item.source === "quick" ? Boolean(onDeleteQuickSpentEntry) : Boolean(onDeleteHistoryItem);
  const amountColor =
    item.cashEffect > 0 ? "var(--blue)" :
    item.cashEffect < 0 ? "var(--red)" :
    (item.debtEffect ?? 0) < 0 ? "var(--blue)" :
    (item.debtEffect ?? 0) > 0 ? "var(--red)" :
    "var(--ink-55)";

  function handleDelete() {
    const shownAmount = Math.abs(item.cashEffect || item.amount || item.debtEffect || 0);
    const confirmed = window.confirm(
      `Отменить операцию «${item.title}» на ${formatMoney(shownAmount)} ₽? Балансы будут пересчитаны.`
    );
    if (!confirmed) return;
    if (item.source === "quick") {
      onDeleteQuickSpentEntry?.(item.date, item.id);
      return;
    }
    onDeleteHistoryItem?.(item.kind as HistoryItemKind, item.id);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        alignItems: "start",
        padding: "8px 0",
        borderTop: "0.5px solid var(--hair)"
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span className="mono" style={{ fontSize: 8.8, color: "var(--ink-35)", whiteSpace: "nowrap" }}>
            {fmtDayLabel(item.date)}
          </span>
          <span className="slab" style={{ fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {item.title}
          </span>
        </div>
        <div className="mono" style={{ marginTop: 3, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.35 }}>
          {operationDetail(item)}
        </div>
      </div>
      <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
        <span className="slab tnum" style={{ fontSize: 11, color: amountColor, whiteSpace: "nowrap" }}>
          {operationMainAmount(item)}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="tap-highlight mono"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--ink-55)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 8.8,
              padding: 0,
              textDecoration: "underline",
              textDecorationThickness: "0.5px",
              textUnderlineOffset: 3
            }}
          >
            отменить
          </button>
        )}
      </div>
    </div>
  );
}

function DiaryRow({ check }: { check: DailyCheck }) {
  const outcome = calculateDailyCheckOutcome(check);
  const totalSpent = outcome.freeSpent ?? check.freeSpent ?? 0;
  const overpay = Math.max(0, totalSpent - check.plannedLimit);
  const creditSpentAmount = check.creditSpentAmount ?? 0;
  const hasCalculatedEvening =
    check.eveningBalance === undefined && check.calculatedEveningBalance !== undefined;
  return (
    <article style={{ borderTop: "1px solid var(--ink)", padding: "10px 0 11px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {fmtDayLabel(check.date)}
        </span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9, color: STATUS_COLORS[check.status] }}>
          {STATUS_LABELS[check.status]}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <BalanceLine label="Утро" value={check.morningBalance} />
        <BalanceLine
          label={hasCalculatedEvening ? "Расчётный вечер" : "Вечер"}
          value={check.eveningBalance ?? check.calculatedEveningBalance}
          muted={hasCalculatedEvening}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <Metric label="Всего за день" value={totalSpent} />
        <Metric label="Переплата" value={overpay} color={overpay > 0 ? "var(--red)" : "var(--ink)"} />
      </div>

      <div className="mono" style={{ marginTop: 8, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
        Ориентир дня: {formatMoney(check.plannedLimit)} ₽.
        {creditSpentAmount > 0 ? ` В долг: ${formatMoney(creditSpentAmount)} ₽.` : ""}
      </div>

      {((check.quickSpentAmount ?? 0) > 0 || (check.creditSpentAmount ?? 0) > 0 || (check.creditPaymentAmount ?? 0) > 0) && (
        <div className="mono" style={{ marginTop: 8, fontSize: 9.5, color: "var(--ink-55)", lineHeight: 1.45 }}>
          Быстрые операции: свои расходы {formatMoney(check.quickSpentAmount ?? 0)} ₽
          {creditSpentAmount > 0 ? ` · в долг ${formatMoney(creditSpentAmount)} ₽` : ""}
          {(check.creditPaymentAmount ?? 0) > 0 ? ` · погашение долга ${formatMoney(check.creditPaymentAmount ?? 0)} ₽` : ""}
          {check.quickSpentEntries && check.quickSpentEntries.length > 0
            ? ` · ${check.quickSpentEntries.map((entry) => `${formatMoney(entry.amount)} ₽${entry.operation === "credit-payment" ? " погашение долга" : entry.paymentSource === "credit" ? " в долг" : ""}${entry.note ? ` — ${entry.note}` : ""}`).join(" · ")}`
            : ""}
        </div>
      )}

      {(check.reason || check.note) && (
        <div className="mono" style={{ marginTop: 8, fontSize: 9.5, color: "var(--ink-55)", lineHeight: 1.45 }}>
          {check.reason ? `Причина: ${REASON_LABELS[check.reason]}` : ""}
          {check.reason && check.note ? " · " : ""}
          {check.note}
        </div>
      )}
    </article>
  );
}

function BalanceLine({ label, value, muted = false }: { label: string; value?: number; muted?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
      <span className="mono" style={{ fontSize: 9.5, color: muted ? "var(--ink-35)" : "var(--ink-55)" }}>
        {label}
      </span>
      {value === undefined ? (
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-35)" }}>—</span>
      ) : (
        <InlineNumber value={formatMoney(value)} size={12} />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  color = "var(--ink)",
  signed = false
}: {
  label: string;
  value?: number;
  color?: string;
  signed?: boolean;
}) {
  const shown = value ?? 0;
  const sign = signed && shown > 0 ? "+" : signed && shown < 0 ? "−" : "";
  return (
    <div>
      <div className="mono" style={{ fontSize: 8.8, color: "var(--ink-55)" }}>
        {label}
      </div>
      <div className="slab tnum" style={{ marginTop: 4, fontSize: 12, color }}>
        {value === undefined ? "—" : `${sign}${formatMoney(Math.abs(shown))}`}
      </div>
    </div>
  );
}

export function HistoryScreen({
  state,
  snapshot,
  onDeleteHistoryItem,
  onDeleteQuickSpentEntry
}: HistoryScreenProps) {
  const [activeFilter, setActiveFilter] = useState<DiaryFilter>("cycle");
  const [activeView, setActiveView] = useState<DiaryView>("operations");
  const dayCounts = useMemo<Record<DiaryFilter, number>>(
    () => ({
      all: filterChecks(state.dailyChecks, "all", snapshot).length,
      "30d": filterChecks(state.dailyChecks, "30d", snapshot).length,
      cycle: filterChecks(state.dailyChecks, "cycle", snapshot).length
    }),
    [snapshot, state.dailyChecks]
  );
  const operationCounts = useMemo<Record<DiaryFilter, number>>(
    () => ({
      all: buildOperations(state, "all", snapshot).length,
      "30d": buildOperations(state, "30d", snapshot).length,
      cycle: buildOperations(state, "cycle", snapshot).length
    }),
    [snapshot, state]
  );
  const checks = useMemo(
    () => filterChecks(state.dailyChecks, activeFilter, snapshot),
    [activeFilter, snapshot, state.dailyChecks]
  );
  const operations = useMemo(
    () => buildOperations(state, activeFilter, snapshot),
    [activeFilter, snapshot, state]
  );
  const counts = activeView === "operations" ? operationCounts : dayCounts;
  const viewCounts: Record<DiaryView, number> = {
    operations: operations.length,
    days: checks.length
  };
  const countLabel =
    activeView === "operations"
      ? `${operations.length} ${pluralRu(operations.length, ["операция", "операции", "операций"])}`
      : `${checks.length} ${pluralRu(checks.length, ["день", "дня", "дней"])}`;

  return (
    <div
      style={{
        minHeight: "calc(100dvh - env(safe-area-inset-bottom) - var(--tabbar-base))",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Header countLabel={countLabel} period={periodText(activeFilter, snapshot)} />
      <FilterBar active={activeFilter} onChange={setActiveFilter} counts={counts} />
      <ViewBar active={activeView} onChange={setActiveView} counts={viewCounts} />
      <main style={{ padding: "4px var(--pad-x) 18px" }}>
        {activeView === "operations" ? (
          <OperationsSection
            operations={operations}
            onDeleteHistoryItem={onDeleteHistoryItem}
            onDeleteQuickSpentEntry={onDeleteQuickSpentEntry}
          />
        ) : checks.length === 0 ? (
          <div style={{ borderTop: "1px solid var(--ink)", padding: "16px 0" }}>
            <div className="slab" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Дневник пока пуст
            </div>
            <div className="mono" style={{ marginTop: 6, fontSize: 10, color: "var(--ink-55)", lineHeight: 1.45 }}>
              После утреннего и вечернего остатка здесь появится итог дня: всего за день и переплата.
            </div>
          </div>
        ) : (
          checks.map((check) => <DiaryRow key={check.id} check={check} />)
        )}
      </main>
    </div>
  );
}
