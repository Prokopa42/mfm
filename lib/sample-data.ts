import {
  addDays,
  getCurrentCycleBounds,
  getPreviousPaycheckDate,
  todayISO
} from "@/lib/dates";
import type { CalculationSettings, FinanceState } from "@/lib/types";

export const DEFAULT_SETTINGS: CalculationSettings = {
  payday1: 5,
  payday2: 20,
  typicalPaycheck1: 22500,
  typicalPaycheck2: 22500,
  reserveAmount: 2000,
  purchasingPowerCoef: 0.9,
  rounding: "day",
  includeTodayInDivisor: true,
  autoSubtractPlannedSavings: true
};

export function createInitialState(today = todayISO()): FinanceState {
  const cycle = getCurrentCycleBounds(today, DEFAULT_SETTINGS);
  const previousPaycheck = getPreviousPaycheckDate(today, DEFAULT_SETTINGS);
  return {
    schemaVersion: 2,
    operationalBalance: 15400,
    payCycle: {
      id: "cycle_current",
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      openingOperational: 45000,
      expectedIncome: 45000
    },
    incomes: [
      {
        id: "income_prev_paycheck",
        amount: 45000,
        expectedDate: previousPaycheck,
        receivedDate: previousPaycheck,
        kind: "paycheck",
        note: "Зарплата"
      },
      {
        id: "income_side",
        amount: 5000,
        expectedDate: addDays(today, 4),
        kind: "other",
        note: "Разовый доход"
      }
    ],
    mandatoryPayments: [
      {
        id: "payment_internet",
        title: "Интернет",
        amount: 900,
        dueDate: addDays(today, 1),
        recurrence: "monthly",
        status: "scheduled"
      },
      {
        id: "payment_rent",
        title: "Аренда",
        amount: 28000,
        dueDate: previousPaycheck,
        recurrence: "monthly",
        status: "paid"
      },
      {
        id: "payment_gym",
        title: "Спортзал",
        amount: 1200,
        dueDate: addDays(today, 5),
        recurrence: "monthly",
        status: "scheduled"
      }
    ],
    variableExpenses: [
      {
        id: "expense_coffee",
        amount: 180,
        date: today,
        category: "Кофе",
        note: "Утро"
      },
      {
        id: "expense_food",
        amount: 1420,
        date: addDays(today, -1),
        category: "Продукты"
      },
      {
        id: "expense_gas",
        amount: 1200,
        date: addDays(today, -2),
        category: "Бензин"
      }
    ],
    reserve: {
      amount: DEFAULT_SETTINGS.reserveAmount,
      policy: "flat"
    },
    savings: {
      balance: 43100,
      openedAt: "2026-01-01",
      baselineBalance: 36000,
      // Quiet-on-migration default: подушка не настроена (target=0).
      // Полировка с реалистичными числами — этап 9 (Savings screen).
      cushion: { allocated: 0, target: 0 }
    },
    transfersToSavings: [
      // Без linkedGoalId — переводы идут в общий котёл, дальше пользователь
      // распределяет по конвертам. linkedGoalId на удалённый goal_reserve
      // оставлять нельзя — dangling reference.
      {
        id: "transfer_done",
        amount: 3000,
        date: addDays(today, -1),
        planned: false,
        note: "В накопления"
      },
      {
        id: "transfer_planned",
        amount: 2500,
        date: addDays(today, 3),
        planned: true,
        note: "Плановый перевод"
      }
    ],
    withdrawalsFromSavings: [],
    // В канонической модели подушка — это `savings.cushion` (отдельный
    // системный резерв), не обычная цель. Дублировать её в `goals` нельзя:
    // путаница и риск двойного счёта. Здесь — только реальные
    // пользовательские цели. Если в будущем sample-data получит
    // realistic cushion (allocated/target > 0), она появится в
    // `savings.cushion` выше, а не здесь.
    //
    // Quiet-on-migration: цели стартуют unconfigured (allocated=0,
    // plannedPace=0) → status "unconfigured" в snapshot, никакой ложной
    // тревоги. Полировка с реалистичными значениями — отдельный шаг,
    // когда появится UI для распределения котла (этап 11).
    goals: [
      {
        id: "goal_trip",
        title: "Отпуск",
        target: 120000,
        deadline: "2026-06-30",
        priority: 1,
        allocated: 0,
        plannedPace: 0
      },
      {
        id: "goal_laptop",
        title: "Новый ноутбук",
        target: 180000,
        deadline: "2026-12-31",
        priority: 2,
        allocated: 0,
        plannedPace: 0
      }
    ],
    settings: DEFAULT_SETTINGS
  };
}
