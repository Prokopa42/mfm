"use client";

import { useEffect, useState } from "react";
import { calculateDailyCheckOutcome } from "@/lib/calculations";
import { todayISO } from "@/lib/dates";
import { createInitialState, DEFAULT_RUBRICS } from "@/lib/sample-data";
import type { DailyCheck, FinanceState, Rubric, RubricScope } from "@/lib/types";

const STORAGE_KEY = "mfm.finance-state.v1";
const TEMP_DEMO_STORAGE_KEY = "mfm.finance-state.v1.demo-savings-pass-1";

/**
 * Inline migration v1 → v2 (savings-pot model).
 *  - adds savings.cushion = { allocated: 0, target: 0 }
 *  - adds per-goal allocated = 0, plannedPace = 0
 * Quiet-on-migration: новые поля выставляются в нейтральное состояние,
 * чтобы пользователь не получил ложный alarm после bump'а.
 */
function migrateV1ToV2(prev: Record<string, unknown>): Record<string, unknown> {
  const prevSavings = (prev.savings ?? {}) as Record<string, unknown>;
  const prevGoals = (prev.goals ?? []) as Record<string, unknown>[];
  return {
    ...prev,
    schemaVersion: 2,
    savings: {
      ...prevSavings,
      cushion: { allocated: 0, target: 0 }
    },
    goals: prevGoals.map((g) => ({
      ...g,
      allocated: 0,
      plannedPace: 0
    }))
  };
}

function normalizeTitle(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function makeLegacyRubricId(scope: RubricScope, title: string, index: number) {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || `legacy_${index}`;
  return `rubric_${scope}_legacy_${slug}`;
}

function ensureRubric(
  rubrics: Rubric[],
  scope: RubricScope,
  title: string,
  createdIds: Map<string, string>
) {
  const normalized = normalizeTitle(title);
  const key = `${scope}:${normalized}`;
  const existing = rubrics.find((rubric) => rubric.scope === scope && normalizeTitle(rubric.title) === normalized);
  if (existing) return existing.id;
  const created = createdIds.get(key);
  if (created) return created;

  const order =
    Math.max(0, ...rubrics.filter((rubric) => rubric.scope === scope).map((rubric) => rubric.order)) + 10;
  const id = makeLegacyRubricId(scope, title, createdIds.size + 1);
  rubrics.push({
    id,
    title,
    scope,
    order,
    isArchived: false
  });
  createdIds.set(key, id);
  return id;
}

function migrateV2ToV3(prev: Record<string, unknown>): FinanceState {
  const rubrics: Rubric[] = DEFAULT_RUBRICS.map((rubric) => ({ ...rubric }));
  const createdIds = new Map<string, string>();
  const variableExpenses = ((prev.variableExpenses ?? []) as Record<string, unknown>[]).map((expense) => {
    if (typeof expense.categoryId === "string" && expense.categoryId) return expense;
    const legacyCategory = typeof expense.category === "string" ? expense.category.trim() : "";
    if (!legacyCategory) return expense;
    return {
      ...expense,
      categoryId: ensureRubric(rubrics, "expense", legacyCategory, createdIds)
    };
  });

  return {
    ...prev,
    schemaVersion: 3,
    rubrics,
    variableExpenses
  } as unknown as FinanceState;
}

function migrateV3ToV4(prev: Record<string, unknown>): FinanceState {
  return {
    ...prev,
    schemaVersion: 4,
    credits: Array.isArray(prev.credits) ? prev.credits : []
  } as unknown as FinanceState;
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeDailyCheck(check: DailyCheck): DailyCheck {
  const normalized: DailyCheck = {
    ...check,
    morningBalance: optionalNumber(check.morningBalance),
    eveningBalance: optionalNumber(check.eveningBalance),
    incomeAmount: optionalNumber(check.incomeAmount),
    transferToSavingsAmount: optionalNumber(check.transferToSavingsAmount),
    withdrawalFromSavingsAmount: optionalNumber(check.withdrawalFromSavingsAmount),
    mandatoryPaidAmount: optionalNumber(check.mandatoryPaidAmount),
    quickSpentAmount: optionalNumber(check.quickSpentAmount),
    creditSpentAmount: optionalNumber(check.creditSpentAmount),
    creditPaymentAmount: optionalNumber(check.creditPaymentAmount),
    plannedLimit: Math.max(0, toNumber(check.plannedLimit))
  };
  const outcome = calculateDailyCheckOutcome(normalized);

  return {
    ...normalized,
    grossOutflow: outcome.grossOutflow,
    freeSpent: outcome.freeSpent,
    delta: outcome.delta,
    calculatedEveningBalance: outcome.calculatedEveningBalance,
    status: outcome.status
  };
}

function migrateV4ToV5(prev: Record<string, unknown>): FinanceState {
  const migrationDate = todayISO();
  const prevCredits = Array.isArray(prev.credits) ? (prev.credits as Record<string, unknown>[]) : [];
  const credits = prevCredits.map((credit, index) => ({
    id: typeof credit.id === "string" ? credit.id : `credit_migrated_${index + 1}`,
    title: typeof credit.title === "string" ? credit.title : "Долг",
    openedAt: typeof credit.openedAt === "string" ? credit.openedAt : migrationDate,
    openingBalance: toNumber(credit.openingBalance, toNumber(credit.balance)),
    creditLimit: optionalPositiveNumber(credit.creditLimit),
    note: typeof credit.note === "string" ? credit.note : undefined,
    isClosed: Boolean(credit.isClosed),
    order: toNumber(credit.order, (index + 1) * 10)
  }));

  return {
    ...prev,
    schemaVersion: 5,
    credits,
    creditEvents: Array.isArray(prev.creditEvents) ? prev.creditEvents : []
  } as unknown as FinanceState;
}

function migrateV5ToV6(prev: Record<string, unknown>): FinanceState {
  return {
    ...prev,
    schemaVersion: 6,
    dailyChecks: Array.isArray(prev.dailyChecks) ? prev.dailyChecks : []
  } as unknown as FinanceState;
}

function normalizeFinanceState(state: FinanceState): FinanceState {
  const operationalBalance = Math.max(0, toNumber(state.operationalBalance));
  const desiredReserveAmount = Math.max(0, toNumber(state.settings.reserveAmount, state.reserve.amount));
  const reserveAmount = Math.min(desiredReserveAmount, operationalBalance);
  const rubrics = Array.isArray(state.rubrics) ? [...state.rubrics] : [];

  DEFAULT_RUBRICS.forEach((rubric) => {
    if (!rubrics.some((item) => item.id === rubric.id)) {
      rubrics.push({ ...rubric });
    }
  });
  const normalizedRubrics = rubrics.map((rubric) =>
    rubric.id === "rubric_payment_credit" && rubric.title === "Кредит"
      ? { ...rubric, title: "Долг" }
      : rubric
  );

  return {
    ...state,
    rubrics: normalizedRubrics,
    operationalBalance,
    settings: {
      ...state.settings,
      reserveAmount: desiredReserveAmount
    },
    reserve: {
      ...state.reserve,
      amount: reserveAmount
    },
    dailyChecks: Array.isArray(state.dailyChecks)
      ? state.dailyChecks.map((check) => normalizeDailyCheck(check))
      : [],
    credits: Array.isArray(state.credits)
      ? state.credits.map((credit) => ({
          ...credit,
          openingBalance: Math.max(0, toNumber(credit.openingBalance)),
          creditLimit: optionalPositiveNumber(credit.creditLimit)
        }))
      : []
  };
}

function migrateStoredState(parsed: unknown): FinanceState | null {
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion === 6) return normalizeFinanceState(parsed as FinanceState);
  if (record.schemaVersion === 5) return normalizeFinanceState(migrateV5ToV6(record));
  if (record.schemaVersion === 4) {
    return normalizeFinanceState(migrateV5ToV6(migrateV4ToV5(record) as unknown as Record<string, unknown>));
  }
  if (record.schemaVersion === 3) {
    return normalizeFinanceState(
      migrateV5ToV6(
        migrateV4ToV5(migrateV3ToV4(record) as unknown as Record<string, unknown>) as unknown as Record<string, unknown>
      )
    );
  }
  if (record.schemaVersion === 2) {
    return normalizeFinanceState(
      migrateV5ToV6(
        migrateV4ToV5(
        migrateV3ToV4(migrateV2ToV3(record) as unknown as Record<string, unknown>) as unknown as Record<string, unknown>
        ) as unknown as Record<string, unknown>
      )
    );
  }
  if (record.schemaVersion === 1) {
    return normalizeFinanceState(
      migrateV5ToV6(
        migrateV4ToV5(
        migrateV3ToV4(
          migrateV2ToV3(migrateV1ToV2(record)) as unknown as Record<string, unknown>
        ) as unknown as Record<string, unknown>
        ) as unknown as Record<string, unknown>
      )
    );
  }
  return null;
}

export function useFinanceState() {
  const [state, setState] = useState<FinanceState>(() => createInitialState());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stableRaw = window.localStorage.getItem(STORAGE_KEY);
      const stableState = stableRaw ? migrateStoredState(JSON.parse(stableRaw)) : null;
      if (stableState) {
        setState(stableState);
      } else {
        const tempRaw = window.localStorage.getItem(TEMP_DEMO_STORAGE_KEY);
        const tempState = tempRaw ? migrateStoredState(JSON.parse(tempRaw)) : null;
        if (tempState) {
          setState(tempState);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tempState));
          window.localStorage.removeItem(TEMP_DEMO_STORAGE_KEY);
        }
        // unknown / future versions ignored — fall back to default sample state
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [loaded, state]);

  return [state, setState, loaded] as const;
}

export function clearFinanceState() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(TEMP_DEMO_STORAGE_KEY);
}
