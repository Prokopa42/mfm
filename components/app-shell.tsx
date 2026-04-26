"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionDialogs, type ActionDialogKind, type ActionPayload } from "@/components/action-dialogs";
import { TodayScreen } from "@/components/screens/today-screen";
import { CycleScreen } from "@/components/screens/cycle-screen";
import {
  SavingsScreen,
  type SavingsAllocationPayload,
  type SavingsBucketId
} from "@/components/screens/savings-screen";
import { HistoryScreen } from "@/components/screens/history-screen";
import { SettingsScreen } from "@/components/screens/settings-screen";
import { TabBar, type TabItem } from "@/components/mfm-ui";
import { calculateSnapshot } from "@/lib/calculations";
import {
  addDays,
  compareDates,
  getFollowingPaycheckDate,
  getNextPaycheckDate,
  getPaycheckSlotForDate,
  getPreviousPaycheckDate,
  todayISO
} from "@/lib/dates";
import { createInitialState } from "@/lib/sample-data";
import { clearFinanceState, useFinanceState } from "@/lib/storage";
import type {
  Credit,
  CreditEvent,
  FinanceState,
  IncomeKind,
  MandatoryPayment,
  RubricScope,
  SavingsGoal
} from "@/lib/types";
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

function incomeKindLabel(kind: IncomeKind) {
  const labels: Record<IncomeKind, string> = {
    paycheck: "Зарплата",
    bonus: "Премия",
    other: "Доход"
  };
  return labels[kind];
}

function rubricTitle(state: FinanceState, categoryId?: string) {
  if (!categoryId) return undefined;
  return state.rubrics.find((rubric) => rubric.id === categoryId)?.title;
}

function defaultRubricId(state: FinanceState, scope: RubricScope, preferredTitle?: string) {
  const active = state.rubrics
    .filter((rubric) => rubric.scope === scope && !rubric.isArchived)
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));
  if (preferredTitle) {
    const preferred = active.find(
      (rubric) => rubric.title.trim().toLowerCase() === preferredTitle.trim().toLowerCase()
    );
    if (preferred) return preferred.id;
  }
  return active[0]?.id;
}

function getSavingsBucketAmount(state: FinanceState, bucketId: SavingsBucketId) {
  if (bucketId === "cushion") return Math.max(0, state.savings.cushion.allocated);

  if (bucketId === "unallocated") {
    const goalsAllocated = state.goals.reduce((sum, goal) => sum + goal.allocated, 0);
    return Math.max(0, state.savings.balance - state.savings.cushion.allocated - goalsAllocated);
  }

  const goalId = bucketId.slice("goal:".length);
  return Math.max(0, state.goals.find((goal) => goal.id === goalId)?.allocated ?? 0);
}

function creditEventEffect(event: CreditEvent) {
  if (event.kind === "charge") return event.amount;
  if (event.kind === "payment") return -event.amount;
  return event.amount;
}

function calculateCreditCurrentBalance(credit: Credit, events: CreditEvent[]) {
  return Math.max(
    0,
    credit.openingBalance +
      events
        .filter((event) => event.creditId === credit.id)
        .reduce((sum, event) => sum + creditEventEffect(event), 0)
  );
}

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
    updateState((previous) => {
      const expenseId = uid("expense");
      const title = payload.title || rubricTitle(previous, payload.categoryId) || payload.category || "Расход";
      const linkedCredit =
        payload.paymentSource === "credit" && payload.linkedCreditId
          ? previous.credits.find((credit) => credit.id === payload.linkedCreditId && !credit.isClosed)
          : undefined;
      const isCreditExpense = Boolean(linkedCredit);

      return {
        ...previous,
        operationalBalance: isCreditExpense
          ? previous.operationalBalance
          : previous.operationalBalance - payload.amount,
        variableExpenses: [
          {
            id: expenseId,
            amount: payload.amount,
            date: payload.date,
            paymentSource: isCreditExpense ? "credit" : "own",
            linkedCreditId: linkedCredit?.id,
            categoryId: payload.categoryId,
            category: payload.category,
            title,
            note: payload.note
          },
          ...previous.variableExpenses
        ],
        creditEvents: isCreditExpense
          ? [
              {
                id: uid("credit_event"),
                creditId: linkedCredit!.id,
                date: payload.date,
                kind: "charge" as const,
                amount: payload.amount,
                note: `Кредитный расход: ${title}`,
                linkedExpenseId: expenseId
              },
              ...previous.creditEvents
            ]
          : previous.creditEvents
      };
    });
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
          categoryId: payload.categoryId,
          title: payload.title || incomeKindLabel(payload.kind ?? "other"),
          note: payload.note
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
          linkedGoalId: payload.linkedGoalId,
          categoryId: payload.categoryId,
          title: payload.title || "В накопления",
          note: payload.note
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
            categoryId: payload.categoryId,
            title: payload.title || "Снятие с накоплений",
            note: payload.note,
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
            categoryId: defaultRubricId(previous, "income", "Работа"),
            title: paycheckLabel
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
          status: "scheduled",
          categoryId:
            payment.categoryId ??
            defaultRubricId(previous, "mandatory-payment")
        },
        ...previous.mandatoryPayments
      ]
    }));
  }

  function handleUpdateMandatoryPayment(paymentId: string, payment: Omit<MandatoryPayment, "id" | "status">) {
    updateState((previous) => ({
      ...previous,
      mandatoryPayments: previous.mandatoryPayments.map((item) =>
        item.id === paymentId && item.status !== "paid"
          ? {
              ...item,
              ...payment,
              categoryId:
                payment.categoryId ??
                item.categoryId ??
                defaultRubricId(previous, "mandatory-payment")
            }
          : item
      )
    }));
  }

  function handleDeleteMandatoryPayment(paymentId: string) {
    updateState((previous) => ({
      ...previous,
      mandatoryPayments: previous.mandatoryPayments.filter(
        (item) => !(item.id === paymentId && item.status !== "paid")
      )
    }));
  }

  function handleCancelMandatoryPayment(payment: MandatoryPayment) {
    const today = todayISO();
    updateState((previous) => {
      const target = previous.mandatoryPayments.find((item) => item.id === payment.id && item.status === "paid");
      if (!target) return previous;

      return {
        ...previous,
        operationalBalance: previous.operationalBalance + target.amount,
        mandatoryPayments: previous.mandatoryPayments.map((item) =>
          item.id === target.id
            ? {
                ...item,
                status: compareDates(item.dueDate, today) < 0 ? "missed" : "scheduled"
              }
            : item
        )
      };
    });
  }

  function handleSaveCredit(credit: Omit<Credit, "id"> & { id?: string }) {
    updateState((previous) => {
      if (credit.id) {
        return {
          ...previous,
          credits: previous.credits.map((item) =>
            item.id === credit.id
              ? {
                  ...item,
                  title: credit.title,
                  openedAt: credit.openedAt,
                  openingBalance: credit.openingBalance,
                  note: credit.note,
                  isClosed: credit.isClosed,
                  order: credit.order
                }
              : item
          )
        };
      }

      return {
        ...previous,
        credits: [
          ...previous.credits,
          {
            ...credit,
            id: uid("credit")
          }
        ]
      };
    });
  }

  function handleAddCreditEvent(event: Omit<CreditEvent, "id">) {
    updateState((previous) => {
      if (
        event.kind === "payment" &&
        event.linkedMandatoryPaymentId &&
        previous.creditEvents.some(
          (item) =>
            item.kind === "payment" &&
            item.linkedMandatoryPaymentId === event.linkedMandatoryPaymentId
        )
      ) {
        return previous;
      }

      return {
        ...previous,
        creditEvents: [
          {
            ...event,
            id: uid("credit_event")
          },
          ...previous.creditEvents
        ]
      };
    });
  }

  function handleDeleteCreditEvent(eventId: string) {
    updateState((previous) => ({
      ...previous,
      creditEvents: previous.creditEvents.filter((event) => event.id !== eventId)
    }));
  }

  function handleToggleCreditClosed(creditId: string, isClosed: boolean) {
    updateState((previous) => ({
      ...previous,
      credits: previous.credits.map((credit) =>
        credit.id === creditId ? { ...credit, isClosed } : credit
      )
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
                  priority: goal.priority,
                  plannedPace: goal.plannedPace
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

  function handleAllocateSavings(payload: SavingsAllocationPayload) {
    updateState((previous) => {
      const amount = Math.max(0, payload.amount);
      if (amount <= 0 || payload.sourceId === payload.targetId) return previous;

      const sourceAvailable = getSavingsBucketAmount(previous, payload.sourceId);
      if (amount > sourceAvailable) return previous;

      const goalDeltas = new Map<string, number>();
      let cushionDelta = 0;

      function applyStoredBucketDelta(bucketId: SavingsBucketId, delta: number) {
        if (bucketId === "unallocated") return;

        if (bucketId === "cushion") {
          cushionDelta += delta;
          return;
        }

        if (bucketId.startsWith("goal:")) {
          const goalId = bucketId.slice("goal:".length);
          goalDeltas.set(goalId, (goalDeltas.get(goalId) ?? 0) + delta);
        }
      }

      applyStoredBucketDelta(payload.sourceId, -amount);
      applyStoredBucketDelta(payload.targetId, amount);

      return {
        ...previous,
        savings: {
          ...previous.savings,
          cushion: {
            ...previous.savings.cushion,
            allocated: Math.max(0, previous.savings.cushion.allocated + cushionDelta)
          }
        },
        goals: previous.goals.map((goal) => {
          const delta = goalDeltas.get(goal.id) ?? 0;
          return delta === 0 ? goal : { ...goal, allocated: Math.max(0, goal.allocated + delta) };
        })
      };
    });
  }

  function handleReset() {
    clearFinanceState();
    setFinanceState(createInitialState());
    setActiveTab("today");
  }

  function handleGoLive(keepMandatoryPaymentIds: string[]) {
    const today = todayISO();
    const keepIds = new Set(keepMandatoryPaymentIds);

    updateState((previous) => {
      const nextPaycheck = getNextPaycheckDate(today, previous.settings);
      const previousPaycheck = getPreviousPaycheckDate(today, previous.settings);
      const nextPaycheckSlot = getPaycheckSlotForDate(nextPaycheck, previous.settings);
      const expectedIncome =
        nextPaycheckSlot === "payday2"
          ? previous.settings.typicalPaycheck2
          : nextPaycheckSlot === "payday1"
            ? previous.settings.typicalPaycheck1
            : previous.payCycle.expectedIncome;

      return {
        ...previous,
        payCycle: {
          id: uid("cycle"),
          startDate: previousPaycheck,
          endDate: addDays(nextPaycheck, -1),
          openingOperational: previous.operationalBalance,
          expectedIncome
        },
        incomes: [],
        variableExpenses: [],
        transfersToSavings: [],
        withdrawalsFromSavings: [],
        mandatoryPayments: previous.mandatoryPayments.filter(
          (payment) =>
            payment.status === "scheduled" &&
            compareDates(payment.dueDate, today) >= 0 &&
            keepIds.has(payment.id)
        ),
        savings: {
          ...previous.savings,
          openedAt: today,
          baselineBalance: previous.savings.balance
        },
        credits: previous.credits.map((credit) => {
          const currentBalance = calculateCreditCurrentBalance(credit, previous.creditEvents);
          return {
            ...credit,
            openedAt: today,
            openingBalance: currentBalance,
            isClosed: currentBalance > 0 ? false : credit.isClosed
          };
        }),
        creditEvents: []
      };
    });
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
        onAddMandatoryPayment={handleAddMandatoryPayment}
        onUpdateMandatoryPayment={handleUpdateMandatoryPayment}
        onDeleteMandatoryPayment={handleDeleteMandatoryPayment}
        onCancelMandatoryPayment={handleCancelMandatoryPayment}
        onSaveCredit={handleSaveCredit}
        onAddCreditEvent={handleAddCreditEvent}
        onDeleteCreditEvent={handleDeleteCreditEvent}
        onToggleCreditClosed={handleToggleCreditClosed}
        rubrics={financeState.rubrics}
      />
    ),
    savings: (
      <SavingsScreen
        state={financeState}
        snapshot={snapshot}
        onAction={setActiveDialog}
        onAllocate={handleAllocateSavings}
        onSaveGoal={handleSaveGoal}
        onDeleteGoal={handleDeleteGoal}
      />
    ),
    history: <HistoryScreen state={financeState} snapshot={snapshot} onAction={setActiveDialog} />,
    settings: (
      <SettingsScreen
        state={financeState}
        setState={setFinanceState}
        onAddMandatoryPayment={handleAddMandatoryPayment}
        onReset={handleReset}
        onGoLive={handleGoLive}
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
        rubrics={financeState.rubrics}
        credits={financeState.credits}
        creditEvents={financeState.creditEvents}
        onOpenChange={setActiveDialog}
        onExpense={handleExpense}
        onIncome={handleIncome}
        onTransfer={handleTransfer}
        onWithdraw={handleWithdraw}
      />
    </div>
  );
}
