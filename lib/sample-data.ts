import {
  addDays,
  getCurrentCycleBounds,
  getPreviousPaycheckDate,
  todayISO
} from "@/lib/dates";
import type { CalculationSettings, FinanceState, Rubric } from "@/lib/types";

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
  const previousPaycheck = getPreviousPaycheckDate(today, DEFAULT_SETTINGS);
  return {
    schemaVersion: 5,
    operationalBalance: 15400,
    payCycle: {
      id: "cycle_current",
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      openingOperational: 45000,
      expectedIncome: 45000
    },
    rubrics: DEFAULT_RUBRICS,
    incomes: [
      {
        id: "income_prev_paycheck",
        amount: 45000,
        expectedDate: previousPaycheck,
        receivedDate: previousPaycheck,
        kind: "paycheck",
        categoryId: "rubric_income_work",
        note: "Зарплата"
      },
      {
        id: "income_side",
        amount: 5000,
        expectedDate: addDays(today, 4),
        kind: "other",
        categoryId: "rubric_income_side",
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
        status: "scheduled",
        categoryId: "rubric_payment_connection"
      },
      {
        id: "payment_rent",
        title: "Аренда",
        amount: 28000,
        dueDate: previousPaycheck,
        recurrence: "monthly",
        status: "paid",
        categoryId: "rubric_payment_housing"
      },
      {
        id: "payment_gym",
        title: "Спортзал",
        amount: 1200,
        dueDate: addDays(today, 5),
        recurrence: "monthly",
        status: "scheduled",
        categoryId: "rubric_payment_sport"
      },
      {
        id: "payment_credit_card",
        title: "Кредитка",
        amount: 4000,
        dueDate: addDays(today, 7),
        recurrence: "monthly",
        status: "scheduled",
        categoryId: "rubric_payment_credit",
        linkedCreditId: "credit_card"
      }
    ],
    credits: [
      {
        id: "credit_card",
        title: "Кредитная карта",
        openedAt: addDays(today, -120),
        openingBalance: 74000,
        note: "Платёж ведётся как обязательный, остаток обновляется вручную.",
        isClosed: false,
        order: 10
      },
      {
        id: "credit_phone",
        title: "Рассрочка телефон",
        openedAt: addDays(today, -80),
        openingBalance: 36000,
        note: "Без банковской математики в MVP.",
        isClosed: false,
        order: 20
      },
      {
        id: "credit_old",
        title: "Старый займ",
        openedAt: addDays(today, -240),
        openingBalance: 18000,
        note: "Закрыт для примера.",
        isClosed: true,
        order: 30
      }
    ],
    creditEvents: [
      {
        id: "credit_event_card_charge_1",
        creditId: "credit_card",
        date: addDays(today, -33),
        kind: "charge",
        amount: 18000,
        note: "Покупка по кредитке"
      },
      {
        id: "credit_event_card_payment_1",
        creditId: "credit_card",
        date: addDays(today, -18),
        kind: "payment",
        amount: 6000,
        note: "Погашение части долга"
      },
      {
        id: "credit_event_phone_payment_1",
        creditId: "credit_phone",
        date: addDays(today, -25),
        kind: "payment",
        amount: 12000,
        note: "Платёж по рассрочке"
      },
      {
        id: "credit_event_old_payment_1",
        creditId: "credit_old",
        date: addDays(today, -180),
        kind: "payment",
        amount: 18000,
        note: "Закрытие старого займа"
      }
    ],
    variableExpenses: [
      {
        id: "expense_coffee",
        amount: 180,
        date: today,
        categoryId: "rubric_expense_food",
        category: "Кофе",
        note: "Утро"
      },
      {
        id: "expense_food",
        amount: 1420,
        date: addDays(today, -1),
        categoryId: "rubric_expense_food",
        category: "Продукты"
      },
      {
        id: "expense_gas",
        amount: 1200,
        date: addDays(today, -2),
        categoryId: "rubric_expense_transport",
        category: "Бензин"
      }
    ],
    reserve: {
      amount: DEFAULT_SETTINGS.reserveAmount,
      policy: "flat"
    },
    savings: {
      balance: 243100,
      openedAt: addDays(today, -115),
      baselineBalance: 176000,
      // Demo scenario for Savings screen: подушка — системный резерв
      // внутри общего котла, не отдельная цель.
      cushion: { allocated: 90000, target: 120000 }
    },
    transfersToSavings: [
      // Без linkedGoalId — переводы идут в общий котёл, дальше пользователь
      // распределяет по конвертам. linkedGoalId на удалённый goal_reserve
      // оставлять нельзя — dangling reference.
      {
        id: "transfer_demo_jan",
        amount: 20000,
        date: addDays(today, -96),
        planned: false,
        categoryId: "rubric_transfer_general",
        title: "Первый взнос в котёл",
        note: "Demo history point"
      },
      {
        id: "transfer_demo_feb",
        amount: 12000,
        date: addDays(today, -72),
        planned: false,
        categoryId: "rubric_transfer_general",
        title: "В накопления",
        note: "Demo history point"
      },
      {
        id: "transfer_demo_mar",
        amount: 15000,
        date: addDays(today, -49),
        planned: false,
        categoryId: "rubric_transfer_general",
        title: "В накопления",
        note: "Demo history point"
      },
      {
        id: "transfer_demo_apr_a",
        amount: 17100,
        date: addDays(today, -21),
        planned: false,
        categoryId: "rubric_transfer_general",
        title: "Премия в котёл",
        note: "Demo history point"
      },
      {
        id: "transfer_demo_apr_b",
        amount: 3000,
        date: addDays(today, -6),
        planned: false,
        categoryId: "rubric_transfer_general",
        title: "Довложение",
        note: "Demo history point"
      },
      {
        id: "transfer_planned",
        amount: 2500,
        date: addDays(today, 3),
        planned: true,
        categoryId: "rubric_transfer_general",
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
    // Demo scenario: одна цель отстаёт, одна идёт в графике, а часть
    // котла остаётся в "не распределено". Это нужно, чтобы экран
    // доказывал модель котла и конвертов на живых данных.
    goals: [
      {
        id: "goal_trip",
        title: "Отпуск",
        target: 120000,
        deadline: addDays(today, 65),
        priority: 1,
        allocated: 56000,
        plannedPace: 9000
      },
      {
        id: "goal_laptop",
        title: "Новый ноутбук",
        target: 180000,
        deadline: addDays(today, 250),
        priority: 2,
        allocated: 38000,
        plannedPace: 18000
      }
    ],
    settings: DEFAULT_SETTINGS
  };
}
