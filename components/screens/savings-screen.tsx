"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { EmptyNote, InfoHint, MoneyNumber, Panel, SectionTitle, StateBanner } from "@/components/mfm-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatShortDate } from "@/lib/dates";
import type { CalculationSnapshot, FinanceState, SavingsGoal, SavingsGoalSnapshot } from "@/lib/types";
import { cn, formatMoney, numberFromInput } from "@/lib/utils";

interface SavingsScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onSaveGoal: (goal: Omit<SavingsGoal, "id"> & { id?: string }) => void;
  onDeleteGoal: (goalId: string) => void;
}

type GoalDraft = SavingsGoal | null;

export function SavingsScreen({
  state,
  snapshot,
  onAction,
  onSaveGoal,
  onDeleteGoal
}: SavingsScreenProps) {
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalDraft>(null);
  const offTrack = snapshot.uiStates.includes("savings-off-track");
  const forecastHorizonMonths = 12;
  const forecastDateLabel = "через 12 мес.";
  const forecastNominal = state.savings.balance + snapshot.monthlySavingPace * forecastHorizonMonths;
  const forecastReal = forecastNominal * state.settings.purchasingPowerCoef;

  const overallTrend = useMemo(
    () => buildOverallTrend({
      currentSavings: state.savings.balance,
      horizonMonths: forecastHorizonMonths,
      monthlySavingPace: snapshot.monthlySavingPace
    }),
    [forecastHorizonMonths, snapshot.monthlySavingPace, state.savings.balance]
  );

  function openCreateGoal() {
    setEditingGoal(null);
    setGoalFormOpen(true);
  }

  function openEditGoal(goal: SavingsGoal) {
    setEditingGoal(goal);
    setGoalFormOpen(true);
  }

  function handleSaveGoal(goal: Omit<SavingsGoal, "id"> & { id?: string }) {
    onSaveGoal(goal);
    setGoalFormOpen(false);
    setEditingGoal(null);
  }

  return (
    <div className="grid gap-4">
      <SectionTitle title="Накопления" eyebrow="Отдельный контур" />

      {offTrack ? <StateBanner state="savings-off-track" /> : null}

      <Panel className="overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid grid-cols-[24px_1fr] gap-3">
            <div className="border-2 border-[var(--blue-line)] bg-transparent" />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs font-black uppercase text-[var(--muted-ink)]">
                <span>Темп накоплений</span>
                <InfoHint text="Фактический средний прирост накоплений в месяц с момента старта контура." />
              </div>
              <div className="mt-2">
                <MoneyNumber value={state.savings.balance} size="xl" tone="blue" />
              </div>
              <div className="mt-2 text-sm text-[var(--muted-ink)]">
                Накоплено сейчас · темп{" "}
                <b className="text-[var(--ink)]">{formatMoney(snapshot.monthlySavingPace)} ₽/мес</b>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            <Button variant="blue" onClick={() => onAction("transfer")}>
              <ArrowUpRight className="mr-2 h-4 w-4" />В накопления
            </Button>
            <Button variant="outline" onClick={() => onAction("withdraw")}>
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Снять с накоплений
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b-2 border-[var(--ink)] p-4">
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Прогноз к выбранной дате</div>
          <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <h2 className="slab text-lg uppercase leading-none">Общий прогноз</h2>
              <div className="mt-1 text-sm text-[var(--muted-ink)]">
                Горизонт: {forecastDateLabel} · без привязки к отдельной цели
              </div>
            </div>
            <div className="text-sm text-[var(--muted-ink)]">Расчёт: текущие накопления + темп</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2">
          <div className="border-b-2 border-[var(--ink)] p-4 sm:border-b-0 sm:border-r-2">
            <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Прогноз номинально</div>
            <MoneyNumber value={forecastNominal} size="md" />
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1 text-xs font-black uppercase text-[var(--muted-ink)]">
              <span>В сегодняшних деньгах</span>
              <InfoHint text="Прогноз с поправкой на коэффициент покупательной силы из настроек." />
            </div>
            <MoneyNumber value={forecastReal} size="md" tone={offTrack ? "muted" : "ink"} />
            <div className="mt-2 text-sm text-[var(--muted-ink)]">
              Коэффициент покупательной силы {state.settings.purchasingPowerCoef.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="border-t-2 border-[var(--ink)] p-4">
          <OverallSavingsChart trend={overallTrend} />
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Цели накоплений</div>
            <h2 className="slab text-lg uppercase leading-none">Цели накоплений</h2>
            <div className="mt-1 text-sm text-[var(--muted-ink)]">
              Все цели считаются от общей суммы накоплений. Распределение денег по отдельным целям в MVP не ведётся.
            </div>
          </div>
          <Button variant="secondary" onClick={openCreateGoal}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить цель
          </Button>
        </div>

        <div className="grid gap-3">
          {snapshot.goals.length === 0 ? (
            <EmptyNote>Целей пока нет. Добавьте цель, чтобы видеть дедлайн и разрыв.</EmptyNote>
          ) : (
            snapshot.goals.map((item) => (
              <GoalCard
                key={item.goal.id}
                item={item}
                currentSavings={state.savings.balance}
                onEdit={() => openEditGoal(item.goal)}
                onDelete={() => onDeleteGoal(item.goal.id)}
              />
            ))
          )}
        </div>
      </Panel>

      <GoalFormDialog
        open={goalFormOpen}
        goal={editingGoal}
        onOpenChange={(open) => {
          setGoalFormOpen(open);
          if (!open) setEditingGoal(null);
        }}
        onSave={handleSaveGoal}
      />
    </div>
  );
}

function GoalCard({
  item,
  currentSavings,
  onEdit,
  onDelete
}: {
  item: SavingsGoalSnapshot;
  currentSavings: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const progress = item.goal.target > 0 ? Math.min(100, (currentSavings / item.goal.target) * 100) : 0;
  const goalStatus = goalStatusLabel(item.status);
  const statusTone = item.status === "off-track" ? "text-[var(--red)]" : "text-[var(--blue)]";
  const deadlineLabel = item.goal.deadline ? formatShortDate(item.goal.deadline) : "12 мес.";

  return (
    <div className="border-2 border-[var(--ink)] p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <div className="slab truncate text-base uppercase">{item.goal.title}</div>
          <div className="mt-1 text-sm text-[var(--muted-ink)]">
            Цель: {formatMoney(item.goal.target)} ₽
            {item.goal.deadline ? ` · дедлайн ${formatShortDate(item.goal.deadline)}` : " · без дедлайна"}
            {` · приоритет ${item.goal.priority}`}
          </div>
        </div>
        <div className={cn("text-left sm:text-right", statusTone)}>
          <div className="inline-flex items-center gap-1">
            <span className="slab text-sm uppercase">{goalStatus}</span>
            <InfoHint text="Статус сравнивает прогноз к дедлайну с целевой суммой при текущем темпе." />
          </div>
          <div className="text-xs text-[var(--ink)]">Не хватает сейчас: {formatMoney(item.gap)} ₽</div>
        </div>
      </div>

      <div className="mt-3">
        <Progress value={progress} tone={item.status === "off-track" ? "red" : "blue"} />
        <div className="mt-1 flex justify-between gap-3 text-xs text-[var(--muted-ink)]">
          <span>{formatMoney(currentSavings)} ₽ сейчас</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      <div className="mt-3">
        <GoalLineChart item={item} currentSavings={currentSavings} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <TrendStat label="Не хватает" value={`${formatMoney(item.gap)} ₽`} danger={item.gap > 0} />
        <TrendStat label={`К ${deadlineLabel}`} value={`${formatMoney(item.forecastAtDeadline)} ₽`} />
        <TrendStat
          label="Разрыв к дедлайну"
          value={`${formatMoney(item.projectedGap)} ₽`}
          danger={item.projectedGap > 0}
        />
        <TrendStat label="Темп нужен" value={formatPace(item.requiredPace)} danger={item.requiredPace > item.actualPace} />
        <TrendStat label="Темп сейчас" value={formatPace(item.actualPace)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Редактировать
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Удалить
        </Button>
      </div>
    </div>
  );
}

function GoalFormDialog({
  open,
  goal,
  onOpenChange,
  onSave
}: {
  open: boolean;
  goal: GoalDraft;
  onOpenChange: (open: boolean) => void;
  onSave: (goal: Omit<SavingsGoal, "id"> & { id?: string }) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const target = numberFromInput(form.get("target"));
    const priority = Math.max(1, Math.round(numberFromInput(form.get("priority"), 1)));
    const deadline = String(form.get("deadline") || "");

    if (!title || target <= 0) return;

    onSave({
      id: goal?.id,
      title,
      target,
      deadline: deadline || undefined,
      priority
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? "Редактировать цель" : "Добавить цель"}</DialogTitle>
          <DialogDescription>
            Цель хранится локально вместе с остальными данными приложения.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="goal-title">Название</Label>
            <Input id="goal-title" name="title" defaultValue={goal?.title ?? ""} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="goal-target">Сумма цели</Label>
            <Input
              id="goal-target"
              name="target"
              inputMode="decimal"
              defaultValue={goal?.target ?? ""}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="goal-deadline">Дедлайн</Label>
            <Input id="goal-deadline" name="deadline" type="date" defaultValue={goal?.deadline ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="goal-priority">Приоритет</Label>
            <Input
              id="goal-priority"
              name="priority"
              type="number"
              min={1}
              step={1}
              defaultValue={goal?.priority ?? 1}
              required
            />
          </div>
          <Button type="submit" variant="secondary">
            {goal ? "Сохранить цель" : "Добавить цель"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TrendStat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="border-2 border-[var(--ink)] p-3">
      <div className="text-xs font-black uppercase text-[var(--muted-ink)]">{label}</div>
      <div className={cn("slab mt-1 text-sm uppercase sm:text-base", danger ? "text-[var(--red)]" : "text-[var(--ink)]")}>
        {value}
      </div>
    </div>
  );
}

interface TrendPoint {
  month: number;
  value: number;
}

interface OverallSavingsTrend {
  horizonMonths: number;
  minValue: number;
  maxValue: number;
  points: TrendPoint[];
}

function OverallSavingsChart({ trend }: { trend: OverallSavingsTrend }) {
  const path = buildChartPath(trend.points, trend.horizonMonths, trend.minValue, trend.maxValue);
  const start = trend.points[0];
  const end = trend.points[trend.points.length - 1];

  return (
    <div className="border-2 border-[var(--ink)] bg-[var(--paper)] p-3">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Линия темпа</div>
          <div className="slab text-sm uppercase">Сейчас → 12 месяцев</div>
        </div>
        <div className="text-right text-xs text-[var(--muted-ink)]">
          {formatMoney(start.value)} ₽ → {formatMoney(end.value)} ₽
        </div>
      </div>
      <svg viewBox="0 0 320 104" className="h-32 w-full" role="img" aria-label="Прогноз накоплений на 12 месяцев">
        <line x1="18" y1="82" x2="304" y2="82" stroke="var(--ink)" strokeWidth="2" />
        {trend.points.map((point) => {
          const x = chartX(point.month, trend.horizonMonths);
          return (
            <line
              key={point.month}
              x1={x}
              y1="78"
              x2={x}
              y2="86"
              stroke="var(--ink)"
              strokeWidth={point.month === 0 || point.month === trend.horizonMonths ? 2 : 1}
            />
          );
        })}
        <path d={path} fill="none" stroke="var(--blue-line)" strokeWidth="3" strokeLinecap="square" />
        <circle cx={chartX(0, trend.horizonMonths)} cy={chartY(start.value, trend.minValue, trend.maxValue)} r="4" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
        <circle cx={chartX(trend.horizonMonths, trend.horizonMonths)} cy={chartY(end.value, trend.minValue, trend.maxValue)} r="5" fill="var(--paper)" stroke="var(--blue-line)" strokeWidth="2" />
      </svg>
    </div>
  );
}

function GoalLineChart({ item, currentSavings }: { item: SavingsGoalSnapshot; currentSavings: number }) {
  const horizonMonths = Math.max(1, item.horizonMonths);
  const points = buildForecastPoints(currentSavings, item.actualPace, item.horizonMonths);
  const values = [...points.map((point) => point.value), item.goal.target, item.forecastAtDeadline];
  const { minValue, maxValue } = chartBounds(values);
  const path = buildChartPath(points, horizonMonths, minValue, maxValue);
  const targetY = chartY(item.goal.target, minValue, maxValue);
  const riskStep = Math.max(1, Math.floor(points.length / 5));
  const riskMonths = points.filter(
    (point, index) => index > 0 && index < points.length - 1 && index % riskStep === 0 && point.value < item.goal.target
  );
  const finalPoint = points[points.length - 1];

  return (
    <div className="border-2 border-[var(--ink)] bg-[var(--paper)] p-3">
      <svg viewBox="0 0 320 116" className="h-36 w-full" role="img" aria-label={`Прогноз цели ${item.goal.title}`}>
        <line x1="18" y1="86" x2="304" y2="86" stroke="var(--ink)" strokeWidth="2" />
        <line
          x1="18"
          y1={targetY}
          x2="304"
          y2={targetY}
          stroke="var(--red-line)"
          strokeWidth="2"
          strokeDasharray="6 5"
        />
        {riskMonths.map((point) => {
          const x = chartX(point.month, horizonMonths);
          const y = chartY(point.value, minValue, maxValue);
          return (
            <line
              key={point.month}
              x1={x}
              y1={y}
              x2={x}
              y2="86"
              stroke="var(--yellow-line)"
              strokeWidth="2"
              strokeDasharray="2 4"
            />
          );
        })}
        <path d={path} fill="none" stroke="var(--blue-line)" strokeWidth="3" strokeLinecap="square" />
        <rect
          x={chartX(0, horizonMonths) - 4}
          y={chartY(currentSavings, minValue, maxValue) - 4}
          width="8"
          height="8"
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth="2"
        />
        <circle
          cx={chartX(horizonMonths, horizonMonths)}
          cy={chartY(finalPoint.value, minValue, maxValue)}
          r="5"
          fill="var(--paper)"
          stroke="var(--blue-line)"
          strokeWidth="2"
        />
        <rect
          x="286"
          y={targetY - 5}
          width="10"
          height="10"
          fill="var(--paper)"
          stroke="var(--red-line)"
          strokeWidth="2"
        />
        <text x="18" y="108" className="fill-[var(--muted-ink)] text-[10px] font-black uppercase">
          сейчас
        </text>
        <text x="304" y="108" textAnchor="end" className="fill-[var(--muted-ink)] text-[10px] font-black uppercase">
          {item.goal.deadline ? formatShortDate(item.goal.deadline) : "12 мес."}
        </text>
      </svg>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] font-black uppercase text-[var(--muted-ink)]">
        <span className="flex items-center gap-1"><span className="h-2 w-4 border-b-2 border-[var(--blue-line)]" />прогноз</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 border-b-2 border-dashed border-[var(--red-line)]" />цель</span>
        <span className="flex items-center gap-1"><span className="h-3 w-1 border-l-2 border-dashed border-[var(--yellow-line)]" />риск</span>
      </div>
    </div>
  );
}

function buildOverallTrend({
  currentSavings,
  horizonMonths,
  monthlySavingPace
}: {
  currentSavings: number;
  horizonMonths: number;
  monthlySavingPace: number;
}): OverallSavingsTrend {
  const points = buildForecastPoints(currentSavings, monthlySavingPace, horizonMonths);
  const { minValue, maxValue } = chartBounds(points.map((point) => point.value));

  return {
    horizonMonths,
    minValue,
    maxValue,
    points
  };
}

function buildForecastPoints(currentSavings: number, monthlySavingPace: number, horizonMonths: number) {
  const chartHorizon = Math.max(1, horizonMonths);
  const steps = Math.max(2, Math.min(12, Math.ceil(chartHorizon)));
  const points: TrendPoint[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const drawMonth = step === steps ? chartHorizon : (chartHorizon / steps) * step;
    const valueMonth = horizonMonths <= 0 ? 0 : Math.min(horizonMonths, drawMonth);
    points.push({
      month: drawMonth,
      value: currentSavings + monthlySavingPace * valueMonth
    });
  }

  return points;
}

function buildChartPath(points: TrendPoint[], horizonMonths: number, minValue: number, maxValue: number) {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${chartX(point.month, Math.max(1, horizonMonths)).toFixed(1)} ${chartY(point.value, minValue, maxValue).toFixed(1)}`;
    })
    .join(" ");
}

function chartBounds(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const padding = spread * 0.18;

  return {
    minValue: min - padding,
    maxValue: max + padding
  };
}

function chartX(month: number, horizonMonths: number) {
  return 18 + (Math.max(0, month) / Math.max(1, horizonMonths)) * 286;
}

function chartY(value: number, minValue: number, maxValue: number) {
  return 12 + (1 - (value - minValue) / Math.max(1, maxValue - minValue)) * 70;
}

function formatPace(value: number) {
  if (!Number.isFinite(value)) return "сразу";
  return `${formatMoney(value)} ₽/мес`;
}

function goalStatusLabel(status: SavingsGoalSnapshot["status"]) {
  const labels: Record<SavingsGoalSnapshot["status"], string> = {
    reached: "Цель достигнута",
    "on-track": "В графике",
    "off-track": "Цель отстаёт"
  };

  return labels[status];
}
