export type ISODate = string;

export type IncomeKind = "paycheck" | "bonus" | "other";
export type MandatoryPaymentRecurrence = "monthly" | "once";
export type MandatoryPaymentStatus = "scheduled" | "paid" | "missed";
export type ReservePolicy = "flat" | "perCycle";
export type CalculationRounding = "day" | "hour";
export type ExpensePaymentSource = "own" | "credit";
export type RubricScope =
  | "expense"
  | "income"
  | "transfer"
  | "withdraw"
  | "mandatory-payment";

export interface Rubric {
  id: string;
  title: string;
  scope: RubricScope;
  order: number;
  isArchived: boolean;
}

export type InterfaceState =
  | "normal"
  | "tight"
  | "cash-risk"
  | "payday-arrived"
  | "payment-due-tomorrow"
  | "savings-off-track";

/**
 * Goal status in the savings model.
 *   - "unconfigured": user hasn't set allocation OR planned pace yet —
 *     neutral, NOT alarming. Quiet-on-migration default.
 *   - "done": allocatedNow >= target.
 *   - "on-track": forecastAtDeadline >= target (with intent expressed).
 *   - "behind": forecastAtDeadline < target (with intent expressed).
 */
export type GoalStatus = "unconfigured" | "done" | "on-track" | "behind";

/**
 * Cushion status in the savings model.
 *   - "unset": cushion.target = 0 — not configured by user, NOT alarming.
 *   - "ok": allocated >= target.
 *   - "low": allocated >= target/2 (and target > 0).
 *   - "critical": allocated < target/2 (and target > 0).
 */
export type CushionStatus = "unset" | "ok" | "low" | "critical";

export interface PayCycle {
  id: string;
  startDate: ISODate;
  endDate: ISODate;
  openingOperational: number;
  expectedIncome: number;
}

export interface Income {
  id: string;
  amount: number;
  expectedDate: ISODate;
  receivedDate?: ISODate;
  kind: IncomeKind;
  categoryId?: string;
  title?: string;
  note?: string;
}

export interface MandatoryPayment {
  id: string;
  title: string;
  amount: number;
  dueDate: ISODate;
  recurrence: MandatoryPaymentRecurrence;
  status: MandatoryPaymentStatus;
  categoryId?: string;
  linkedCreditId?: string;
}

export interface Credit {
  id: string;
  title: string;
  openedAt: ISODate;
  openingBalance: number;
  note?: string;
  isClosed: boolean;
  order: number;
}

export type CreditEventKind = "charge" | "payment" | "adjustment";

export interface CreditEvent {
  id: string;
  creditId: string;
  date: ISODate;
  kind: CreditEventKind;
  amount: number;
  note?: string;
  linkedExpenseId?: string;
  linkedMandatoryPaymentId?: string;
}

export interface VariableExpense {
  id: string;
  amount: number;
  date: ISODate;
  paymentSource?: ExpensePaymentSource;
  linkedCreditId?: string;
  categoryId?: string;
  /** Legacy fallback for older localStorage entries. New entries use categoryId. */
  category?: string;
  title?: string;
  note?: string;
}

/**
 * Reserve — CYCLE-LEVEL подушка.
 *
 * `amount` вычитается из `availableUntilNextPaycheck` в `calculateSnapshot`,
 * показывается на Today (BalanceStrip "подушка" + FooterStrips "Подушка").
 * Защищает текущий цикл — это про дневной лимит.
 *
 * НЕ ПУТАТЬ с `Savings.cushion`, который живёт внутри savings.balance и
 * представляет долгосрочный системный резерв накоплений. Это две разные
 * сущности с разной аудиторией и разной семантикой; код их не
 * отождествляет.
 */
export interface Reserve {
  amount: number;
  policy: ReservePolicy;
}

/**
 * Cushion — SYSTEM-LEVEL резерв ВНУТРИ котла накоплений.
 *
 * `allocated` — часть `Savings.balance`, помеченная как "не трогать".
 * `target` — целевой размер; `target = 0` означает "пользователь ещё не
 * настроил подушку" (нейтральное состояние, в UI трактуется как "unset",
 * не тревога).
 *
 * НЕ ПУТАТЬ с `Reserve.amount` (cycle-level). См. JSDoc у Reserve.
 */
export interface Cushion {
  allocated: number;
  target: number;
}

export interface Savings {
  balance: number;
  openedAt: ISODate;
  baselineBalance: number;
  cushion: Cushion;
}

export interface TransferToSavings {
  id: string;
  amount: number;
  date: ISODate;
  planned: boolean;
  linkedGoalId?: string;
  categoryId?: string;
  title?: string;
  note?: string;
}

export interface WithdrawalFromSavings {
  id: string;
  amount: number;
  date: ISODate;
  categoryId?: string;
  title?: string;
  note?: string;
  /** Legacy fallback for older localStorage entries. New entries use title/note. */
  reason?: string;
}

/**
 * SavingsGoal — конверт внутри котла накоплений.
 *
 * `allocated` — сколько из `Savings.balance` выделено в эту цель.
 * `plannedPace` — сколько ₽/мес пользователь планирует откладывать в эту
 * цель (формирует forecastAtDeadline и status).
 *
 * Если `allocated = 0` И `plannedPace = 0` — пользователь ещё не выразил
 * намерение по этой цели; снапшот пометит status = "unconfigured" и она
 * НЕ попадёт ни в primaryGoal, ни в "savings-off-track" UI signal.
 */
export interface SavingsGoal {
  id: string;
  title: string;
  target: number;
  deadline?: ISODate;
  priority: number;
  allocated: number;
  plannedPace: number;
}

export interface CalculationSettings {
  payday1: number;
  payday2: number;
  typicalPaycheck1: number;
  typicalPaycheck2: number;
  reserveAmount: number;
  purchasingPowerCoef: number;
  rounding: CalculationRounding;
  includeTodayInDivisor: boolean;
  autoSubtractPlannedSavings: boolean;
}

export interface FinanceState {
  schemaVersion: 5;
  operationalBalance: number;
  payCycle: PayCycle;
  rubrics: Rubric[];
  incomes: Income[];
  mandatoryPayments: MandatoryPayment[];
  credits: Credit[];
  creditEvents: CreditEvent[];
  variableExpenses: VariableExpense[];
  reserve: Reserve;
  savings: Savings;
  transfersToSavings: TransferToSavings[];
  withdrawalsFromSavings: WithdrawalFromSavings[];
  goals: SavingsGoal[];
  settings: CalculationSettings;
}

/**
 * Per-goal envelope snapshot. Calculated strictly within the goal's own
 * envelope (allocatedNow + plannedPace * monthsLeft) — NOT against the
 * total pot. Each goal is independent.
 */
export interface SavingsGoalSnapshot {
  goal: SavingsGoal;
  allocatedNow: number;
  gapNow: number;                // max(0, target - allocatedNow)
  monthsLeft: number | null;     // monthsBetween(today, deadline); null если deadline отсутствует
  requiredPace: number;          // gapNow / monthsLeft (Number.POSITIVE_INFINITY если monthsLeft = 0)
  plannedPace: number;           // copy of goal.plannedPace
  forecastAtDeadline: number;    // allocatedNow + plannedPace * (monthsLeft ?? 12)
  gapAtDeadline: number;         // max(0, target - forecastAtDeadline)
  status: GoalStatus;
}

/**
 * System-cushion snapshot. Computed strictly from `Savings.cushion`
 * (allocated/target). `target = 0` → status "unset" (not configured),
 * not alarming.
 */
export interface CushionSnapshot {
  allocated: number;
  target: number;
  progress: number;          // allocated / target, clamped [0, 1]; 0 если target = 0
  status: CushionStatus;
}

export interface CalculationSnapshot {
  today: ISODate;
  nextPaycheckDate: ISODate;
  previousPaycheckDate: ISODate;
  rawRemainingDays: number;
  remainingDays: number;
  availableUntilNextPaycheck: number;
  incomeBeforeNextPaycheck: number;
  mandatoryPaymentsBeforeNextPaycheck: number;
  paydayMandatoryPayments: MandatoryPayment[];
  paydayMandatoryPaymentsTotal: number;
  plannedSavingsTransfersBeforeNextPaycheck: number;
  safeToSpendToday: number;
  ifZeroTodayTomorrow: number;
  monthlySavingPace: number;
  savingsForecastNominal: number;
  savingsForecastReal: number;
  yearsUntilPrimaryTarget: number;
  /** Selected only among eligible goals (done / on-track / behind).
   *  `unconfigured`-цели не становятся primary, чтобы Today PaceRow не
   *  привязывался к ещё не настроенной цели. Если eligible пуст,
   *  primaryGoal = undefined и UI фолбэчит на pot-level метрики. */
  primaryGoal?: SavingsGoalSnapshot;
  /** Все цели (включая unconfigured). Savings screen рендерит их группами
   *  по статусу. */
  goals: SavingsGoalSnapshot[];
  upcomingMandatoryPayments: MandatoryPayment[];
  nextMandatoryPayment?: MandatoryPayment;
  overdueMandatoryPayments: MandatoryPayment[];
  uiStates: InterfaceState[];
  primaryState: InterfaceState;

  // ─── v2 savings-pot fields ────────────────────────────────────────
  /** = state.savings.balance (общий котёл) */
  totalSavings: number;
  /** = cushion.allocated + sum(goals.allocated) */
  totalAllocated: number;
  /** = totalSavings - totalAllocated. Может быть < 0, если пользователь
   *  переаллоцировал (Savings screen покажет это явно). */
  unallocatedSavings: number;
  cushion: CushionSnapshot;
}

export type HistoryItemKind =
  | "income"
  | "expense"
  | "transfer-to-savings"
  | "withdrawal-from-savings"
  | "mandatory-payment";

export interface HistoryItem {
  id: string;
  kind: HistoryItemKind;
  title: string;
  amount: number;
  cashEffect?: number;
  date: ISODate;
  categoryId?: string;
  legacyCategory?: string;
  detail?: string;
}
