"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import {
  Glyph,
  Group,
  Row,
  SettingsCTA
} from "@/components/mfm-ui";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { compareDates, formatShortDate, todayISO } from "@/lib/dates";
import type {
  CalculationSettings,
  FinanceState,
  MandatoryPayment,
  Rubric,
  RubricScope
} from "@/lib/types";
import { formatMoney, uid } from "@/lib/utils";

interface SettingsScreenProps {
  state: FinanceState;
  setState: Dispatch<SetStateAction<FinanceState>>;
  // Kept in props for shell wiring parity. Mandatory-payment add UI lives in
  // a future ActionDialog (step 11); reset is intentionally absent in hi-fi.
  onAddMandatoryPayment?: (payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onReset?: () => void;
  onGoLive?: (keepMandatoryPaymentIds: string[]) => void;
}

interface SettingsDraft {
  settings: CalculationSettings;
  operationalBalance: number;
  savingsBalance: number;
  savingsCushionTarget: number;
}

/* ─────────────────────────────────────────────────────────────
   Hi-fi 05/05 — Settings screen.
   Direct port of design/final/МФМ/hifi-settings.jsx onto live state.

   Staged editing — sacred:
     1. user edits `draft` (local copy)
     2. dirtyKeys = diff(applied=state, draft) drives row-level red dots
        and the header status; nothing recalculates yet
     3. "Применить" commits draft into the global state via setState
        — single-step recalc downstream
     4. "Отменить" reverts draft to applied (no commit)
     5. While !dirty, external state changes (e.g. an expense recorded
        on Today) re-sync the draft via useEffect.
   ───────────────────────────────────────────────────────────── */

// ─── DraftKey: discriminator for per-row dirty + N-edits header ──
const DRAFT_KEYS = [
  "payday1",
  "typicalPaycheck1",
  "payday2",
  "typicalPaycheck2",
  "reserveAmount",
  "savingsBalance",
  "savingsCushionTarget",
  "operationalBalance",
  "autoSubtractPlannedSavings",
  "includeTodayInDivisor",
  "rounding",
  "purchasingPowerCoef"
] as const;

type DraftKey = (typeof DRAFT_KEYS)[number];

function valuesByKey(draft: SettingsDraft) {
  return {
    payday1: draft.settings.payday1,
    typicalPaycheck1: draft.settings.typicalPaycheck1,
    payday2: draft.settings.payday2,
    typicalPaycheck2: draft.settings.typicalPaycheck2,
    reserveAmount: draft.settings.reserveAmount,
    savingsBalance: draft.savingsBalance,
    savingsCushionTarget: draft.savingsCushionTarget,
    operationalBalance: draft.operationalBalance,
    autoSubtractPlannedSavings: draft.settings.autoSubtractPlannedSavings,
    includeTodayInDivisor: draft.settings.includeTodayInDivisor,
    rounding: draft.settings.rounding,
    purchasingPowerCoef: draft.settings.purchasingPowerCoef
  };
}

function appliedValuesByKey(state: FinanceState) {
  return {
    payday1: state.settings.payday1,
    typicalPaycheck1: state.settings.typicalPaycheck1,
    payday2: state.settings.payday2,
    typicalPaycheck2: state.settings.typicalPaycheck2,
    reserveAmount: state.settings.reserveAmount,
    savingsBalance: state.savings.balance,
    savingsCushionTarget: state.savings.cushion.target,
    operationalBalance: state.operationalBalance,
    autoSubtractPlannedSavings: state.settings.autoSubtractPlannedSavings,
    includeTodayInDivisor: state.settings.includeTodayInDivisor,
    rounding: state.settings.rounding,
    purchasingPowerCoef: state.settings.purchasingPowerCoef
  };
}

function computeDirtyKeys(draft: SettingsDraft, state: FinanceState): DraftKey[] {
  const a = valuesByKey(draft);
  const b = appliedValuesByKey(state);
  return DRAFT_KEYS.filter((k) => a[k] !== b[k]);
}

function createSettingsDraft(state: FinanceState): SettingsDraft {
  return {
    settings: { ...state.settings },
    operationalBalance: state.operationalBalance,
    savingsBalance: state.savings.balance,
    savingsCushionTarget: state.savings.cushion.target
  };
}

function clampDay(value: number) {
  return Math.min(31, Math.max(1, Math.round(value || 1)));
}

function clampNumber(value: number, min: number, max: number, decimals?: number) {
  const clamped = Math.min(max, Math.max(min, value));
  return decimals === undefined ? Math.round(clamped) : Number(clamped.toFixed(decimals));
}

function formatNumber(value: number, decimals?: number, grouped = false) {
  if (decimals === undefined) {
    return grouped ? formatMoney(value) : String(Math.round(value));
  }
  return Number(value.toFixed(decimals)).toString();
}

function parseNumberInput(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || normalized === "-" || normalized === ".") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const RUBRIC_SCOPE_LABEL: Record<RubricScope, string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  withdraw: "Снятие",
  "mandatory-payment": "Рубрики обязательных платежей"
};

const RUBRIC_SCOPES: RubricScope[] = [
  "expense",
  "income",
  "transfer",
  "withdraw",
  "mandatory-payment"
];

function countRubricUsage(state: FinanceState) {
  const usage = new Map<string, number>();
  const add = (id?: string) => {
    if (!id) return;
    usage.set(id, (usage.get(id) ?? 0) + 1);
  };
  state.variableExpenses.forEach((item) => add(item.categoryId));
  state.incomes.forEach((item) => add(item.categoryId));
  state.transfersToSavings.forEach((item) => add(item.categoryId));
  state.withdrawalsFromSavings.forEach((item) => add(item.categoryId));
  state.mandatoryPayments.forEach((item) => add(item.categoryId));
  return usage;
}

function normalizeRubricTitle(title: string) {
  return title.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function isLegacyRubric(rubric: Rubric) {
  return rubric.id.includes("_legacy_");
}

function duplicateRubricIds(rubrics: Rubric[]) {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  rubrics.forEach((rubric) => {
    const key = `${rubric.scope}:${normalizeRubricTitle(rubric.title)}`;
    const existing = seen.get(key);
    if (existing) {
      duplicates.add(existing);
      duplicates.add(rubric.id);
    } else {
      seen.set(key, rubric.id);
    }
  });
  return duplicates;
}

interface NumericInputControlProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  variant: "day" | "coef" | "money";
  suffix?: string;
  decimals?: number;
  ariaLabel: string;
}

function NumericInputControl({
  value,
  onChange,
  min,
  max,
  step,
  variant,
  suffix,
  decimals,
  ariaLabel
}: NumericInputControlProps) {
  const grouped = variant === "money";
  const [text, setText] = useState(() => formatNumber(value, decimals, grouped));
  const [focused, setFocused] = useState(false);
  const sizes = {
    day: { width: 92, button: 16, valueMin: 44 },
    coef: { width: 106, button: 16, valueMin: 54 },
    money: { width: 136, button: 16, valueMin: 84 }
  }[variant];

  useEffect(() => {
    if (!focused) setText(formatNumber(value, decimals, grouped));
  }, [decimals, focused, grouped, value]);

  function commit(nextText: string) {
    const parsed = parseNumberInput(nextText);
    if (parsed === null) return;
    onChange(clampNumber(parsed, min, max, decimals));
  }

  function stepBy(delta: number) {
    const parsed = parseNumberInput(text) ?? value;
    const next = clampNumber(parsed + delta * step, min, max, decimals);
    setText(formatNumber(next, decimals, grouped && !focused));
    onChange(next);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${sizes.button}px minmax(${sizes.valueMin}px, 1fr) ${sizes.button}px`,
        alignItems: "stretch",
        width: sizes.width,
        border: "0.5px solid var(--ink-55)",
        background: "var(--paper)"
      }}
    >
      <button
        type="button"
        onClick={() => stepBy(-1)}
        style={{
          border: "none",
          borderRight: "0.5px solid var(--ink-35)",
          background: "transparent",
          color: "var(--ink-55)",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0
        }}
        aria-label={`${ariaLabel}: уменьшить`}
      >
        <span className="slab" style={{ fontSize: 9 }}>
          −
        </span>
      </button>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          minWidth: 0,
          padding: "2px 6px"
        }}
      >
        <input
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            commit(event.currentTarget.value);
          }}
          onFocus={() => {
            setFocused(true);
            setText(formatNumber(value, decimals));
          }}
          onBlur={() => {
            setFocused(false);
            const parsed = parseNumberInput(text);
            const next = parsed === null ? value : clampNumber(parsed, min, max, decimals);
            if (parsed !== null) onChange(next);
            setText(formatNumber(next, decimals, grouped));
          }}
          inputMode={min < 0 || decimals !== undefined ? "decimal" : "numeric"}
          aria-label={ariaLabel}
          style={{
            width: "100%",
            minWidth: 0,
            border: "none",
            background: "transparent",
            color: "var(--ink)",
            fontFamily: "var(--font-slab)",
            fontSize: 11,
            lineHeight: 1,
            textAlign: "right",
            outline: "none",
            padding: "4px 0"
          }}
        />
        {suffix ? (
          <span
            className="mono"
            style={{ fontSize: 9, color: "var(--ink-55)", whiteSpace: "nowrap" }}
          >
            {suffix}
          </span>
        ) : null}
      </label>
      <button
        type="button"
        onClick={() => stepBy(1)}
        style={{
          border: "none",
          borderLeft: "0.5px solid var(--ink-35)",
          background: "transparent",
          color: "var(--ink-55)",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0
        }}
        aria-label={`${ariaLabel}: увеличить`}
      >
        <span className="slab" style={{ fontSize: 9 }}>
          +
        </span>
      </button>
    </div>
  );
}

function ReadOnlyMoney({ value, note }: { value: number; note: string }) {
  return (
    <div
      style={{
        width: 136,
        minHeight: 30,
        display: "grid",
        justifyItems: "end",
        alignContent: "center",
        gap: 3,
        padding: "4px 0"
      }}
    >
      <span className="slab tnum" style={{ fontSize: 11, color: "var(--ink-55)" }}>
        {formatMoney(value)} <span className="mono" style={{ fontSize: 8.5 }}>₽</span>
      </span>
      <span className="mono" style={{ fontSize: 7.8, color: "var(--ink-35)" }}>
        {note}
      </span>
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────
function SettingsHeader({ dirtyCount }: { dirtyCount: number }) {
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
          Настройки
        </span>
        <div style={{ width: 14, height: 0.5, background: "var(--ink-55)" }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
          {dirtyCount > 0 ? `черновик · ${dirtyCount} правок` : "без изменений"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div
          style={{
            width: 4,
            height: 4,
            background: dirtyCount > 0 ? "var(--red)" : "var(--ink-35)"
          }}
        />
        <span
          className="mono"
          style={{
            fontSize: 9,
            color: "var(--ink-55)",
            letterSpacing: "0.06em",
            textTransform: "uppercase"
          }}
        >
          {dirtyCount > 0 ? "не применено" : "синхронизировано"}
        </span>
      </div>
    </div>
  );
}

// ─── Staged-edit banner ─────────────────────────────────
// Dedicated layout (3px accent left + glyph cell + body) — visually a
// twin of mfm-ui::Banner but neutral when no edits, red when dirty.
// Banner primitive doesn't expose neutral kind, so we keep this local.
function StagedBanner({ dirtyCount }: { dirtyCount: number }) {
  return (
    <div
      style={{
        margin: "10px var(--pad-x) 0",
        border: "0.5px solid var(--ink-80)",
        display: "grid",
        gridTemplateColumns: "3px auto 1fr",
        alignItems: "stretch"
      }}
    >
      <div style={{ background: dirtyCount > 0 ? "var(--red)" : "var(--ink-35)" }} />
      <div style={{ padding: "0 8px", display: "flex", alignItems: "center" }}>
        <Glyph shape="circle" fill="none" stroke="var(--ink)" size={8} sw={1} />
      </div>
      <div style={{ padding: "7px 10px 7px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span
            className="slab"
            style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            Правки вносятся в черновик
          </span>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 9.5,
            color: "var(--ink-55)",
            marginTop: 2,
            lineHeight: 1.4
          }}
        >
          Сначала вы редактируете значения, затем нажимаете «Применить» — пересчёт произойдёт одним шагом.
        </div>
      </div>
    </div>
  );
}

// ─── Screen ─────────────────────────────────────────────
export function SettingsScreen({ state, setState, onReset, onGoLive }: SettingsScreenProps) {
  // applied = state (external), draft = local copy of editable fields
  const [draft, setDraft] = useState<SettingsDraft>(() => createSettingsDraft(state));
  // `dirty` is a sticky "user has touched the form" flag; while it's false,
  // external state changes (e.g. a new expense on Today) re-sync the draft.
  const [dirty, setDirty] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [fullResetOpen, setFullResetOpen] = useState(false);
  const [keepPaymentIds, setKeepPaymentIds] = useState<string[]>([]);

  const today = todayISO();
  const hasDailyCheckToday = state.dailyChecks.some(
    (check) =>
      check.date === today &&
      (check.morningBalance !== undefined ||
        check.eveningBalance !== undefined ||
        (check.quickSpentAmount ?? 0) > 0 ||
        (check.creditSpentAmount ?? 0) > 0 ||
        (check.creditPaymentAmount ?? 0) > 0)
  );
  const dirtyKeys = computeDirtyKeys(draft, state).filter(
    (key) => !(hasDailyCheckToday && key === "operationalBalance")
  );
  const hasChanges = dirtyKeys.length > 0;
  const isDirty = (k: DraftKey) => dirtyKeys.includes(k);
  const futureScheduledPayments = useMemo(
    () =>
      state.mandatoryPayments
        .filter((payment) => payment.status === "scheduled" && compareDates(payment.dueDate, today) >= 0)
        .slice()
        .sort((a, b) => compareDates(a.dueDate, b.dueDate)),
    [state.mandatoryPayments, today]
  );

  useEffect(() => {
    if (!dirty) {
      setDraft(createSettingsDraft(state));
    }
  }, [dirty, state]);

  function patch(updater: (prev: SettingsDraft) => SettingsDraft) {
    setDirty(true);
    setDraft(updater);
  }

  function patchSettings(p: Partial<CalculationSettings>) {
    patch((prev) => ({ ...prev, settings: { ...prev.settings, ...p } }));
  }

  function applyDraft() {
    if (!hasChanges) return;
    setState((previous) => {
      const operationalBalance = hasDailyCheckToday ? previous.operationalBalance : Math.max(0, draft.operationalBalance);
      const reserveAmount = Math.max(0, draft.settings.reserveAmount);

      return {
        ...previous,
        operationalBalance,
        settings: { ...draft.settings, reserveAmount },
        reserve: { ...previous.reserve, amount: Math.min(reserveAmount, operationalBalance) },
        savings: {
          ...previous.savings,
          balance: draft.savingsBalance,
          cushion: {
            ...previous.savings.cushion,
            target: Math.max(0, draft.savingsCushionTarget)
          }
        }
      };
    });
    setDirty(false);
  }

  function cancelDraft() {
    setDraft(createSettingsDraft(state));
    setDirty(false);
  }

  const s = draft.settings;
  const rubricUsage = useMemo(() => countRubricUsage(state), [state]);

  function updateRubrics(updater: (rubrics: Rubric[]) => Rubric[]) {
    setState((previous) => ({
      ...previous,
      rubrics: updater(previous.rubrics)
    }));
  }

  function addRubric(scope: RubricScope, title: string) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    updateRubrics((rubrics) => {
      const sameScope = rubrics.filter((rubric) => rubric.scope === scope);
      const exists = sameScope.some(
        (rubric) => normalizeRubricTitle(rubric.title) === normalizeRubricTitle(cleanTitle)
      );
      if (exists) return rubrics;
      const order = Math.max(0, ...sameScope.map((rubric) => rubric.order)) + 10;
      return [
        ...rubrics,
        {
          id: uid("rubric"),
          title: cleanTitle,
          scope,
          order,
          isArchived: false
        }
      ];
    });
  }

  function renameRubric(id: string, title: string) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    updateRubrics((rubrics) => {
      const current = rubrics.find((rubric) => rubric.id === id);
      if (!current) return rubrics;
      const createsDuplicate = rubrics.some(
        (rubric) =>
          rubric.id !== id &&
          rubric.scope === current.scope &&
          normalizeRubricTitle(rubric.title) === normalizeRubricTitle(cleanTitle)
      );
      if (createsDuplicate) return rubrics;
      return rubrics.map((rubric) => (rubric.id === id ? { ...rubric, title: cleanTitle } : rubric));
    });
  }

  function archiveRubric(id: string, isArchived: boolean) {
    updateRubrics((rubrics) =>
      rubrics.map((rubric) => (rubric.id === id ? { ...rubric, isArchived } : rubric))
    );
  }

  function deleteRubric(id: string) {
    if ((rubricUsage.get(id) ?? 0) > 0) return;
    updateRubrics((rubrics) => rubrics.filter((rubric) => rubric.id !== id));
  }

  function moveRubric(id: string, direction: -1 | 1) {
    updateRubrics((rubrics) => {
      const current = rubrics.find((rubric) => rubric.id === id);
      if (!current) return rubrics;
      const scopeRubrics = rubrics
        .filter((rubric) => rubric.scope === current.scope)
        .slice()
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));
      const index = scopeRubrics.findIndex((rubric) => rubric.id === id);
      const swap = scopeRubrics[index + direction];
      if (!swap) return rubrics;
      return rubrics.map((rubric) => {
        if (rubric.id === current.id) return { ...rubric, order: swap.order };
        if (rubric.id === swap.id) return { ...rubric, order: current.order };
        return rubric;
      });
    });
  }

  function mergeRubric(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setState((previous) => {
      const source = previous.rubrics.find((rubric) => rubric.id === sourceId);
      const target = previous.rubrics.find((rubric) => rubric.id === targetId);
      if (!source || !target || source.scope !== target.scope) return previous;

      return {
        ...previous,
        rubrics: previous.rubrics.filter((rubric) => rubric.id !== sourceId),
        variableExpenses:
          source.scope === "expense"
            ? previous.variableExpenses.map((item) =>
                item.categoryId === sourceId ? { ...item, categoryId: targetId } : item
              )
            : previous.variableExpenses,
        incomes:
          source.scope === "income"
            ? previous.incomes.map((item) => (item.categoryId === sourceId ? { ...item, categoryId: targetId } : item))
            : previous.incomes,
        transfersToSavings:
          source.scope === "transfer"
            ? previous.transfersToSavings.map((item) =>
                item.categoryId === sourceId ? { ...item, categoryId: targetId } : item
              )
            : previous.transfersToSavings,
        withdrawalsFromSavings:
          source.scope === "withdraw"
            ? previous.withdrawalsFromSavings.map((item) =>
                item.categoryId === sourceId ? { ...item, categoryId: targetId } : item
              )
            : previous.withdrawalsFromSavings,
        mandatoryPayments:
          source.scope === "mandatory-payment"
            ? previous.mandatoryPayments.map((item) =>
                item.categoryId === sourceId ? { ...item, categoryId: targetId } : item
              )
            : previous.mandatoryPayments
      };
    });
  }

  function openGoLive() {
    setKeepPaymentIds(futureScheduledPayments.map((payment) => payment.id));
    setGoLiveOpen(true);
  }

  function toggleKeepPayment(paymentId: string) {
    setKeepPaymentIds((current) =>
      current.includes(paymentId)
        ? current.filter((id) => id !== paymentId)
        : [...current, paymentId]
    );
  }

  function applyGoLive() {
    onGoLive?.(keepPaymentIds);
    setGoLiveOpen(false);
    setDirty(false);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "var(--paper)"
      }}
    >
      <SettingsHeader dirtyCount={dirtyKeys.length} />
      <StagedBanner dirtyCount={dirtyKeys.length} />

      {/* ─── Group 1: Цикл зарплаты ─────────────────────── */}
      <Group title="Цикл зарплаты" note="cycle">
        <Row label="День 1-й зарплаты" hint="число месяца, когда обычно приходит первая выплата" dirty={isDirty("payday1")}>
          <NumericInputControl
            value={s.payday1}
            onChange={(v) => patchSettings({ payday1: clampDay(v) })}
            min={1}
            max={31}
            step={1}
            variant="day"
            ariaLabel="День 1-й зарплаты"
          />
        </Row>
        <Row
          label="Сумма 1-й зарплаты"
          hint="используется для цикла и подтверждения зарплаты"
          dirty={isDirty("typicalPaycheck1")}
        >
          <NumericInputControl
            value={s.typicalPaycheck1}
            onChange={(v) => patchSettings({ typicalPaycheck1: Math.max(0, v) })}
            min={0}
            max={1_000_000}
            step={1000}
            variant="money"
            suffix="₽"
            ariaLabel="Сумма 1-й зарплаты"
          />
        </Row>
        <Row label="День 2-й зарплаты" hint="число месяца, когда обычно приходит вторая выплата" dirty={isDirty("payday2")}>
          <NumericInputControl
            value={s.payday2}
            onChange={(v) => patchSettings({ payday2: clampDay(v) })}
            min={1}
            max={31}
            step={1}
            variant="day"
            ariaLabel="День 2-й зарплаты"
          />
        </Row>
        <Row
          label="Сумма 2-й зарплаты"
          hint="используется для цикла и подтверждения зарплаты"
          dirty={isDirty("typicalPaycheck2")}
        >
          <NumericInputControl
            value={s.typicalPaycheck2}
            onChange={(v) => patchSettings({ typicalPaycheck2: Math.max(0, v) })}
            min={0}
            max={1_000_000}
            step={1000}
            variant="money"
            suffix="₽"
            ariaLabel="Сумма 2-й зарплаты"
          />
        </Row>
      </Group>

      {/* ─── Group 2: Подушка на сегодня ────────────────── */}
      <Group title="Подушка на сегодня" note="оперативный запас">
        <Row
          label="Желаемая подушка"
          hint={
            hasDailyCheckToday
              ? "новые расчёты учтут этот запас; уже записанный факт дня не перепишется"
              : "часть оперативных денег, которую приложение не предлагает тратить"
          }
          dirty={isDirty("reserveAmount")}
        >
          <NumericInputControl
            value={s.reserveAmount}
            onChange={(v) => patchSettings({ reserveAmount: Math.max(0, v) })}
            min={0}
            max={1_000_000}
            step={1000}
            variant="money"
            suffix="₽"
            ariaLabel="Размер подушки цикла"
          />
        </Row>
      </Group>

      {/* ─── Group 3: Накопления ────────────────────────── */}
      <Group title="Накопления" note="balances">
        <Row
          label="Текущие накопления"
          hint="долгосрочный котёл для целей и будущего"
          dirty={isDirty("savingsBalance")}
        >
          <NumericInputControl
            value={draft.savingsBalance}
            onChange={(v) => patch((p) => ({ ...p, savingsBalance: Math.max(0, v) }))}
            min={0}
            max={10_000_000}
            step={1000}
            variant="money"
            suffix="₽"
            ariaLabel="Текущие накопления"
          />
        </Row>
        <Row
          label="Цель копилки"
          hint="ориентир для отдельной копилки внутри накоплений; уже выделенные деньги не двигает"
          dirty={isDirty("savingsCushionTarget")}
        >
          <NumericInputControl
            value={draft.savingsCushionTarget}
            onChange={(v) => patch((p) => ({ ...p, savingsCushionTarget: Math.max(0, v) }))}
            min={0}
            max={10_000_000}
            step={1000}
            variant="money"
            suffix="₽"
            ariaLabel="Цель копилки"
          />
        </Row>
        <Row
          label="Оперативный остаток"
          hint={
            hasDailyCheckToday
              ? "сегодня уже есть замер; остаток меняется на вкладке Сегодня через утро, вечер или быстрый расход"
              : "деньги текущего расходного контура"
          }
          dirty={isDirty("operationalBalance")}
        >
          {hasDailyCheckToday ? (
            <ReadOnlyMoney value={state.operationalBalance} note="править на Сегодня" />
          ) : (
            <NumericInputControl
              value={draft.operationalBalance}
              onChange={(v) => patch((p) => ({ ...p, operationalBalance: Math.max(0, v) }))}
              min={0}
              max={10_000_000}
              step={1000}
              variant="money"
              suffix="₽"
              ariaLabel="Оперативный остаток"
            />
          )}
        </Row>
        <Row
          label="Автовычитать плановые переводы"
          hint="плановые переводы в накопления уменьшают доступно до зарплаты"
          dirty={isDirty("autoSubtractPlannedSavings")}
        >
          <Switch
            checked={s.autoSubtractPlannedSavings}
            onCheckedChange={(v) => patchSettings({ autoSubtractPlannedSavings: v })}
          />
        </Row>
      </Group>

      {/* ─── Group 4: Расчёт ────────────────────────────── */}
      <Group title="Расчёт" note="calculation">
        <Row
          label="Сегодня входит в расчёт дней"
          hint="если включено, свободные деньги делятся с учётом сегодняшнего дня; лимит осторожнее"
          dirty={isDirty("includeTodayInDivisor")}
        >
          <Switch
            checked={s.includeTodayInDivisor}
            onCheckedChange={(v) => patchSettings({ includeTodayInDivisor: v })}
          />
        </Row>
        <Row label="Округление" hint="пока не влияет на расчёт MVP" dirty={false}>
          <span
            className="mono"
            style={{
              padding: "4px 8px",
              border: "0.5px solid var(--ink-18)",
              color: "var(--ink-35)",
              fontSize: 9,
              textTransform: "uppercase"
            }}
          >
            {s.rounding === "hour" ? "час" : "день"}
          </span>
        </Row>
        <Row
          label="Коэф. покупательной силы"
          hint="пересчитывает прогноз накоплений в сегодняшние ₽"
          dirty={isDirty("purchasingPowerCoef")}
        >
          <NumericInputControl
            value={Number(s.purchasingPowerCoef.toFixed(2))}
            onChange={(v) =>
              patchSettings({ purchasingPowerCoef: Math.min(1, Math.max(0, Number(v.toFixed(2)))) })
            }
            min={0}
            max={1}
            step={0.01}
            variant="coef"
            decimals={2}
            ariaLabel="Коэф. покупательной силы"
          />
        </Row>
      </Group>

      <RubricsGroup
        rubrics={state.rubrics}
        usage={rubricUsage}
        onAdd={addRubric}
        onRename={renameRubric}
        onArchive={archiveRubric}
        onDelete={deleteRubric}
        onMove={moveRubric}
        onMerge={mergeRubric}
      />

      <GoLiveBlock onOpen={openGoLive} />
      <FullResetBlock onOpen={() => setFullResetOpen(true)} />

      <div style={{ flex: 1, minHeight: 14 }} />

      <SettingsCTA dirty={hasChanges} onApply={applyDraft} onDiscard={cancelDraft} />
      <GoLiveDialog
        open={goLiveOpen}
        payments={futureScheduledPayments}
        keepPaymentIds={keepPaymentIds}
        state={state}
        onTogglePayment={toggleKeepPayment}
        onOpenChange={setGoLiveOpen}
        onConfirm={applyGoLive}
      />
      <FullResetDialog
        open={fullResetOpen}
        onOpenChange={setFullResetOpen}
        onConfirm={() => {
          onReset?.();
          setFullResetOpen(false);
          setDirty(false);
        }}
      />
    </div>
  );
}

function GoLiveBlock({ onOpen }: { onOpen: () => void }) {
  return (
    <Group title="Старт работы" note="go-live">
      <div
        className="mono"
        style={{
          padding: "8px 0",
          borderTop: "0.5px solid var(--hair)",
          fontSize: 9.5,
          color: "var(--ink-55)",
          lineHeight: 1.45
        }}
      >
        Сценарий для перехода из demo/MVP в реальную работу: операции и дневник очищаются, текущие остатки и структура
        сохраняются.
      </div>
      <button
        type="button"
        className="tap-highlight slab"
        onClick={onOpen}
        style={{
          width: "100%",
          minHeight: 42,
          border: "1px solid var(--ink)",
          background: "transparent",
          color: "var(--ink)",
          fontFamily: "inherit",
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer"
        }}
      >
        Сбросить журнал, сохранить текущее состояние
      </button>
    </Group>
  );
}

function FullResetBlock({ onOpen }: { onOpen: () => void }) {
  return (
    <Group title="Полный сброс" note="очистка">
      <div
        className="mono"
        style={{
          padding: "8px 0",
          borderTop: "0.5px solid var(--hair)",
          fontSize: 9.5,
          color: "var(--ink-55)",
          lineHeight: 1.45
        }}
      >
        Отдельно от «Старт работы». Полностью обнуляет деньги, дневник, платежи, накопления, цели и кредиты.
        Сохраняет только дни зарплаты, а суммы зарплат ставит по 100 000 ₽.
      </div>
      <button
        type="button"
        className="tap-highlight slab"
        onClick={onOpen}
        style={{
          width: "100%",
          minHeight: 42,
          border: "1px solid var(--red)",
          background: "transparent",
          color: "var(--red)",
          fontFamily: "inherit",
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer"
        }}
      >
        Полный сброс
      </button>
    </Group>
  );
}

function FullResetDialog({
  open,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Полный сброс</DialogTitle>
          <DialogDescription>
            Это не go-live. Будет создано чистое состояние приложения.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.5, color: "var(--ink-70)" }}>
            Обнулим: оперативный остаток, подушку цикла, накопления, цели, дневник, доходы, расходы, переводы,
            снятия, обязательные платежи, кредиты и кредитные движения.
          </div>
          <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.5, color: "var(--ink-55)" }}>
            Оставим текущие дни зарплаты. Если они не заданы — 5 и 20. Суммы зарплат будут по 100 000 ₽.
          </div>
        </DialogBody>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "0.5px solid var(--ink)" }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="tap-highlight slab"
            style={{
              minHeight: 42,
              border: "none",
              background: "transparent",
              color: "var(--ink)",
              fontFamily: "inherit",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer"
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="tap-highlight slab"
            style={{
              minHeight: 42,
              border: "none",
              borderLeft: "0.5px solid var(--ink)",
              background: "var(--red)",
              color: "var(--paper)",
              fontFamily: "inherit",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer"
            }}
          >
            Сбросить всё
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoLiveDialog({
  open,
  payments,
  keepPaymentIds,
  state,
  onTogglePayment,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  payments: MandatoryPayment[];
  keepPaymentIds: string[];
  state: FinanceState;
  onTogglePayment: (paymentId: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const rubricById = useMemo(() => new Map(state.rubrics.map((rubric) => [rubric.id, rubric])), [state.rubrics]);
  const creditById = useMemo(() => new Map(state.credits.map((credit) => [credit.id, credit])), [state.credits]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Начать с текущего состояния</DialogTitle>
          <DialogDescription>
            Обнуляем не деньги, а журнал. Остатки, цели, рубрики и кредиты остаются как новая стартовая точка.
          </DialogDescription>
        </DialogHeader>
        <DialogBody style={{ gap: 12, maxHeight: "68vh", overflow: "auto" }}>
          <GoLiveList
            title="Сохраним"
            items={[
              "текущие деньги и настройки",
              "накопления, цели и распределение",
              "подушку цикла и копилку",
              "рубрики",
              "кредиты с текущими остатками"
            ]}
          />
          <GoLiveList
            title="Очистим"
            items={[
              "доходы, расходы, переводы и снятия",
              "прошлую историю операций и дневник",
              "журнал движений по кредитам",
              "demo-прошлое накоплений"
            ]}
          />

          <div style={{ borderTop: "1px solid var(--ink)", paddingTop: 9 }}>
            <div
              className="slab"
              style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Будущие обязательные платежи
            </div>
            <div className="mono" style={{ marginTop: 4, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
              Отметьте, что оставить в новом рабочем состоянии.
            </div>

            {payments.length === 0 ? (
              <div className="mono" style={{ marginTop: 9, fontSize: 9.5, color: "var(--ink-35)" }}>
                Будущих запланированных платежей нет.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 0, marginTop: 8 }}>
                {payments.map((payment) => {
                  const rubric = payment.categoryId ? rubricById.get(payment.categoryId) : undefined;
                  const credit = payment.linkedCreditId ? creditById.get(payment.linkedCreditId) : undefined;
                  const checked = keepPaymentIds.includes(payment.id);

                  return (
                    <label
                      key={payment.id}
                      className="tap-highlight"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "18px 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "8px 0",
                        borderTop: "0.5px solid var(--hair)",
                        cursor: "pointer"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onTogglePayment(payment.id)}
                        aria-label={`Оставить платёж ${payment.title}`}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span
                          className="slab"
                          style={{
                            display: "block",
                            fontSize: 10.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {payment.title}
                        </span>
                        <span
                          className="mono"
                          style={{
                            display: "block",
                            marginTop: 2,
                            fontSize: 8.8,
                            color: "var(--ink-55)",
                            lineHeight: 1.35
                          }}
                        >
                          {formatShortDate(payment.dueDate)}
                          {rubric ? ` · ${rubric.title}` : ""}
                          {credit ? ` · кредит: ${credit.title}` : ""}
                        </span>
                      </span>
                      <span className="slab tnum" style={{ fontSize: 10.5 }}>
                        {formatMoney(payment.amount)} ₽
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </DialogBody>
        <button
          type="button"
          className="tap-highlight slab"
          onClick={onConfirm}
          style={{
            width: "100%",
            padding: "13px 14px",
            background: "var(--ink)",
            color: "var(--paper)",
            border: "none",
            borderTop: "1px solid var(--ink)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase"
          }}
        >
          Начать с текущего состояния
        </button>
      </DialogContent>
    </Dialog>
  );
}

function GoLiveList({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ borderTop: "0.5px solid var(--hair)", paddingTop: 8 }}>
      <div className="eyebrow eyebrow--ink" style={{ marginBottom: 5 }}>
        {title}
      </div>
      <div className="mono" style={{ display: "grid", gap: 3, fontSize: 9.2, color: "var(--ink-55)" }}>
        {items.map((item) => (
          <span key={item}>• {item}</span>
        ))}
      </div>
    </div>
  );
}

function RubricsGroup({
  rubrics,
  usage,
  onAdd,
  onRename,
  onArchive,
  onDelete,
  onMove,
  onMerge
}: {
  rubrics: Rubric[];
  usage: Map<string, number>;
  onAdd: (scope: RubricScope, title: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string, isArchived: boolean) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onMerge: (sourceId: string, targetId: string) => void;
}) {
  const [newScope, setNewScope] = useState<RubricScope>("expense");
  const [newTitle, setNewTitle] = useState("");
  const [mergeDraft, setMergeDraft] = useState<{ sourceId: string; targetId: string } | null>(null);
  const duplicates = useMemo(() => duplicateRubricIds(rubrics), [rubrics]);
  const sorted = rubrics
    .slice()
    .sort(
      (a, b) =>
        RUBRIC_SCOPES.indexOf(a.scope) - RUBRIC_SCOPES.indexOf(b.scope) ||
        a.order - b.order ||
        a.title.localeCompare(b.title, "ru")
    );

  function submitNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAdd(newScope, newTitle);
    setNewTitle("");
  }

  function beginMerge(source: Rubric) {
    const target = sorted.find((rubric) => rubric.scope === source.scope && rubric.id !== source.id);
    if (!target) return;
    setMergeDraft({ sourceId: source.id, targetId: target.id });
  }

  function commitMerge() {
    if (!mergeDraft) return;
    onMerge(mergeDraft.sourceId, mergeDraft.targetId);
    setMergeDraft(null);
  }

  return (
    <Group title="Рубрики" note="справочник">
      <form
        onSubmit={submitNew}
        style={{
          display: "grid",
          gridTemplateColumns: "115px 1fr auto",
          gap: 8,
          alignItems: "center",
          padding: "8px 0",
          borderTop: "0.5px solid var(--hair)"
        }}
      >
        <RubricScopeSelect value={newScope} onChange={setNewScope} />
        <RubricTextInput
          value={newTitle}
          onChange={setNewTitle}
          placeholder="Новая рубрика"
          ariaLabel="Название новой рубрики"
        />
        <button type="submit" className="tap-highlight mono" style={rubricActionStyle("var(--blue)")}>
          Добавить
        </button>
      </form>

      <div
        className="mono"
        style={{ padding: "0 0 7px", fontSize: 9, color: "var(--ink-55)", lineHeight: 1.4 }}
      >
        Справочник сохраняется сразу и не участвует в «Применить». Использованные рубрики архивируются,
        а не удаляются из истории. Рубрика — это устойчивый словарь, не название одной покупки.
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {RUBRIC_SCOPES.map((scope) => {
          const scopeRubrics = sorted.filter((rubric) => rubric.scope === scope);
          if (scopeRubrics.length === 0) return null;

          const problematic = scopeRubrics.filter((rubric) => isLegacyRubric(rubric) || duplicates.has(rubric.id));
          const active = scopeRubrics.filter(
            (rubric) => !rubric.isArchived && !isLegacyRubric(rubric) && !duplicates.has(rubric.id)
          );
          const archived = scopeRubrics.filter(
            (rubric) => rubric.isArchived && !isLegacyRubric(rubric) && !duplicates.has(rubric.id)
          );

          return (
            <div key={scope} style={{ borderTop: "1px solid var(--ink)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  padding: "8px 0 4px"
                }}
              >
                <span className="slab" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {RUBRIC_SCOPE_LABEL[scope]}
                </span>
                <span className="mono tnum" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
                  {scopeRubrics.length} шт.
                </span>
                <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
              </div>
              {scope === "mandatory-payment" && (
                <div className="mono" style={{ padding: "0 0 5px", fontSize: 8.8, color: "var(--ink-55)", lineHeight: 1.4 }}>
                  Эти рубрики используются при создании платежей на вкладке Цикл: аренда, связь, кредит, подписки и т.д.
                </div>
              )}

              {problematic.length > 0 && (
                <RubricSubsection
                  label="Legacy / дубли"
                  rubrics={problematic}
                  allRubrics={scopeRubrics}
                  usage={usage}
                  mergeDraft={mergeDraft}
                  onMergeTargetChange={(targetId) =>
                    setMergeDraft((current) => (current ? { ...current, targetId } : current))
                  }
                  onBeginMerge={beginMerge}
                  onCommitMerge={commitMerge}
                  onCancelMerge={() => setMergeDraft(null)}
                  onRename={onRename}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onMove={onMove}
                />
              )}

              <RubricSubsection
                label="Активные"
                rubrics={active}
                allRubrics={scopeRubrics}
                usage={usage}
                mergeDraft={mergeDraft}
                onMergeTargetChange={(targetId) =>
                  setMergeDraft((current) => (current ? { ...current, targetId } : current))
                }
                onBeginMerge={beginMerge}
                onCommitMerge={commitMerge}
                onCancelMerge={() => setMergeDraft(null)}
                onRename={onRename}
                onArchive={onArchive}
                onDelete={onDelete}
                onMove={onMove}
              />

              {archived.length > 0 && (
                <RubricSubsection
                  label="Архив"
                  rubrics={archived}
                  allRubrics={scopeRubrics}
                  usage={usage}
                  mergeDraft={mergeDraft}
                  onMergeTargetChange={(targetId) =>
                    setMergeDraft((current) => (current ? { ...current, targetId } : current))
                  }
                  onBeginMerge={beginMerge}
                  onCommitMerge={commitMerge}
                  onCancelMerge={() => setMergeDraft(null)}
                  onRename={onRename}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onMove={onMove}
                />
              )}
            </div>
          );
        })}
      </div>
    </Group>
  );
}

function RubricSubsection({
  label,
  rubrics,
  allRubrics,
  usage,
  mergeDraft,
  onMergeTargetChange,
  onBeginMerge,
  onCommitMerge,
  onCancelMerge,
  onRename,
  onArchive,
  onDelete,
  onMove
}: {
  label: string;
  rubrics: Rubric[];
  allRubrics: Rubric[];
  usage: Map<string, number>;
  mergeDraft: { sourceId: string; targetId: string } | null;
  onMergeTargetChange: (targetId: string) => void;
  onBeginMerge: (rubric: Rubric) => void;
  onCommitMerge: () => void;
  onCancelMerge: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string, isArchived: boolean) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  if (rubrics.length === 0) {
    return (
      <div className="mono" style={{ padding: "5px 0 7px", fontSize: 8.5, color: "var(--ink-35)" }}>
        {label}: пусто
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div className="mono" style={{ padding: "5px 0 2px", fontSize: 8.5, color: "var(--ink-55)" }}>
        {label}
      </div>
      {rubrics.map((rubric) => {
        const used = usage.get(rubric.id) ?? 0;
        const targetOptions = allRubrics.filter((item) => item.id !== rubric.id && item.scope === rubric.scope);
        const mergeOpen = mergeDraft?.sourceId === rubric.id;
        const target = targetOptions.find((item) => item.id === mergeDraft?.targetId) ?? targetOptions[0];

        return (
          <div key={rubric.id} style={{ borderTop: "0.5px solid var(--hair)" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                padding: "8px 0",
                opacity: rubric.isArchived ? 0.62 : 1
              }}
            >
              <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
                <RubricTextInput
                  value={rubric.title}
                  onChange={(value) => onRename(rubric.id, value)}
                  ariaLabel={`Название рубрики ${rubric.title}`}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="mono tnum" style={{ fontSize: 8.5, color: "var(--ink-35)" }}>
                    {used} исп.
                  </span>
                  {isLegacyRubric(rubric) && (
                    <span className="mono" style={{ fontSize: 8.5, color: "var(--red)" }}>
                      legacy
                    </span>
                  )}
                  {rubric.isArchived && (
                    <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-35)" }}>
                      архив
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "end" }}>
                <button type="button" className="tap-highlight mono" onClick={() => onMove(rubric.id, -1)} style={tinyRubricButtonStyle()}>
                  ↑
                </button>
                <button type="button" className="tap-highlight mono" onClick={() => onMove(rubric.id, 1)} style={tinyRubricButtonStyle()}>
                  ↓
                </button>
                {targetOptions.length > 0 && (
                  <button
                    type="button"
                    className="tap-highlight mono"
                    onClick={() => onBeginMerge(rubric)}
                    style={rubricActionStyle("var(--blue)")}
                  >
                    Объединить
                  </button>
                )}
                {used === 0 ? (
                  <button
                    type="button"
                    className="tap-highlight mono"
                    onClick={() => onDelete(rubric.id)}
                    style={rubricActionStyle("var(--red)")}
                  >
                    Удалить
                  </button>
                ) : rubric.isArchived ? (
                  <button
                    type="button"
                    className="tap-highlight mono"
                    onClick={() => onArchive(rubric.id, false)}
                    style={rubricActionStyle()}
                  >
                    Вернуть
                  </button>
                ) : (
                  <button
                    type="button"
                    className="tap-highlight mono"
                    onClick={() => onArchive(rubric.id, true)}
                    style={rubricActionStyle()}
                  >
                    В архив
                  </button>
                )}
              </div>
            </div>

            {mergeOpen && target && (
              <div
                style={{
                  margin: "0 0 8px",
                  padding: "8px",
                  borderTop: "1px solid var(--blue)",
                  borderBottom: "0.5px solid var(--hair)"
                }}
              >
                <div className="slab" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Preview объединения
                </div>
                <div className="mono" style={{ marginTop: 5, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
                  Источник: {rubric.title}. Перенос: {used} операций. После объединения исходная рубрика уйдёт из
                  справочника, а операции будут ссылаться на выбранную рубрику этого же типа.
                </div>
                <select
                  value={target.id}
                  onChange={(event) => onMergeTargetChange(event.currentTarget.value)}
                  style={{
                    marginTop: 7,
                    width: "100%",
                    minHeight: 32,
                    border: "0.5px solid var(--ink-55)",
                    borderRadius: 0,
                    background: "var(--paper)",
                    color: "var(--ink)",
                    padding: "0 6px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5
                  }}
                >
                  {targetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      → {option.title} · {usage.get(option.id) ?? 0} исп.
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", justifyContent: "end", gap: 6, marginTop: 8 }}>
                  <button type="button" className="tap-highlight mono" onClick={onCancelMerge} style={rubricActionStyle()}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="tap-highlight mono"
                    onClick={onCommitMerge}
                    style={rubricActionStyle("var(--blue)")}
                  >
                    Объединить
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RubricScopeSelect({
  value,
  onChange
}: {
  value: RubricScope;
  onChange: (value: RubricScope) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.currentTarget.value as RubricScope)}
      style={{
        width: "100%",
        minHeight: 32,
        border: "0.5px solid var(--ink-55)",
        borderRadius: 0,
        background: "var(--paper)",
        color: "var(--ink)",
        padding: "0 6px",
        fontFamily: "var(--font-mono)",
        fontSize: 9.5
      }}
    >
      {RUBRIC_SCOPES.map((scope) => (
        <option key={scope} value={scope}>
          {RUBRIC_SCOPE_LABEL[scope]}
        </option>
      ))}
    </select>
  );
}

function RubricTextInput({
  value,
  onChange,
  placeholder,
  ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function commit(next = text) {
    const clean = next.trim();
    if (clean && clean !== value) onChange(clean);
  }

  return (
    <input
      value={text}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setText(next);
        onChange(next);
      }}
      onBlur={() => commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={{
        width: "100%",
        minWidth: 0,
        border: "none",
        borderBottom: "0.5px solid var(--ink-55)",
        background: "transparent",
        color: "var(--ink)",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        outline: "none",
        padding: "4px 0"
      }}
    />
  );
}

function rubricActionStyle(color = "var(--ink)") {
  return {
    border: `0.5px solid ${color}`,
    background: "transparent",
    color,
    padding: "5px 7px",
    fontFamily: "inherit",
    fontSize: 8.5,
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    whiteSpace: "nowrap" as const
  };
}

function tinyRubricButtonStyle() {
  return {
    border: "0.5px solid var(--ink-35)",
    background: "transparent",
    color: "var(--ink-55)",
    width: 24,
    height: 24,
    fontFamily: "inherit",
    cursor: "pointer"
  };
}
