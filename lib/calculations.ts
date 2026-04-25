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
  CushionSnapshot,
  CushionStatus,
  FinanceState,
  GoalStatus,
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
    .map((goal) => calculateGoalSnapshot(goal, today));

  // primaryGoal selection — only goals the user has actually started managing
  // (done/on-track/behind). "unconfigured" goals NEVER become primary, so
  // Today PaceRow doesn't bind hero metrics to a not-yet-configured envelope.
  const eligibleGoals = goals.filter(
    (g) => g.status === "done" || g.status === "on-track" || g.status === "behind"
  );
  const primaryGoal: SavingsGoalSnapshot | undefined = eligibleGoals[0];

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
    hasOffTrackGoal: goals.some((goal) => Boolean(goal.goal.deadline) && goal.status === "behind")
  });

  // ─── v2 savings-pot allocation ──────────────────────────────────
  // Invariant: cushion.allocated + sum(goals.allocated) + unallocated = totalSavings
  const totalSavings = state.savings.balance;
  const cushionAllocated = state.savings.cushion.allocated;
  const cushionTarget = state.savings.cushion.target;
  const goalsAllocatedSum = state.goals.reduce((sum, g) => sum + g.allocated, 0);
  const totalAllocated = cushionAllocated + goalsAllocatedSum;
  const unallocatedSavings = totalSavings - totalAllocated;

  const cushionProgress = cushionTarget > 0
    ? Math.max(0, Math.min(1, cushionAllocated / cushionTarget))
    : 0;

  // Quiet-on-migration: target = 0 → "unset" (not configured), not alarming.
  // Critical/low/ok only when user has set a target.
  const cushionStatus: CushionStatus =
    cushionTarget <= 0                        ? "unset" :
    cushionAllocated >= cushionTarget         ? "ok" :
    cushionAllocated < cushionTarget / 2      ? "critical" :
                                                "low";

  const cushion: CushionSnapshot = {
    allocated: cushionAllocated,
    target: cushionTarget,
    progress: cushionProgress,
    status: cushionStatus
  };

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
    primaryState: uiStates[0],
    totalSavings,
    totalAllocated,
    unallocatedSavings,
    cushion
  };
}

/**
 * Per-goal envelope snapshot — strictly within this goal's allocation,
 * NOT against the total pot. Each goal is independent.
 *
 * Quiet-on-migration: цель без выраженного намерения (allocated = 0 AND
 * plannedPace = 0) получает status = "unconfigured" — нейтрально, не
 * тревожит UI. Status переходит в done/on-track/behind только когда
 * пользователь начал её "вести".
 */
export function calculateGoalSnapshot(
  goal: SavingsGoal,
  today: ISODate
): SavingsGoalSnapshot {
  const allocatedNow = goal.allocated;
  const plannedPace = goal.plannedPace;
  const monthsLeft = goal.deadline ? Math.max(0, monthsBetween(today, goal.deadline)) : null;
  const gapNow = Math.max(0, goal.target - allocatedNow);
  const requiredPace =
    gapNow === 0 ? 0 :
    monthsLeft !== null && monthsLeft > 0 ? gapNow / monthsLeft :
    Number.POSITIVE_INFINITY;
  const horizon = monthsLeft ?? 12;
  const forecastAtDeadline = allocatedNow + plannedPace * horizon;
  const gapAtDeadline = Math.max(0, goal.target - forecastAtDeadline);

  const intentExpressed = allocatedNow > 0 || plannedPace > 0;
  const status: GoalStatus =
    allocatedNow >= goal.target ? "done" :
    !intentExpressed             ? "unconfigured" :
    forecastAtDeadline >= goal.target ? "on-track" : "behind";

  return {
    goal,
    allocatedNow,
    gapNow,
    monthsLeft,
    requiredPace,
    plannedPace,
    forecastAtDeadline,
    gapAtDeadline,
    status
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
