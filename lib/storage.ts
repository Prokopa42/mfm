"use client";

import { useEffect, useState } from "react";
import { createInitialState } from "@/lib/sample-data";
import type { FinanceState } from "@/lib/types";

const STORAGE_KEY = "mfm.finance-state.v1";

export function useFinanceState() {
  const [state, setState] = useState<FinanceState>(() => createInitialState());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FinanceState;
        if (parsed.schemaVersion === 1) {
          setState(parsed);
        }
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
