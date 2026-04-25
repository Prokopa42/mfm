"use client";

import { useEffect, useState } from "react";
import { createInitialState } from "@/lib/sample-data";
import type { FinanceState } from "@/lib/types";

const STORAGE_KEY = "mfm.finance-state.v1";

/**
 * Inline migration v1 → v2 (savings-pot model).
 *  - adds savings.cushion = { allocated: 0, target: 0 }
 *  - adds per-goal allocated = 0, plannedPace = 0
 * Quiet-on-migration: новые поля выставляются в нейтральное состояние,
 * чтобы пользователь не получил ложный alarm после bump'а.
 */
function migrateV1ToV2(prev: Record<string, unknown>): FinanceState {
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
  } as FinanceState;
}

export function useFinanceState() {
  const [state, setState] = useState<FinanceState>(() => createInitialState());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.schemaVersion === 2) {
          setState(parsed as FinanceState);
        } else if (parsed?.schemaVersion === 1) {
          setState(migrateV1ToV2(parsed));
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
}
