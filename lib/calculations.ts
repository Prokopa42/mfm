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
  DailyCheck,
  DailyCheckStatus,
  FinanceState,
  GoalStatus,
  HistoryItem,
  IncomeKind,
  InterfaceState,
  ISODate,
  MandatoryPayment,
  SavingsGoal,
  SavingsGoalSnapshot
} from "@/lib/types";

export function getDailyCheck(state: FinanceState, date: ISODate): DailyCheck | undefined {
  return state.dailyChecks.find((check) => check.date === date);
}

export function calculateDailyCheckOutcome(input: {
  morningBalance?: number;
  eveningBalance?: number;
  incomeAmount?: number;
  transferToSavingsAmount?: number;
  withdrawalFromSavingsAmount?: number;
  mandatoryPaidAmount?: number;
  quickSpentAmount?: number;
  creditSpentAmount?: number;
  creditPaymentAmount?: number;
  plannedLimit: number;
}): {
  grossOutflow?: number;
  freeSpent?: number;
  delta?: number;
  calculatedEveningBalance?: number;
  status: DailyCheckStatus;
} {
  if (input.morningBalance === undefined) {
    return { status: "draft" };
  }

  const incomeAmount = input.incomeAmount ?? 0;
  const transferToSavingsAmount = input.transferToSavingsAmount ?? 0;
  const withdrawalFromSavingsAmount = input.withdrawalFromSavingsAmount ?? 0;
  const mandatoryPaidAmount = input.mandatoryPaidAmount ?? 0;
  const quickSpentAmount = input.quickSpentAmount ?? 0;
  const creditSpentAmount = input.creditSpentAmount ?? 0;
  const creditPaymentAmount = input.creditPaymentAmount ?? 0;
  const plannedLimit = Math.max(0, input.plannedLimit);

  let grossOutflow: number;
  let freeSpent: number;
  let calculatedEveningBalance: number | undefined;

  if (input.eveningBalance !== undefined) {
    grossOutflow =
      input.morningBalance +
      incomeAmount +
      withdrawalFromSavingsAmount -
      input.eveningBalance -
      transferToSavingsAmount;
    const creditFactAddon = input.eveningBalance < 0 ? 0 : creditSpentAmount;
    freeSpent = grossOutflow - mandatoryPaidAmount + creditFactAddon;
  } else if (quickSpentAmount > 0 || creditSpentAmount > 0 || creditPaymentAmount > 0) {
    calculatedEveningBalance =
      input.morningBalance +
      incomeAmount +
      withdrawalFromSavingsAmount -
      transferToSavingsAmount -
      mandatoryPaidAmount -
      quickSpentAmount -
      creditPaymentAmount;
    grossOutflow = mandatoryPaidAmount + quickSpentAmount + creditSpentAmount + creditPaymentAmount;
    freeSpent = quickSpentAmount + creditSpentAmount + creditPaymentAmount;
  } else {
    return { status: "draft" };
  }

  const delta = plannedLimit - freeSpent;
  const status: DailyCheckStatus =
    delta >= 0
      ? "ok"
      : plannedLimit <= 0 || freeSpent > plannedLimit * 1.5
        ? "risk"
        : "warning";

  return {
    grossOutflow,
    freeSpent,
    delta,
    calculatedEveningBalance,
    status
  };
}

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

  const unpaidMandatoryPayments = state.mandatoryPayments
    .filter((payment) => payment.status === "scheduled" || payment.status === "missed");
  const mandatoryPaymentsBeforeNextPaycheckList = unpaidMandatoryPayments
    .filter((payment) => compareDates(payment.dueDate, nextPaycheckDate) < 0);
  const paydayMandatoryPayments = unpaidMandatoryPayments
    .filter((payment) => isSameDate(payment.dueDate, nextPaycheckDate));
  const visibleMandatoryPaymentsUntilNextPaycheck = [
    ...mandatoryPaymentsBeforeNextPaycheckList,
    ...paydayMandatoryPayments
  ];

  const mandatoryPaymentsBeforeNextPaycheck = mandatoryPaymentsBeforeNextPaycheckList.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );
  const paydayMandatoryPaymentsTotal = paydayMandatoryPayments.reduce(
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

  const savingsPaceStats = calculateSavingsPaceStats(state, today);
  const monthlySavingPace = savingsPaceStats.monthlyPace;

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
  const upcomingMandatoryPayments = visibleMandatoryPaymentsUntilNextPaycheck
    .filter((payment) => compareDates(payment.dueDate, today) >= 0)
    .sort((a, b) => compareDates(a.dueDate, b.dueDate));
  const nextMandatoryPaymentDate = upcomingMandatoryPayments[0]?.dueDate;
  const nextMandatoryPayments = nextMandatoryPaymentDate
    ? upcomingMandatoryPayments.filter((payment) => isSameDate(payment.dueDate, nextMandatoryPaymentDate))
    : [];
  const overdueMandatoryPayments = visibleMandatoryPaymentsUntilNextPaycheck
    .filter((payment) => compareDates(payment.dueDate, today) < 0)
    .sort((a, b) => compareDates(a.dueDate, b.dueDate));

  const uiStates = deriveInterfaceStates({
    availableUntilNextPaycheck,
    remainingDays,
    safeToSpendToday,
    isPaydayToday: isSameDate(firstNextPaycheckDate, today) && !isSameDate(state.payCycle.startDate, today),
    hasPaymentTomorrow: visibleMandatoryPaymentsUntilNextPaycheck.some((payment) => isSameDate(payment.dueDate, tomorrow)),
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
    paydayMandatoryPayments,
    paydayMandatoryPaymentsTotal,
    plannedSavingsTransfersBeforeNextPaycheck,
    safeToSpendToday,
    ifZeroTodayTomorrow,
    monthlySavingPace,
    savingsMovementCount: savingsPaceStats.movementCount,
    savingsPaceDays: savingsPaceStats.spanDays,
    savingsForecastNominal,
    savingsForecastReal,
    yearsUntilPrimaryTarget,
    primaryGoal,
    goals,
    upcomingMandatoryPayments,
    nextMandatoryPayment: upcomingMandatoryPayments[0],
    nextMandatoryPayments,
    nextMandatoryPaymentDate,
    overdueMandatoryPayments,
    uiStates,
    primaryState: uiStates[0],
    totalSavings,
    totalAllocated,
    unallocatedSavings,
    cushion
  };
}

function calculateSavingsPaceStats(state: FinanceState, today: ISODate) {
  const operations = [
    ...state.transfersToSavings
      .filter((transfer) => !transfer.planned)
      .map((transfer) => ({
        date: transfer.date,
        delta: transfer.amount
      })),
    ...state.withdrawalsFromSavings.map((withdrawal) => ({
      date: withdrawal.date,
      delta: -withdrawal.amount
    }))
  ]
    .filter((operation) => compareDates(operation.date, today) <= 0)
    .sort((a, b) => compareDates(a.date, b.date));

  if (operations.length === 0) {
    return {
      movementCount: 0,
      spanDays: 0,
      monthlyPace: 0
    };
  }

  const firstDate = operations[0].date;
  const spanDays = Math.max(0, daysBetween(firstDate, today));
  const netMovement = operations.reduce((sum, operation) => sum + operation.delta, 0);

  if (spanDays < 7) {
    return {
      movementCount: operations.length,
      spanDays,
      monthlyPace: 0
    };
  }

  return {
    movementCount: operations.length,
    spanDays,
    monthlyPace: netMovement / monthsBetween(firstDate, today)
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
  const creditTitleById = new Map(state.credits.map((credit) => [credit.id, credit.title]));
  const items: HistoryItem[] = [
    ...state.incomes
      .filter((income) => income.receivedDate)
      .map((income) => ({
        id: income.id,
        kind: "income" as const,
        title: income.title || incomeKindLabel(income.kind),
        amount: income.amount,
        date: income.receivedDate ?? income.expectedDate,
        categoryId: income.categoryId,
        detail: joinDetails(
          income.title && income.title !== incomeKindLabel(income.kind)
            ? incomeKindLabel(income.kind)
            : undefined,
          income.note
        )
      })),
    ...state.variableExpenses.map((expense) => ({
      id: expense.id,
      kind: "expense" as const,
      title: expense.title || expense.category || "Расход",
      amount: -expense.amount,
      cashEffect: expense.paymentSource === "credit" ? 0 : -expense.amount,
      date: expense.date,
      categoryId: expense.categoryId,
      legacyCategory: expense.category,
      detail: joinDetails(
        expense.paymentSource === "credit"
          ? `Кредит · ${creditTitleById.get(expense.linkedCreditId ?? "") ?? "кредит"}`
          : undefined,
        expense.note
      )
    })),
    ...state.transfersToSavings
      .filter((transfer) => !transfer.planned)
      .map((transfer) => ({
        id: transfer.id,
        kind: "transfer-to-savings" as const,
        title: transfer.title || "В накопления",
        amount: -transfer.amount,
        date: transfer.date,
        categoryId: transfer.categoryId,
        detail: transfer.note
      })),
    ...state.withdrawalsFromSavings.map((withdrawal) => ({
      id: withdrawal.id,
      kind: "withdrawal-from-savings" as const,
      title: withdrawal.title || "Снять с накоплений",
      amount: withdrawal.amount,
      date: withdrawal.date,
      categoryId: withdrawal.categoryId,
      detail: withdrawal.note || withdrawal.reason
    })),
    ...state.mandatoryPayments
      .filter((payment) => payment.status === "paid")
      .map((payment) => ({
        id: payment.id,
        kind: "mandatory-payment" as const,
        title: payment.title,
        amount: -payment.amount,
        date: payment.dueDate,
        categoryId: payment.categoryId,
        detail: "Обязательный платёж"
      }))
  ];

  return items.sort((a, b) => compareDates(b.date, a.date));
}

function incomeKindLabel(kind: IncomeKind) {
  const labels: Record<IncomeKind, string> = {
    paycheck: "Зарплата",
    bonus: "Премия",
    other: "Доход"
  };
  return labels[kind];
}

function joinDetails(...parts: Array<string | undefined>) {
  const values = parts.map((part) => part?.trim()).filter(Boolean);
  return values.length > 0 ? values.join(" · ") : undefined;
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
    normal: "Денег хватает на сегодня и ближайшие обязательства.",
    tight: "Денег хватает, но запас небольшой.",
    "cash-risk": "После платежей и подушки денег не хватает. Нужна реакция.",
    "payday-arrived": "Сегодня ожидается выплата. Подтвердите и запустите новый цикл.",
    "payment-due-tomorrow": nextMandatoryPayment
      ? `${nextMandatoryPayment.title}: сумма уже учтена в лимите, оплату отметьте отдельно.`
      : "Завтра обязательный платёж: он уже вычтен из лимита.",
    "savings-off-track": "Темп накоплений не выводит на цель к дедлайну."
  };

  return values[state];
}
