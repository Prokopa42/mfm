import { getCurrentCycleBounds, todayISO } from "@/lib/dates";
import type { CalculationSettings, FinanceState, Rubric } from "@/lib/types";

export const DEFAULT_SETTINGS: CalculationSettings = {
  payday1: 5,
  payday2: 20,
  typicalPaycheck1: 100000,
  typicalPaycheck2: 100000,
  reserveAmount: 0,
  purchasingPowerCoef: 0.9,
  rounding: "day",
  includeTodayInDivisor: true,
  autoSubtractPlannedSavings: true
};

export const DEFAULT_RUBRICS: Rubric[] = [
  { id: "rubric_expense_food", title: "Еда", scope: "expense", order: 10, isArchived: false },
  { id: "rubric_expense_transport", title: "Транспорт", scope: "expense", order: 20, isArchived: false },
  { id: "rubric_expense_home", title: "Дом", scope: "expense", order: 30, isArchived: false },
  { id: "rubric_expense_health", title: "Здоровье", scope: "expense", order: 40, isArchived: false },
  { id: "rubric_expense_connection", title: "Связь", scope: "expense", order: 50, isArchived: false },
  { id: "rubric_expense_leisure", title: "Досуг", scope: "expense", order: 60, isArchived: false },
  { id: "rubric_expense_other", title: "Прочее", scope: "expense", order: 70, isArchived: false },

  { id: "rubric_income_work", title: "Работа", scope: "income", order: 10, isArchived: false },
  { id: "rubric_income_bonus", title: "Премия", scope: "income", order: 20, isArchived: false },
  { id: "rubric_income_side", title: "Подработка", scope: "income", order: 30, isArchived: false },
  { id: "rubric_income_other", title: "Прочее", scope: "income", order: 40, isArchived: false },

  { id: "rubric_transfer_general", title: "Общий котёл", scope: "transfer", order: 10, isArchived: false },
  { id: "rubric_transfer_goal", title: "На цель", scope: "transfer", order: 20, isArchived: false },

  { id: "rubric_withdraw_need", title: "Нужное", scope: "withdraw", order: 10, isArchived: false },
  { id: "rubric_withdraw_emergency", title: "Срочно", scope: "withdraw", order: 20, isArchived: false },

  { id: "rubric_payment_housing", title: "Жильё", scope: "mandatory-payment", order: 10, isArchived: false },
  { id: "rubric_payment_connection", title: "Связь", scope: "mandatory-payment", order: 20, isArchived: false },
  { id: "rubric_payment_sport", title: "Спорт", scope: "mandatory-payment", order: 30, isArchived: false },
  { id: "rubric_payment_subscriptions", title: "Подписки", scope: "mandatory-payment", order: 40, isArchived: false },
  { id: "rubric_payment_credit", title: "Кредит", scope: "mandatory-payment", order: 50, isArchived: false },
  { id: "rubric_payment_other", title: "Прочее", scope: "mandatory-payment", order: 60, isArchived: false }
];

export function createInitialState(today = todayISO()): FinanceState {
  const cycle = getCurrentCycleBounds(today, DEFAULT_SETTINGS);
  return {
    schemaVersion: 6,
    operationalBalance: 0,
    payCycle: {
      id: "cycle_current",
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      openingOperational: 0,
      expectedIncome: 100000
    },
    rubrics: DEFAULT_RUBRICS,
    incomes: [],
    mandatoryPayments: [],
    credits: [],
    creditEvents: [],
    variableExpenses: [],
    dailyChecks: [],
    reserve: {
      amount: DEFAULT_SETTINGS.reserveAmount,
      policy: "flat"
    },
    savings: {
      balance: 0,
      openedAt: today,
      baselineBalance: 0,
      cushion: { allocated: 0, target: 0 }
    },
    transfersToSavings: [],
    withdrawalsFromSavings: [],
    goals: [],
    settings: DEFAULT_SETTINGS
  };
}
