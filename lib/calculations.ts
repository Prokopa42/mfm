import {
  addDays,
  compareDates,
  daysBetween,
  getFollowingPaycheckDate,
  getNextPaycheckDate,
  getPreviousPaycheckDate,
  isBeforeOrSame,
  isSameDate,
  monthsBetween,
  todayISO
} from "@/lib/dates";
import type {
  CalculationSnapshot,
  FinanceState,
  HistoryItem,
  InterfaceState,
  ISODate,
  MandatoryPayment,
  SavingsGoal,
  SavingsGoalSnapshot
} from "@/lib/types";

export function calculateSnapshot(state: FinanceState, today: ISODate = todayISO()): CalculationSnapshot {
  const firstNextPaycheckDate = getNextPaycheckDate(today, state.settings);
  const nextPaycheckDate =
    isSameDate(firstNextPaycheckDate, today) && isSameDate(state.payCycle.startDate, today)
      ? getFollowingPaycheckDate(today, state.settings)
      : firstNextPaycheckDate;
  const previousPaycheckDate = getPreviousPaycheckDate(today, state.settings);

  const expectedIncome = state.incomes
    .filter((income) => !income.receivedDate)
    .filter((income) => isBeforeOrSame(income.expectedDate, nextPaycheckDate))
    .reduce((sum, income) => sum + income.amount, 0);

  const relevantMandatory = state.mandatoryPayments
    .filter((payment) => payment.status === "scheduled" || payment.status === "missed")
    .filter((payment) => isBeforeOrSame(payment.dueDate, nextPaycheckDate));

  const mandatoryPaymentsBeforeNextPaycheck = relevantMandatory.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );

  const plannedSavingsTransfersBeforeNextPaycheck = state.settings.autoSubtractPlannedSavings
    ? state.transfersToSavings
        .filter((transfer) => transfer.planned)
        .filter((transfer) => isBeforeOrSame(transfer.date, nextPaycheckDate))
        .reduce((sum, transfer) => sum + transfer.amount, 0)
    : 0;

  const availableUntilNextPaycheck =
    state.operationalBalance +
    expectedIncome -
    mandatoryPaymentsBeforeNextPaycheck -
    state.reserve.amount -
    plannedSavingsTransfersBeforeNextPaycheck;

  const rawRemainingDays = daysBetween(today, nextPaycheckDate);
  const divisor = state.settings.includeTodayInDivisor ? rawRemainingDays : rawRemainingDays - 1;
  const remainingDays = Math.max(1, divisor);
  const safeToSpendToday = Math.max(0, availableUntilNextPaycheck) / remainingDays;
  const ifZeroTodayTomorrow = availableUntilNextPaycheck / Math.max(1, remainingDays - 1);

  const monthsSinceStart = Math.max(0, monthsBetween(state.savings.openedAt, today));
  const monthlySavingPace =
    monthsSinceStart > 0
      ? (state.savings.balance - state.savings.baselineBalance) / monthsSinceStart
      : 0;

  const goals = state.goals
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((goal) => calculateGoalSnapshot(goal, state.savings.balance, monthlySavingPace, today));
  const primaryGoal = goals[0];
  const targetDate = primaryGoal?.goal.deadline ?? addDays(today, 365);
  const monthsUntilPrimaryTarget = Math.max(0, monthsBetween(today, targetDate));
  const yearsUntilPrimaryTarget = Math.max(0, daysBetween(today, targetDate) / 365);
  const savingsForecastNominal = state.savings.balance + monthlySavingPace * monthsUntilPrimaryTarget;
  const savingsForecastReal =
    savingsForecastNominal * Math.pow(state.settings.purchasingPowerCoef, yearsUntilPrimaryTarget);

  const tomorrow = addDays(today, 1);
  const upcomingMandatoryPayments = relevantMandatory
    .filter((payment) => compareDates(payment.dueDate, today) >= 0)
    .sort((a, b) => compareDates(a.dueDate, b.dueDate));
  const overdueMandatoryPayments = relevantMandatory
    .filter((payment) => compareDates(payment.dueDate, today) < 0)
    .sort((a, b) => compareDates(a.dueDate, b.dueDate));

  const uiStates = deriveInterfaceStates({
    availableUntilNextPaycheck,
    remainingDays,
    safeToSpendToday,
    isPaydayToday: isSameDate(firstNextPaycheckDate, today) && !isSameDate(state.payCycle.startDate, today),
    hasPaymentTomorrow: relevantMandatory.some((payment) => isSameDate(payment.dueDate, tomorrow)),
    hasOffTrackGoal: goals.some((goal) => Boolean(goal.goal.deadline) && goal.status === "off-track")
  });

  return {
    today,
    nextPaycheckDate,
    previousPaycheckDate,
    rawRemainingDays,
    remainingDays,
    availableUntilNextPaycheck,
    incomeBeforeNextPaycheck: expectedIncome,
    mandatoryPaymentsBeforeNextPaycheck,
    plannedSavingsTransfersBeforeNextPaycheck,
    safeToSpendToday,
    ifZeroTodayTomorrow,
    monthlySavingPace,
    savingsForecastNominal,
    savingsForecastReal,
    yearsUntilPrimaryTarget,
    primaryGoal,
    goals,
    upcomingMandatoryPayments,
    nextMandatoryPayment: upcomingMandatoryPayments[0],
    overdueMandatoryPayments,
    uiStates,
    primaryState: uiStates[0]
  };
}

export function calculateGoalSnapshot(
  goal: SavingsGoal,
  currentSavings: number,
  monthlySavingPace: number,
  today: ISODate
): SavingsGoalSnapshot {
  const gap = Math.max(0, goal.target - currentSavings);
  const overdue = Boolean(goal.deadline && compareDates(goal.deadline, today) < 0);
  const monthsUntilDeadline = goal.deadline ? Math.max(0, monthsBetween(today, goal.deadline)) : null;
  const horizonMonths = monthsUntilDeadline ?? 12;
  const actualPace = monthlySavingPace;
  const requiredPace = gap === 0 ? 0 : horizonMonths > 0 ? gap / horizonMonths : Number.POSITIVE_INFINITY;
  const forecastAtDeadline = currentSavings + actualPace * horizonMonths;
  const projectedGap = Math.max(0, goal.target - forecastAtDeadline);
  const monthsToGoal =
    gap === 0 ? 0 : monthlySavingPace > 0 ? gap / monthlySavingPace : null;
  const status =
    currentSavings >= goal.target
      ? "reached"
      : !goal.deadline || forecastAtDeadline >= goal.target
        ? "on-track"
        : "off-track";
  const onTrack = status !== "off-track";

  return {
    goal,
    gap,
    monthsUntilDeadline,
    horizonMonths,
    monthsToGoal,
    actualPace,
    requiredPace,
    forecastAtDeadline,
    projectedGap,
    status,
    onTrack,
    overdue
  };
}

export function deriveInterfaceStates(input: {
  availableUntilNextPaycheck: number;
  remainingDays: number;
  safeToSpendToday: number;
  isPaydayToday: boolean;
  hasPaymentTomorrow: boolean;
  hasOffTrackGoal: boolean;
}): InterfaceState[] {
  const states: InterfaceState[] = [];

  if (input.isPaydayToday) states.push("payday-arrived");
  if (input.availableUntilNextPaycheck <= 0) states.push("cash-risk");
  if (input.hasPaymentTomorrow) states.push("payment-due-tomorrow");

  const narrowCorridor =
    input.availableUntilNextPaycheck > 0 &&
    (input.remainingDays <= 2 || input.safeToSpendToday < 500);
  if (narrowCorridor) states.push("tight");
  if (input.hasOffTrackGoal) states.push("savings-off-track");

  if (states.length === 0) states.push("normal");
  return states;
}

export function buildHistory(state: FinanceState): HistoryItem[] {
  const items: HistoryItem[] = [
    ...state.incomes
      .filter((income) => income.receivedDate)
      .map((income) => ({
        id: income.id,
        kind: "income" as const,
        title: income.kind === "paycheck" ? "Доход" : "Доход",
        amount: income.amount,
        date: income.receivedDate ?? income.expectedDate,
        detail: income.note
      })),
    ...state.variableExpenses.map((expense) => ({
      id: expense.id,
      kind: "expense" as const,
      title: expense.category || "Расход",
      amount: -expense.amount,
      date: expense.date,
      detail: expense.note
    })),
    ...state.transfersToSavings
      .filter((transfer) => !transfer.planned)
      .map((transfer) => ({
        id: transfer.id,
        kind: "transfer-to-savings" as const,
        title: "В накопления",
        amount: -transfer.amount,
        date: transfer.date,
        detail: transfer.note
      })),
    ...state.withdrawalsFromSavings.map((withdrawal) => ({
      id: withdrawal.id,
      kind: "withdrawal-from-savings" as const,
      title: "Снять с накоплений",
      amount: withdrawal.amount,
      date: withdrawal.date,
      detail: withdrawal.reason
    })),
    ...state.mandatoryPayments
      .filter((payment) => payment.status === "paid")
      .map((payment) => ({
        id: payment.id,
        kind: "mandatory-payment" as const,
        title: payment.title,
        amount: -payment.amount,
        date: payment.dueDate,
        detail: "Обязательный платёж"
      }))
  ];

  return items.sort((a, b) => compareDates(b.date, a.date));
}

export function stateLabel(state: InterfaceState) {
  const labels: Record<InterfaceState, string> = {
    normal: "Норма",
    tight: "Запас мал",
    "cash-risk": "Риск разрыва",
    "payday-arrived": "Зарплата пришла",
    "payment-due-tomorrow": "Платёж завтра",
    "savings-off-track": "Цель отстаёт"
  };
  return labels[state];
}

export function stateText(state: InterfaceState, nextMandatoryPayment?: MandatoryPayment) {
  const values: Record<InterfaceState, string> = {
    normal: "Доступно больше чем на 1 день комфортного запаса.",
    tight: "Денег хватает, но коридор узкий.",
    "cash-risk": "Доступно 0 или меньше 0. Нужна реакция.",
    "payday-arrived": "Сегодня ожидается выплата. Подтвердите и запустите новый цикл.",
    "payment-due-tomorrow": nextMandatoryPayment
      ? `${nextMandatoryPayment.title}: сумма уже учтена в лимите, оплату отметьте отдельно.`
      : "Завтра обязательный платёж: он уже вычтен из лимита.",
    "savings-off-track": "Темп накоплений не выводит на цель к дедлайну."
  };

  return values[state];
}
