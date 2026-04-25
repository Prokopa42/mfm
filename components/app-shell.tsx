"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionDialogs, type ActionDialogKind, type ActionPayload } from "@/components/action-dialogs";
import { TodayScreen } from "@/components/screens/today-screen";
import { CycleScreen } from "@/components/screens/cycle-screen";
import { SavingsScreen } from "@/components/screens/savings-screen";
import { HistoryScreen } from "@/components/screens/history-screen";
import { SettingsScreen } from "@/components/screens/settings-screen";
import { TabBar, type TabItem } from "@/components/mfm-ui";
import { calculateSnapshot } from "@/lib/calculations";
import { addDays, getFollowingPaycheckDate, getPaycheckSlotForDate, todayISO } from "@/lib/dates";
import { createInitialState } from "@/lib/sample-data";
import { clearFinanceState, useFinanceState } from "@/lib/storage";
import type { FinanceState, MandatoryPayment, SavingsGoal } from "@/lib/types";
import { uid } from "@/lib/utils";

type Tab = "today" | "cycle" | "savings" | "history" | "settings";

/**
 * Tab definitions — single source for both bottom TabBar and the section
 * label in the top header strip. Shape mapping mirrors hifi-primitives.jsx
 * exactly: circle → Сегодня, bar → Цикл, square → Накоп., triangle →
 * История, halfcircle → Настр.
 */
const TABS: TabItem[] = [
  { id: "today", label: "Сегодня", shape: "circle" },
  { id: "cycle", label: "Цикл", shape: "bar" },
  { id: "savings", label: "Накопления", shape: "square" },
  { id: "history", label: "История", shape: "triangle" },
  { id: "settings", label: "Настройки", shape: "halfcircle" }
];

const APP_FRAME_MAX = 430;

export function AppShell() {
  const [financeState, setFinanceState, loaded] = useFinanceState();
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [activeDialog, setActiveDialog] = useState<ActionDialogKind>(null);
  const snapshot = useMemo(() => calculateSnapshot(financeState), [financeState]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  function updateState(updater: (previous: FinanceState) => FinanceState) {
    setFinanceState((previous) => updater(previous));
  }

  function handleExpense(payload: ActionPayload) {
    updateState((previous) => ({
      ...previous,
      operationalBalance: previous.operationalBalance - payload.amount,
      variableExpenses: [
        {
          id: uid("expense"),
          amount: payload.amount,
          date: payload.date,
          category: payload.title || "Расход",
          note: payload.note
        },
        ...previous.variableExpenses
      ]
    }));
  }

  function handleIncome(payload: ActionPayload) {
    updateState((previous) => ({
      ...previous,
      operationalBalance: previous.operationalBalance + payload.amount,
      incomes: [
        {
          id: uid("income"),
          amount: payload.amount,
          expectedDate: payload.date,
          receivedDate: payload.date,
          kind: payload.kind ?? "other",
          note: payload.title || payload.note
        },
        ...previous.incomes
      ]
    }));
  }

  function handleTransfer(payload: ActionPayload) {
    updateState((previous) => ({
      ...previous,
      operationalBalance: payload.planned
        ? previous.operationalBalance
        : previous.operationalBalance - payload.amount,
      savings: payload.planned
        ? previous.savings
        : {
            ...previous.savings,
            balance: previous.savings.balance + payload.amount
          },
      transfersToSavings: [
        {
          id: uid("transfer"),
          amount: payload.amount,
          date: payload.date,
          planned: Boolean(payload.planned),
          note: payload.title || payload.note
        },
        ...previous.transfersToSavings
      ]
    }));
  }

  function handleWithdraw(payload: ActionPayload) {
    updateState((previous) => {
      const amount = Math.min(payload.amount, previous.savings.balance);
      return {
        ...previous,
        operationalBalance: previous.operationalBalance + amount,
        savings: {
          ...previous.savings,
          balance: previous.savings.balance - amount
        },
        withdrawalsFromSavings: [
          {
            id: uid("withdrawal"),
            amount,
            date: payload.date,
            reason: payload.title || payload.note
          },
          ...previous.withdrawalsFromSavings
        ]
      };
    });
  }

  function handleConfirmPaycheck() {
    const today = todayISO();
    updateState((previous) => {
      const paycheckSlot = getPaycheckSlotForDate(today, previous.settings);
      const amount =
        paycheckSlot === "payday2"
          ? previous.settings.typicalPaycheck2
          : paycheckSlot === "payday1"
            ? previous.settings.typicalPaycheck1
            : previous.payCycle.expectedIncome;
      const paycheckLabel = paycheckSlot === "payday2" ? "2-я зарплата" : "1-я зарплата";
      const nextPaycheck = getFollowingPaycheckDate(today, previous.settings);
      return {
        ...previous,
        operationalBalance: previous.operationalBalance + amount,
        payCycle: {
          id: uid("cycle"),
          startDate: today,
          endDate: addDays(nextPaycheck, -1),
          openingOperational: previous.operationalBalance + amount,
          expectedIncome: amount
        },
        incomes: [
          {
            id: uid("income"),
            amount,
            expectedDate: today,
            receivedDate: today,
            kind: "paycheck",
            note: paycheckLabel
          },
          ...previous.incomes
        ]
      };
    });
  }

  function handleMarkPaymentPaid(payment: MandatoryPayment) {
    updateState((previous) => ({
      ...previous,
      operationalBalance: previous.operationalBalance - payment.amount,
      mandatoryPayments: previous.mandatoryPayments.map((item) =>
        item.id === payment.id ? { ...item, status: "paid" } : item
      )
    }));
  }

  function handleAddMandatoryPayment(payment: Omit<MandatoryPayment, "id" | "status">) {
    updateState((previous) => ({
      ...previous,
      mandatoryPayments: [
        {
          ...payment,
          id: uid("payment"),
          status: "scheduled"
        },
        ...previous.mandatoryPayments
      ]
    }));
  }

  function handleSaveGoal(goal: Omit<SavingsGoal, "id"> & { id?: string }) {
    updateState((previous) => {
      if (goal.id) {
        return {
          ...previous,
          goals: previous.goals.map((item) =>
            item.id === goal.id
              ? {
                  ...item,
                  title: goal.title,
                  target: goal.target,
                  deadline: goal.deadline,
                  priority: goal.priority
                }
              : item
          )
        };
      }

      // New goals start in "unconfigured" state — allocated and plannedPace
      // both default to 0 until the user explicitly distributes the pot or
      // sets a planned pace (managed in Savings screen, step 9).
      return {
        ...previous,
        goals: [
          ...previous.goals,
          {
            id: uid("goal"),
            title: goal.title,
            target: goal.target,
            deadline: goal.deadline,
            priority: goal.priority,
            allocated: goal.allocated ?? 0,
            plannedPace: goal.plannedPace ?? 0
          }
        ]
      };
    });
  }

  function handleDeleteGoal(goalId: string) {
    updateState((previous) => ({
      ...previous,
      goals: previous.goals.filter((goal) => goal.id !== goalId),
      transfersToSavings: previous.transfersToSavings.map((transfer) =>
        transfer.linkedGoalId === goalId ? { ...transfer, linkedGoalId: undefined } : transfer
      )
    }));
  }

  function handleReset() {
    clearFinanceState();
    setFinanceState(createInitialState());
    setActiveTab("today");
  }

  const screen = {
    today: (
      <TodayScreen
        state={financeState}
        snapshot={snapshot}
        onAction={setActiveDialog}
        onConfirmPaycheck={handleConfirmPaycheck}
      />
    ),
    cycle: (
      <CycleScreen
        state={financeState}
        snapshot={snapshot}
        onAction={setActiveDialog}
        onMarkPaymentPaid={handleMarkPaymentPaid}
      />
    ),
    savings: (
      <SavingsScreen
        state={financeState}
        snapshot={snapshot}
        onAction={setActiveDialog}
        onSaveGoal={handleSaveGoal}
        onDeleteGoal={handleDeleteGoal}
      />
    ),
    history: <HistoryScreen state={financeState} onAction={setActiveDialog} />,
    settings: (
      <SettingsScreen
        state={financeState}
        setState={setFinanceState}
        onAddMandatoryPayment={handleAddMandatoryPayment}
        onReset={handleReset}
      />
    )
  } satisfies Record<Tab, React.ReactNode>;

  return (
    <div className="relative z-10 min-h-dvh" style={{ background: "var(--paper)" }}>
      {/* ─── Main — no horizontal padding; screens own pad-x=18 ─── */}
      <main
        className="screen-safe-bottom mx-auto"
        style={{ minHeight: "100dvh", maxWidth: APP_FRAME_MAX }}
        aria-busy={!loaded}
      >
        {screen[activeTab]}
      </main>

      {/* ─── Bottom nav — TabBar primitive in fixed wrapper ─────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{ background: "var(--paper)" }}
      >
        <div className="mx-auto" style={{ maxWidth: APP_FRAME_MAX }}>
          <TabBar
            items={TABS}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as Tab)}
          />
        </div>
      </nav>

      <ActionDialogs
        active={activeDialog}
        snapshot={snapshot}
        onOpenChange={setActiveDialog}
        onExpense={handleExpense}
        onIncome={handleIncome}
        onTransfer={handleTransfer}
        onWithdraw={handleWithdraw}
      />
    </div>
  );
}
