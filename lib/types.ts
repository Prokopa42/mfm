export type ISODate = string;

export type IncomeKind = "paycheck" | "other";
export type MandatoryPaymentRecurrence = "monthly" | "once";
export type MandatoryPaymentStatus = "scheduled" | "paid" | "missed";
export type ReservePolicy = "flat" | "perCycle";
export type CalculationRounding = "day" | "hour";

export type InterfaceState =
  | "normal"
  | "tight"
  | "cash-risk"
  | "payday-arrived"
  | "payment-due-tomorrow"
  | "savings-off-track";

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
  note?: string;
}

export interface MandatoryPayment {
  id: string;
  title: string;
  amount: number;
  dueDate: ISODate;
  recurrence: MandatoryPaymentRecurrence;
  status: MandatoryPaymentStatus;
}

export interface VariableExpense {
  id: string;
  amount: number;
  date: ISODate;
  category?: string;
  note?: string;
}

export interface Reserve {
  amount: number;
  policy: ReservePolicy;
}

export interface Savings {
  balance: number;
  openedAt: ISODate;
  baselineBalance: number;
}

export interface TransferToSavings {
  id: string;
  amount: number;
  date: ISODate;
  planned: boolean;
  linkedGoalId?: string;
  note?: string;
}

export interface WithdrawalFromSavings {
  id: string;
  amount: number;
  date: ISODate;
  reason?: string;
}

export interface SavingsGoal {
  id: string;
  title: string;
  target: number;
  deadline?: ISODate;
  priority: number;
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
  schemaVersion: 1;
  operationalBalance: number;
  payCycle: PayCycle;
  incomes: Income[];
  mandatoryPayments: MandatoryPayment[];
  variableExpenses: VariableExpense[];
  reserve: Reserve;
  savings: Savings;
  transfersToSavings: TransferToSavings[];
  withdrawalsFromSavings: WithdrawalFromSavings[];
  goals: SavingsGoal[];
  settings: CalculationSettings;
}

export interface SavingsGoalSnapshot {
  goal: SavingsGoal;
  gap: number;
  monthsUntilDeadline: number | null;
  horizonMonths: number;
  monthsToGoal: number | null;
  actualPace: number;
  requiredPace: number;
  forecastAtDeadline: number;
  projectedGap: number;
  status: "reached" | "on-track" | "off-track";
  onTrack: boolean;
  overdue: boolean;
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
  plannedSavingsTransfersBeforeNextPaycheck: number;
  safeToSpendToday: number;
  ifZeroTodayTomorrow: number;
  monthlySavingPace: number;
  savingsForecastNominal: number;
  savingsForecastReal: number;
  yearsUntilPrimaryTarget: number;
  primaryGoal?: SavingsGoalSnapshot;
  goals: SavingsGoalSnapshot[];
  upcomingMandatoryPayments: MandatoryPayment[];
  nextMandatoryPayment?: MandatoryPayment;
  overdueMandatoryPayments: MandatoryPayment[];
  uiStates: InterfaceState[];
  primaryState: InterfaceState;
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
  date: ISODate;
  detail?: string;
}
