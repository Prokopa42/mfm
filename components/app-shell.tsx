"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionDialogs, type ActionDialogKind, type ActionPayload } from "@/components/action-dialogs";
import {
  DailyCheckDialog,
  type DailyCheckDialogMode,
  type DailyCheckPayload
} from "@/components/daily-check-dialog";
import { QuickExpenseDialog, type QuickExpensePayload } from "@/components/quick-expense-dialog";
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
import { calculateDailyCheckOutcome, calculateSnapshot } from "@/lib/calculations";
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
  DailyCheck,
  ExpensePaymentSource,
  FinanceState,
  HistoryItemKind,
  IncomeKind,
  ISODate,
  MandatoryPayment,
  RubricScope,
  SavingsGoal
} from "@/lib/types";
import { uid } from "@/lib/utils";

type Tab = "today" | "cycle" | "savings" | "history" | "settings";

/**
 * Tab definitions — single source for both bottom TabBar and the section
 * label in the top header strip. Shape mapping mirrors hifi-primitives.jsx:
 * circle → Сегодня, bar → Цикл, square → Накоп., triangle → Дневник,
 * halfcircle → Настр.
 */
const TABS: TabItem[] = [
  { id: "today", label: "Сегодня", shape: "circle" },
  { id: "cycle", label: "Цикл", shape: "bar" },
  { id: "savings", label: "Накопления", shape: "square" },
  { id: "history", label: "Дневник", shape: "triangle" },
  { id: "settings", label: "Настройки", shape: "halfcircle" }
];

const APP_FRAME_MAX = 430;

function positiveAmount(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function applyEffectiveCycleReserve(state: FinanceState): FinanceState {
  const operationalBalance = positiveAmount(state.operationalBalance);
  const desiredReserveAmount = positiveAmount(state.settings.reserveAmount);
  const reserveAmount = Math.min(desiredReserveAmount, operationalBalance);

  if (
    operationalBalance === state.operationalBalance &&
    desiredReserveAmount === state.settings.reserveAmount &&
    reserveAmount === state.reserve.amount
  ) {
    return state;
  }

  return {
    ...state,
    operationalBalance,
    settings: {
      ...state.settings,
      reserveAmount: desiredReserveAmount
    },
    reserve: {
      ...state.reserve,
      amount: reserveAmount
    }
  };
}

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

function quickCreditSpentAmount(check?: DailyCheck) {
  return (check?.quickSpentEntries ?? [])
    .filter((entry) => entry.operation !== "credit-payment" && entry.paymentSource === "credit")
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function keepNonEveningCreditEvent(event: CreditEvent, dailyCheckId: string) {
  return event.linkedDailyCheckId !== dailyCheckId || Boolean(event.linkedQuickSpentEntryId);
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

function dailyAmountsForDate(state: FinanceState, date: string) {
  return {
    incomeAmount: state.incomes
      .filter((income) => income.receivedDate === date)
      .reduce((sum, income) => sum + income.amount, 0),
    transferToSavingsAmount: state.transfersToSavings
      .filter((transfer) => !transfer.planned && transfer.date === date)
      .reduce((sum, transfer) => sum + transfer.amount, 0),
    withdrawalFromSavingsAmount: state.withdrawalsFromSavings
      .filter((withdrawal) => withdrawal.date === date)
      .reduce((sum, withdrawal) => sum + withdrawal.amount, 0),
    mandatoryPaidAmount: state.mandatoryPayments
      .filter(
        (payment) =>
          payment.status === "paid" &&
          (payment.paidDate ?? payment.dueDate) === date &&
          payment.paidFrom !== "credit" &&
          !payment.linkedGoalId
      )
      .reduce((sum, payment) => sum + payment.amount, 0)
  };
}

function upsertDailyCheck(
  state: FinanceState,
  date: string,
  patch: Partial<Omit<DailyCheck, "id" | "date">>,
  createIfMissing = false,
  forcedId?: string
) {
  const existing = state.dailyChecks.find((check) => check.date === date);
  if (!existing && !createIfMissing) return state;

  const merged: DailyCheck = {
    id: existing?.id ?? forcedId ?? uid("daily_check"),
    date,
    status: "draft",
    plannedLimit:
      patch.plannedLimit ??
      existing?.plannedLimit ??
      Math.round(calculateSnapshot(state, date).safeToSpendToday),
    ...existing,
    ...dailyAmountsForDate(state, date),
    ...patch
  };
  const outcome = calculateDailyCheckOutcome(merged);
  const nextCheck = { ...merged, ...outcome };

  return {
    ...state,
    dailyChecks: existing
      ? state.dailyChecks.map((check) => (check.id === existing.id ? nextCheck : check))
      : [nextCheck, ...state.dailyChecks]
  };
}

export function AppShell() {
  const [financeState, setFinanceState, loaded] = useFinanceState();
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [activeDialog, setActiveDialog] = useState<ActionDialogKind>(null);
  const [activeDailyCheckDialog, setActiveDailyCheckDialog] = useState<DailyCheckDialogMode | null>(null);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const snapshot = useMemo(() => calculateSnapshot(financeState), [financeState]);
  const todayCheck = financeState.dailyChecks.find((check) => check.date === snapshot.today);
  const previousDayCheck = financeState.dailyChecks.find((check) => check.date === addDays(snapshot.today, -1));
  const previousEveningBalance =
    previousDayCheck?.eveningBalance ?? previousDayCheck?.calculatedEveningBalance;

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  function updateState(updater: (previous: FinanceState) => FinanceState) {
    setFinanceState((previous) => applyEffectiveCycleReserve(updater(previous)));
  }

  function setFinanceStateFromScreen(value: FinanceState | ((previous: FinanceState) => FinanceState)) {
    setFinanceState((previous) => applyEffectiveCycleReserve(typeof value === "function" ? value(previous) : value));
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
      if (!isCreditExpense && previous.operationalBalance < payload.amount) return previous;

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
                note: `Расход в долг: ${title}`,
                linkedExpenseId: expenseId
              },
              ...previous.creditEvents
            ]
          : previous.creditEvents
      };
    });
  }

  function handleIncome(payload: ActionPayload) {
    updateState((previous) => {
      const nextState = {
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
      };
      return upsertDailyCheck(nextState, payload.date, {}, false);
    });
  }

  function handleTransfer(payload: ActionPayload) {
    updateState((previous) => {
      if (!payload.planned && previous.operationalBalance < payload.amount) return previous;
      const linkedGoalForTitle = payload.linkedGoalId
        ? previous.goals.find((goal) => goal.id === payload.linkedGoalId)
        : undefined;
      const linkedGoal = !payload.planned ? linkedGoalForTitle : undefined;
      const linkedCushion = !payload.planned && payload.linkedSavingsBucket === "cushion";
      const transferTitle =
        payload.title ||
        (linkedGoalForTitle ? `На цель: ${linkedGoalForTitle.title}` : undefined) ||
        (payload.linkedSavingsBucket === "cushion" ? "В копилку" : undefined) ||
        "В накопления";
      const nextState = {
        ...previous,
        operationalBalance: payload.planned
          ? previous.operationalBalance
          : previous.operationalBalance - payload.amount,
        savings: payload.planned
          ? previous.savings
          : {
              ...previous.savings,
              balance: previous.savings.balance + payload.amount,
              cushion: linkedCushion
                ? {
                    ...previous.savings.cushion,
                    allocated: previous.savings.cushion.allocated + payload.amount
                  }
                : previous.savings.cushion
            },
        goals: linkedGoal
          ? previous.goals.map((goal) =>
              goal.id === linkedGoal.id
                ? {
                    ...goal,
                    allocated: goal.allocated + payload.amount
                  }
                : goal
            )
          : previous.goals,
        transfersToSavings: [
          {
            id: uid("transfer"),
            amount: payload.amount,
            date: payload.date,
            planned: Boolean(payload.planned),
            linkedGoalId: payload.linkedGoalId,
            linkedSavingsBucket: payload.linkedSavingsBucket,
            categoryId: payload.categoryId,
            title: transferTitle,
            note: payload.note
          },
          ...previous.transfersToSavings
        ]
      };
      return upsertDailyCheck(nextState, payload.date, {}, false);
    });
  }

  function handleWithdraw(payload: ActionPayload) {
    updateState((previous) => {
      const amount = Math.min(payload.amount, previous.savings.balance);
      const nextState = {
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
      return upsertDailyCheck(nextState, payload.date, {}, false);
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

  function handleReserveChange(amount: number) {
    updateState((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        reserveAmount: Math.max(0, amount)
      }
    }));
  }

  function handleMarkPaymentPaid(
    payment: MandatoryPayment,
    options: { paymentSource?: ExpensePaymentSource; creditId?: string } = {}
  ) {
    updateState((previous) => {
      const paidDate = todayISO();
      const payFromCredit = options.paymentSource === "credit" && Boolean(options.creditId);
      const credit = payFromCredit
        ? previous.credits.find((item) => item.id === options.creditId && !item.isClosed)
        : undefined;
      if (payFromCredit && !credit) return previous;
      if (!payFromCredit && previous.operationalBalance < payment.amount) return previous;
      const linkedGoal = !payFromCredit && payment.linkedGoalId
        ? previous.goals.find((goal) => goal.id === payment.linkedGoalId)
        : undefined;
      const hasLinkedGoalTransfer = previous.transfersToSavings.some(
        (transfer) => transfer.linkedMandatoryPaymentId === payment.id
      );
      const shouldCreateGoalTransfer = Boolean(linkedGoal && !hasLinkedGoalTransfer);
      const linkedPaymentCredit = payment.linkedCreditId
        ? previous.credits.find((item) => item.id === payment.linkedCreditId && !item.isClosed)
        : undefined;
      const hasLinkedCreditPayment = previous.creditEvents.some(
        (event) =>
          event.kind === "payment" &&
          event.linkedMandatoryPaymentId === payment.id
      );
      const linkedCreditPaymentAmount =
        linkedPaymentCredit && linkedPaymentCredit.id !== credit?.id && !hasLinkedCreditPayment
          ? Math.min(
              payment.amount,
              calculateCreditCurrentBalance(linkedPaymentCredit, previous.creditEvents)
            )
          : 0;
      const creditEvents: CreditEvent[] = [
        ...(payFromCredit
          ? [
              {
                id: uid("credit_event"),
                creditId: credit!.id,
                date: paidDate,
                kind: "charge" as const,
                amount: payment.amount,
                note: `Оплата обязательного платежа: ${payment.title}`,
                linkedMandatoryPaymentId: payment.id
              }
            ]
          : []),
        ...(linkedCreditPaymentAmount > 0
          ? [
              {
                id: uid("credit_event"),
                creditId: linkedPaymentCredit!.id,
                date: paidDate,
                kind: "payment" as const,
                amount: linkedCreditPaymentAmount,
                note: `Погашение долга обязательным платежом: ${payment.title}`,
                linkedMandatoryPaymentId: payment.id
              }
            ]
          : []),
        ...previous.creditEvents
      ];

      const nextState = {
        ...previous,
        operationalBalance: payFromCredit
          ? previous.operationalBalance
          : previous.operationalBalance - payment.amount,
        savings: shouldCreateGoalTransfer
          ? {
              ...previous.savings,
              balance: previous.savings.balance + payment.amount
            }
          : previous.savings,
        goals: shouldCreateGoalTransfer
          ? previous.goals.map((goal) =>
              goal.id === linkedGoal!.id
                ? {
                    ...goal,
                    allocated: goal.allocated + payment.amount
                  }
                : goal
            )
          : previous.goals,
        transfersToSavings: shouldCreateGoalTransfer
          ? [
              {
                id: uid("transfer"),
                amount: payment.amount,
                date: paidDate,
                planned: false,
                linkedGoalId: linkedGoal!.id,
                linkedMandatoryPaymentId: payment.id,
                categoryId: defaultRubricId(previous, "transfer", "На цель"),
                title: payment.title,
                note: "Обязательный платёж на цель"
              },
              ...previous.transfersToSavings
            ]
          : previous.transfersToSavings,
        mandatoryPayments: previous.mandatoryPayments.map((item) =>
          item.id === payment.id
            ? {
                ...item,
                status: "paid" as const,
                paidFrom: payFromCredit ? "credit" as const : "own" as const,
                paidDate,
                paidCreditId: payFromCredit ? credit!.id : undefined
              }
            : item
        ),
        creditEvents
      };
      return upsertDailyCheck(nextState, paidDate, {}, false);
    });
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
        (item) =>
          !(item.id === paymentId && item.status !== "paid") &&
          !(item.sourceRecurringPaymentId === paymentId && item.status !== "paid")
      )
    }));
  }

  function handleSkipMandatoryPaymentOccurrence(paymentId: string, date: ISODate) {
    updateState((previous) => ({
      ...previous,
      mandatoryPayments: previous.mandatoryPayments.map((item) => {
        if (item.id !== paymentId || item.recurrence !== "monthly" || item.status === "paid") return item;
        const exceptions = new Set(item.recurrenceExceptions ?? []);
        exceptions.add(date);
        return {
          ...item,
          recurrenceExceptions: Array.from(exceptions).sort(compareDates)
        };
      })
    }));
  }

  function handleCancelMandatoryPayment(
    payment: MandatoryPayment,
    options: { rollbackDebtPayment?: boolean } = {}
  ) {
    const today = todayISO();
    updateState((previous) => {
      const target = previous.mandatoryPayments.find((item) => item.id === payment.id && item.status === "paid");
      if (!target) return previous;
      const rollbackDebtPayment = options.rollbackDebtPayment ?? true;
      const unpaidStatus: MandatoryPayment["status"] =
        compareDates(target.dueDate, today) < 0 ? "missed" : "scheduled";
      const paidDate = target.paidDate ?? target.dueDate;
      const linkedGoalTransfers = previous.transfersToSavings.filter(
        (transfer) => transfer.linkedMandatoryPaymentId === target.id
      );
      const linkedGoalTransferAmount = linkedGoalTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);

      const nextState = {
        ...previous,
        operationalBalance: target.paidFrom === "credit"
          ? previous.operationalBalance
          : previous.operationalBalance + target.amount,
        savings: linkedGoalTransferAmount > 0
          ? {
              ...previous.savings,
              balance: Math.max(0, previous.savings.balance - linkedGoalTransferAmount)
            }
          : previous.savings,
        goals: linkedGoalTransferAmount > 0
          ? previous.goals.map((goal) =>
              goal.id === target.linkedGoalId
                ? {
                    ...goal,
                    allocated: Math.max(0, goal.allocated - linkedGoalTransferAmount)
                  }
                : goal
            )
          : previous.goals,
        transfersToSavings: linkedGoalTransferAmount > 0
          ? previous.transfersToSavings.filter((transfer) => transfer.linkedMandatoryPaymentId !== target.id)
          : previous.transfersToSavings,
        creditEvents: previous.creditEvents.filter((event) => {
          if (event.linkedMandatoryPaymentId !== target.id) return true;
          if (event.kind === "charge" && target.paidFrom === "credit") return false;
          if (event.kind === "payment" && rollbackDebtPayment) return false;
          return true;
        }),
        mandatoryPayments: previous.mandatoryPayments.map((item) =>
          item.id === target.id
            ? {
                ...item,
                status: unpaidStatus,
                paidFrom: undefined,
                paidDate: undefined,
                paidCreditId: undefined
              }
            : item
        )
      };
      return upsertDailyCheck(nextState, paidDate, {}, false);
    });
  }

  function handleSaveDailyCheck(mode: DailyCheckDialogMode, payload: DailyCheckPayload) {
    const savedAt = new Date().toISOString();
    if (!payload.clear && payload.balance === undefined) return;
    if (mode === "morning-check" && payload.balance !== undefined && payload.balance < 0) return;

    updateState((previous) => {
      const existing = previous.dailyChecks.find((check) => check.date === payload.date);
      if (payload.clear && !existing) return previous;
      const dailyCheckId = existing?.id ?? uid("daily_check");
      const quickCreditAmount = quickCreditSpentAmount(existing);
      if (payload.clear) {
        const nextState = {
          ...previous,
          creditEvents:
            mode === "evening-check"
              ? previous.creditEvents.filter((event) => keepNonEveningCreditEvent(event, dailyCheckId))
              : previous.creditEvents
        };
        return upsertDailyCheck(
          nextState,
          payload.date,
          mode === "morning-check"
            ? {
                morningBalance: undefined,
                morningAt: undefined
              }
            : {
                eveningBalance: undefined,
                eveningAt: undefined,
                calculatedEveningBalance: undefined,
                creditSpentAmount: quickCreditAmount || undefined,
                creditId: undefined,
                reason: undefined,
                note: undefined
              },
          true,
          dailyCheckId
        );
      }

      const balance = payload.balance;
      if (balance === undefined) return previous;
      const isCreditEvening =
        mode === "evening-check" &&
        balance < 0 &&
        Boolean(payload.creditId);
      if (mode === "evening-check" && balance < 0 && !payload.creditId) return previous;
      if (
        isCreditEvening &&
        !previous.credits.some((credit) => credit.id === payload.creditId && !credit.isClosed)
      ) {
        return previous;
      }
      const creditSpentAmount = isCreditEvening
        ? quickCreditAmount + Math.abs(balance)
        : mode === "evening-check"
          ? quickCreditAmount || undefined
          : existing?.creditSpentAmount;
      const nextState = {
        ...previous,
        operationalBalance: isCreditEvening ? 0 : balance,
        creditEvents: [
          ...(mode === "evening-check"
            ? previous.creditEvents.filter((event) => keepNonEveningCreditEvent(event, dailyCheckId))
            : previous.creditEvents),
          ...(isCreditEvening
            ? [
                {
                  id: uid("credit_event"),
                  creditId: payload.creditId!,
                  date: payload.date,
                  kind: "charge" as const,
                  amount: Math.abs(balance),
                  note: "Вечерний минус закрыт в долг",
                  linkedDailyCheckId: dailyCheckId
                }
              ]
            : [])
        ]
      };
      const plannedLimit =
        mode === "morning-check"
          ? Math.round(calculateSnapshot(nextState, payload.date).safeToSpendToday)
          : existing?.plannedLimit ?? Math.round(calculateSnapshot(nextState, payload.date).safeToSpendToday);

      return upsertDailyCheck(
        nextState,
        payload.date,
        {
          morningBalance: mode === "morning-check" ? balance : existing?.morningBalance,
          morningAt: mode === "morning-check" ? savedAt : existing?.morningAt,
          eveningBalance: mode === "evening-check" ? balance : existing?.eveningBalance,
          eveningAt: mode === "evening-check" ? savedAt : existing?.eveningAt,
          creditSpentAmount,
          creditId: isCreditEvening ? payload.creditId : mode === "evening-check" ? undefined : existing?.creditId,
          plannedLimit,
          reason: mode === "evening-check" ? payload.reason : existing?.reason,
          note: payload.note ?? existing?.note
        },
        true,
        dailyCheckId
      );
    });

    setActiveDailyCheckDialog(null);
  }

  function handleQuickExpense(payload: QuickExpensePayload) {
    const createdAt = new Date().toISOString();

    updateState((previous) => {
      const existing = previous.dailyChecks.find((check) => check.date === payload.date);
      const isCreditExpense = payload.paymentSource === "credit" && Boolean(payload.creditId);
      const isCreditPayment = payload.operation === "credit-payment" && Boolean(payload.creditId);
      const isOwnExpense = !isCreditExpense && !isCreditPayment;
      const linkedCredit = payload.creditId
        ? previous.credits.find((credit) => credit.id === payload.creditId && !credit.isClosed)
        : undefined;
      if ((isCreditExpense || isCreditPayment) && !linkedCredit) return previous;
      if (!isCreditExpense && previous.operationalBalance < payload.amount) return previous;
      if (isCreditPayment && linkedCredit) {
        const currentDebt = calculateCreditCurrentBalance(linkedCredit, previous.creditEvents);
        if (payload.amount > currentDebt) return previous;
      }
      const dailyCheckId = existing?.id ?? uid("daily_check");
      const entryId = uid("quick_spent");
      const quickSpentAmount = (existing?.quickSpentAmount ?? 0) + (isOwnExpense ? payload.amount : 0);
      const creditSpentAmount = (existing?.creditSpentAmount ?? 0) + (isCreditExpense ? payload.amount : 0);
      const creditPaymentAmount = (existing?.creditPaymentAmount ?? 0) + (isCreditPayment ? payload.amount : 0);
      const quickSpentEntries = [
        ...(existing?.quickSpentEntries ?? []),
        {
          id: entryId,
          amount: payload.amount,
          createdAt,
          note: payload.note,
          operation: isCreditPayment ? "credit-payment" as const : "expense" as const,
          paymentSource: isCreditExpense ? "credit" as const : "own" as const,
          creditId: isCreditExpense || isCreditPayment ? payload.creditId : undefined
        }
      ];
      const nextState = {
        ...previous,
        operationalBalance: isCreditExpense
          ? previous.operationalBalance
          : previous.operationalBalance - payload.amount,
        creditEvents: isCreditExpense || isCreditPayment
          ? [
              {
                id: uid("credit_event"),
                creditId: payload.creditId!,
                date: payload.date,
                kind: isCreditPayment ? "payment" as const : "charge" as const,
                amount: payload.amount,
                note: isCreditPayment
                  ? payload.note
                    ? `Погашение долга: ${payload.note}`
                    : "Погашение долга"
                  : payload.note
                    ? `Быстрый расход: ${payload.note}`
                    : "Быстрый расход в долг",
                linkedDailyCheckId: dailyCheckId,
                linkedQuickSpentEntryId: entryId
              },
              ...previous.creditEvents
            ]
          : previous.creditEvents
      };

      return upsertDailyCheck(
        nextState,
        payload.date,
        {
          quickSpentAmount,
          creditSpentAmount,
          creditPaymentAmount,
          creditId: isCreditExpense || isCreditPayment ? payload.creditId : existing?.creditId,
          quickSpentEntries
        },
        true,
        dailyCheckId
      );
    });

    setQuickExpenseOpen(false);
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
                  creditLimit: credit.creditLimit,
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

  function handleDeleteHistoryItem(kind: HistoryItemKind, id: string) {
    updateState((previous) => {
      if (kind === "income") {
        const income = previous.incomes.find((item) => item.id === id);
        if (!income) return previous;
        const date = income.receivedDate ?? income.expectedDate;
        const nextState = {
          ...previous,
          operationalBalance: Math.max(0, previous.operationalBalance - income.amount),
          incomes: previous.incomes.filter((item) => item.id !== id)
        };
        return upsertDailyCheck(nextState, date, {}, false);
      }

      if (kind === "expense") {
        const expense = previous.variableExpenses.find((item) => item.id === id);
        if (!expense) return previous;
        const paidByCredit = expense.paymentSource === "credit";
        const nextState = {
          ...previous,
          operationalBalance: paidByCredit
            ? previous.operationalBalance
            : previous.operationalBalance + expense.amount,
          variableExpenses: previous.variableExpenses.filter((item) => item.id !== id),
          creditEvents: paidByCredit
            ? previous.creditEvents.filter((event) => event.linkedExpenseId !== id)
            : previous.creditEvents
        };
        return upsertDailyCheck(nextState, expense.date, {}, false);
      }

      if (kind === "transfer-to-savings") {
        const transfer = previous.transfersToSavings.find((item) => item.id === id);
        if (!transfer || transfer.linkedMandatoryPaymentId) return previous;
        const nextState = {
          ...previous,
          operationalBalance: transfer.planned
            ? previous.operationalBalance
            : previous.operationalBalance + transfer.amount,
          savings: transfer.planned
            ? previous.savings
            : {
                ...previous.savings,
                balance: Math.max(0, previous.savings.balance - transfer.amount),
                cushion: transfer.linkedSavingsBucket === "cushion"
                  ? {
                      ...previous.savings.cushion,
                      allocated: Math.max(0, previous.savings.cushion.allocated - transfer.amount)
                    }
                  : previous.savings.cushion
              },
          goals: !transfer.planned && transfer.linkedGoalId
            ? previous.goals.map((goal) =>
                goal.id === transfer.linkedGoalId
                  ? { ...goal, allocated: Math.max(0, goal.allocated - transfer.amount) }
                  : goal
              )
            : previous.goals,
          transfersToSavings: previous.transfersToSavings.filter((item) => item.id !== id)
        };
        return upsertDailyCheck(nextState, transfer.date, {}, false);
      }

      if (kind === "withdrawal-from-savings") {
        const withdrawal = previous.withdrawalsFromSavings.find((item) => item.id === id);
        if (!withdrawal) return previous;
        const nextState = {
          ...previous,
          operationalBalance: Math.max(0, previous.operationalBalance - withdrawal.amount),
          savings: {
            ...previous.savings,
            balance: previous.savings.balance + withdrawal.amount
          },
          withdrawalsFromSavings: previous.withdrawalsFromSavings.filter((item) => item.id !== id)
        };
        return upsertDailyCheck(nextState, withdrawal.date, {}, false);
      }

      if (kind === "mandatory-payment") {
        const today = todayISO();
        const target = previous.mandatoryPayments.find((item) => item.id === id && item.status === "paid");
        if (!target) return previous;
        const unpaidStatus: MandatoryPayment["status"] =
          compareDates(target.dueDate, today) < 0 ? "missed" : "scheduled";
        const paidDate = target.paidDate ?? target.dueDate;
        const linkedGoalTransfers = previous.transfersToSavings.filter(
          (transfer) => transfer.linkedMandatoryPaymentId === target.id
        );
        const linkedGoalTransferAmount = linkedGoalTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
        const nextState = {
          ...previous,
          operationalBalance: target.paidFrom === "credit"
            ? previous.operationalBalance
            : previous.operationalBalance + target.amount,
          savings: linkedGoalTransferAmount > 0
            ? {
                ...previous.savings,
                balance: Math.max(0, previous.savings.balance - linkedGoalTransferAmount)
              }
            : previous.savings,
          goals: linkedGoalTransferAmount > 0
            ? previous.goals.map((goal) =>
                goal.id === target.linkedGoalId
                  ? { ...goal, allocated: Math.max(0, goal.allocated - linkedGoalTransferAmount) }
                  : goal
              )
            : previous.goals,
          transfersToSavings: linkedGoalTransferAmount > 0
            ? previous.transfersToSavings.filter((transfer) => transfer.linkedMandatoryPaymentId !== target.id)
            : previous.transfersToSavings,
          creditEvents: previous.creditEvents.filter((event) => event.linkedMandatoryPaymentId !== target.id),
          mandatoryPayments: previous.mandatoryPayments.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  status: unpaidStatus,
                  paidFrom: undefined,
                  paidDate: undefined,
                  paidCreditId: undefined
                }
              : item
          )
        };
        return upsertDailyCheck(nextState, paidDate, {}, false);
      }

      return previous;
    });
  }

  function handleDeleteQuickSpentEntry(date: ISODate, entryId: string) {
    updateState((previous) => {
      const check = previous.dailyChecks.find((item) => item.date === date);
      const entry = check?.quickSpentEntries?.find((item) => item.id === entryId);
      if (!check || !entry) return previous;

      const isCreditPayment = entry.operation === "credit-payment";
      const isCreditExpense = entry.paymentSource === "credit" && !isCreditPayment;
      const nextEntries = (check.quickSpentEntries ?? []).filter((item) => item.id !== entryId);
      const nextState = {
        ...previous,
        operationalBalance: isCreditExpense
          ? previous.operationalBalance
          : previous.operationalBalance + entry.amount,
        creditEvents: previous.creditEvents.filter((event) => event.linkedQuickSpentEntryId !== entryId)
      };

      return upsertDailyCheck(
        nextState,
        date,
        {
          quickSpentAmount: Math.max(
            0,
            (check.quickSpentAmount ?? 0) - (!isCreditExpense && !isCreditPayment ? entry.amount : 0)
          ),
          creditSpentAmount: Math.max(
            0,
            (check.creditSpentAmount ?? 0) - (isCreditExpense ? entry.amount : 0)
          ),
          creditPaymentAmount: Math.max(
            0,
            (check.creditPaymentAmount ?? 0) - (isCreditPayment ? entry.amount : 0)
          ),
          quickSpentEntries: nextEntries
        },
        true,
        check.id
      );
    });
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
      ),
      mandatoryPayments: previous.mandatoryPayments.map((payment) =>
        payment.linkedGoalId === goalId ? { ...payment, linkedGoalId: undefined } : payment
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
    const today = todayISO();
    setFinanceState((previous) => {
      const base = createInitialState(today);
      const payday1 = previous.settings.payday1 || base.settings.payday1 || 5;
      const payday2 = previous.settings.payday2 || base.settings.payday2 || 20;
      const settings = {
        ...base.settings,
        payday1,
        payday2,
        typicalPaycheck1: 100000,
        typicalPaycheck2: 100000,
        reserveAmount: 0
      };
      const nextPaycheck = getNextPaycheckDate(today, settings);
      const previousPaycheck = getPreviousPaycheckDate(today, settings);
      const slot = getPaycheckSlotForDate(nextPaycheck, settings);
      const expectedIncome = slot === "payday2" ? settings.typicalPaycheck2 : settings.typicalPaycheck1;
      return {
        ...base,
        settings,
        operationalBalance: 0,
        payCycle: {
          id: uid("cycle"),
          startDate: previousPaycheck,
          endDate: addDays(nextPaycheck, -1),
          openingOperational: 0,
          expectedIncome
        },
        reserve: { amount: 0, policy: "flat" },
        savings: {
          ...base.savings,
          balance: 0,
          baselineBalance: 0,
          cushion: { allocated: 0, target: 0 }
        },
        goals: [],
        dailyChecks: [],
        incomes: [],
        variableExpenses: [],
        transfersToSavings: [],
        withdrawalsFromSavings: [],
        mandatoryPayments: [],
        credits: [],
        creditEvents: []
      };
    });
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
        dailyChecks: [],
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
        onDailyCheck={setActiveDailyCheckDialog}
        onQuickExpense={() => setQuickExpenseOpen(true)}
        onConfirmPaycheck={handleConfirmPaycheck}
        onReserveChange={handleReserveChange}
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
        onSkipMandatoryPaymentOccurrence={handleSkipMandatoryPaymentOccurrence}
        onCancelMandatoryPayment={handleCancelMandatoryPayment}
        onSaveCredit={handleSaveCredit}
        onAddCreditEvent={handleAddCreditEvent}
        onToggleCreditClosed={handleToggleCreditClosed}
        rubrics={financeState.rubrics}
        goals={financeState.goals}
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
    history: (
      <HistoryScreen
        state={financeState}
        snapshot={snapshot}
        onAction={setActiveDialog}
        onDeleteHistoryItem={handleDeleteHistoryItem}
        onDeleteQuickSpentEntry={handleDeleteQuickSpentEntry}
      />
    ),
    settings: (
      <SettingsScreen
        state={financeState}
        setState={setFinanceStateFromScreen}
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
        goals={financeState.goals}
        credits={financeState.credits}
        creditEvents={financeState.creditEvents}
        operationalBalance={financeState.operationalBalance}
        onOpenChange={setActiveDialog}
        onExpense={handleExpense}
        onIncome={handleIncome}
        onTransfer={handleTransfer}
        onWithdraw={handleWithdraw}
      />
      <DailyCheckDialog
        open={activeDailyCheckDialog !== null}
        mode={activeDailyCheckDialog}
        date={snapshot.today}
        check={todayCheck}
        plannedLimit={Math.round(snapshot.safeToSpendToday)}
        previousEveningBalance={previousEveningBalance}
        credits={financeState.credits}
        creditEvents={financeState.creditEvents}
        onOpenChange={(open) => {
          if (!open) setActiveDailyCheckDialog(null);
        }}
        onSubmit={handleSaveDailyCheck}
      />
      <QuickExpenseDialog
        open={quickExpenseOpen}
        date={snapshot.today}
        check={todayCheck}
        credits={financeState.credits}
        creditEvents={financeState.creditEvents}
        availableOperational={financeState.operationalBalance}
        onOpenChange={setQuickExpenseOpen}
        onSubmit={handleQuickExpense}
      />
    </div>
  );
}
