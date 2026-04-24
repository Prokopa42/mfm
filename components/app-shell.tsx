"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, History, Home, PiggyBank, Settings, WalletCards } from "lucide-react";
import { ActionDialogs, type ActionDialogKind, type ActionPayload } from "@/components/action-dialogs";
import { TodayScreen } from "@/components/screens/today-screen";
import { CycleScreen } from "@/components/screens/cycle-screen";
import { SavingsScreen } from "@/components/screens/savings-screen";
import { HistoryScreen } from "@/components/screens/history-screen";
import { SettingsScreen } from "@/components/screens/settings-screen";
import { Badge } from "@/components/ui/badge";
import { calculateSnapshot, stateLabel } from "@/lib/calculations";
import { addDays, getFollowingPaycheckDate, getPaycheckSlotForDate, todayISO } from "@/lib/dates";
import { createInitialState } from "@/lib/sample-data";
import { clearFinanceState, useFinanceState } from "@/lib/storage";
import type { FinanceState, MandatoryPayment, SavingsGoal } from "@/lib/types";
import { cn, uid } from "@/lib/utils";

type Tab = "today" | "cycle" | "savings" | "history" | "settings";

const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "today", label: "Сегодня", icon: Home },
  { id: "cycle", label: "Цикл", icon: CalendarDays },
  { id: "savings", label: "Накопления", icon: PiggyBank },
  { id: "history", label: "История", icon: History },
  { id: "settings", label: "Настройки", icon: Settings }
];

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

      return {
        ...previous,
        goals: [
          ...previous.goals,
          {
            id: uid("goal"),
            title: goal.title,
            target: goal.target,
            deadline: goal.deadline,
            priority: goal.priority
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
    <div className="relative z-10 min-h-dvh bg-[var(--paper)]">
      <header className="sticky top-0 z-30 border-b-2 border-[var(--ink)] bg-[var(--paper)]">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <div className="grid h-10 w-10 grid-cols-2 border-2 border-[var(--ink)]">
            <span className="bg-[var(--red)]" />
            <span className="bg-[var(--yellow)]" />
            <span className="bg-[var(--blue)]" />
            <span className="bg-[var(--ink)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="slab text-xl uppercase leading-none">МФМ</div>
            <div className="truncate text-xs text-[var(--muted-ink)]">Можно потратить сегодня</div>
          </div>
          <Badge
            variant={
              snapshot.primaryState === "cash-risk" || snapshot.primaryState === "savings-off-track"
                ? "red"
                : snapshot.primaryState === "payday-arrived"
                  ? "blue"
                  : snapshot.primaryState === "normal"
                    ? "outline"
                    : "yellow"
            }
            className="hidden sm:inline-flex"
          >
            {stateLabel(snapshot.primaryState)}
          </Badge>
          <WalletCards className={cn("h-6 w-6", loaded ? "opacity-100" : "opacity-40")} />
        </div>
      </header>

      <main className="screen-safe-bottom mx-auto min-h-[calc(100dvh-66px)] max-w-4xl px-4 py-4">
        {screen[activeTab]}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-[var(--ink)] bg-[var(--paper)]">
        <div className="mx-auto grid max-w-4xl grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={cn(
                  "tap-highlight flex min-h-16 flex-col items-center justify-center gap-1 border-r-2 border-[var(--ink)] px-1 text-[10px] font-black uppercase last:border-r-0",
                  active ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--paper)] text-[var(--ink)]"
                )}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
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
