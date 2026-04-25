"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  Glyph,
  Group,
  Row,
  SegControl,
  SettingsCTA,
  StepControl
} from "@/components/mfm-ui";
import { Switch } from "@/components/ui/switch";
import type { CalculationSettings, FinanceState, MandatoryPayment } from "@/lib/types";

interface SettingsScreenProps {
  state: FinanceState;
  setState: Dispatch<SetStateAction<FinanceState>>;
  // Kept in props for shell wiring parity. Mandatory-payment add UI lives in
  // a future ActionDialog (step 11); reset is intentionally absent in hi-fi.
  onAddMandatoryPayment?: (payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onReset?: () => void;
}

interface SettingsDraft {
  settings: CalculationSettings;
  operationalBalance: number;
  savingsBalance: number;
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
    savingsBalance: state.savings.balance
  };
}

function clampDay(value: number) {
  return Math.min(31, Math.max(1, Math.round(value || 1)));
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
export function SettingsScreen({ state, setState }: SettingsScreenProps) {
  // applied = state (external), draft = local copy of editable fields
  const [draft, setDraft] = useState<SettingsDraft>(() => createSettingsDraft(state));
  // `dirty` is a sticky "user has touched the form" flag; while it's false,
  // external state changes (e.g. a new expense on Today) re-sync the draft.
  const [dirty, setDirty] = useState(false);

  const dirtyKeys = computeDirtyKeys(draft, state);
  const hasChanges = dirtyKeys.length > 0;
  const isDirty = (k: DraftKey) => dirtyKeys.includes(k);

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
    setState((previous) => ({
      ...previous,
      operationalBalance: draft.operationalBalance,
      settings: { ...draft.settings },
      reserve: { ...previous.reserve, amount: draft.settings.reserveAmount },
      savings: { ...previous.savings, balance: draft.savingsBalance }
    }));
    setDirty(false);
  }

  function cancelDraft() {
    setDraft(createSettingsDraft(state));
    setDirty(false);
  }

  const s = draft.settings;

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
        <Row label="День 1-й зарплаты" hint="число месяца" dirty={isDirty("payday1")}>
          <StepControl
            value={s.payday1}
            onChange={(v) => patchSettings({ payday1: clampDay(v) })}
            min={1}
            max={31}
            step={1}
          />
        </Row>
        <Row
          label="Сумма 1-й зарплаты"
          hint="₽ за выплату"
          dirty={isDirty("typicalPaycheck1")}
        >
          <StepControl
            value={s.typicalPaycheck1}
            onChange={(v) => patchSettings({ typicalPaycheck1: Math.max(0, v) })}
            min={0}
            max={1_000_000}
            step={1000}
            suffix=" ₽"
          />
        </Row>
        <Row label="День 2-й зарплаты" hint="число месяца" dirty={isDirty("payday2")}>
          <StepControl
            value={s.payday2}
            onChange={(v) => patchSettings({ payday2: clampDay(v) })}
            min={1}
            max={31}
            step={1}
          />
        </Row>
        <Row
          label="Сумма 2-й зарплаты"
          hint="₽ за выплату"
          dirty={isDirty("typicalPaycheck2")}
        >
          <StepControl
            value={s.typicalPaycheck2}
            onChange={(v) => patchSettings({ typicalPaycheck2: Math.max(0, v) })}
            min={0}
            max={1_000_000}
            step={1000}
            suffix=" ₽"
          />
        </Row>
      </Group>

      {/* ─── Group 2: Подушка ───────────────────────────── */}
      <Group title="Подушка" note="system reserve">
        <Row
          label="Размер подушки"
          hint="вычитается из свободного остатка"
          dirty={isDirty("reserveAmount")}
        >
          <StepControl
            value={s.reserveAmount}
            onChange={(v) => patchSettings({ reserveAmount: Math.max(0, v) })}
            min={0}
            max={1_000_000}
            step={1000}
            suffix=" ₽"
          />
        </Row>
      </Group>

      {/* ─── Group 3: Накопления ────────────────────────── */}
      <Group title="Накопления" note="balances">
        <Row
          label="Текущие накопления"
          hint="ручная корректировка котла"
          dirty={isDirty("savingsBalance")}
        >
          <StepControl
            value={draft.savingsBalance}
            onChange={(v) => patch((p) => ({ ...p, savingsBalance: Math.max(0, v) }))}
            min={0}
            max={10_000_000}
            step={1000}
            suffix=" ₽"
          />
        </Row>
        <Row
          label="Оперативный остаток"
          hint="ручная корректировка текущего контура"
          dirty={isDirty("operationalBalance")}
        >
          <StepControl
            value={draft.operationalBalance}
            onChange={(v) => patch((p) => ({ ...p, operationalBalance: Math.max(0, v) }))}
            min={0}
            max={10_000_000}
            step={1000}
            suffix=" ₽"
          />
        </Row>
        <Row
          label="Автовычитать плановые переводы"
          hint="из «доступно до зарплаты»"
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
          label="Учитывать сегодня в делителе"
          hint="как считается «можно сегодня»"
          dirty={isDirty("includeTodayInDivisor")}
        >
          <Switch
            checked={s.includeTodayInDivisor}
            onCheckedChange={(v) => patchSettings({ includeTodayInDivisor: v })}
          />
        </Row>
        <Row label="Округление" hint="шаг расчёта" dirty={isDirty("rounding")}>
          <SegControl
            value={s.rounding}
            onChange={(v) => patchSettings({ rounding: v })}
            options={[
              { id: "day", label: "день" },
              { id: "hour", label: "час" }
            ]}
          />
        </Row>
        <Row
          label="Коэф. покупательной силы"
          hint="0…1, для прогнозов в сегодняшних ₽"
          dirty={isDirty("purchasingPowerCoef")}
        >
          <StepControl
            value={Number(s.purchasingPowerCoef.toFixed(2))}
            onChange={(v) =>
              patchSettings({ purchasingPowerCoef: Math.min(1, Math.max(0, Number(v.toFixed(2)))) })
            }
            min={0}
            max={1}
            step={0.01}
          />
        </Row>
      </Group>

      <div style={{ flex: 1, minHeight: 14 }} />

      <SettingsCTA dirty={hasChanges} onApply={applyDraft} onDiscard={cancelDraft} />
    </div>
  );
}
