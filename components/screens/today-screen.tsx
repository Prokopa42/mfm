"use client";

import { ArrowRight, Minus, Plus } from "lucide-react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { InfoHint, Metric, MoneyNumber, Panel, StateBanner } from "@/components/mfm-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { addDays, formatLongDate, formatShortDate, isSameDate } from "@/lib/dates";
import type { CalculationSnapshot, FinanceState } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface TodayScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onConfirmPaycheck: () => void;
}

export function TodayScreen({ state, snapshot, onAction, onConfirmPaycheck }: TodayScreenProps) {
  const cycleDays = Math.max(1, snapshot.rawRemainingDays);
  const runway = Array.from({ length: Math.min(Math.max(cycleDays, 5), 11) }, (_, index) => {
    const date = addDays(snapshot.today, index);
    const divisor = Math.max(1, snapshot.remainingDays - index);
    const projected = Math.max(0, snapshot.availableUntilNextPaycheck) / divisor;
    const payment = state.mandatoryPayments.find(
      (item) => item.status !== "paid" && isSameDate(item.dueDate, date)
    );

    return { date, projected, payment, today: index === 0 };
  });
  const progress = Math.max(0, Math.min(100, (cycleDays / Math.max(1, cycleDays + 1)) * 100));
  const showConfirmPaycheck = snapshot.uiStates.includes("payday-arrived");

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-[var(--muted-ink)]">{formatLongDate(snapshot.today)}</div>
          <h1 className="slab text-2xl uppercase leading-none">Сегодня</h1>
        </div>
        <Badge variant="outline">До зарплаты: {snapshot.rawRemainingDays} дн.</Badge>
      </div>

      {snapshot.uiStates.map((item) => (
        <StateBanner key={item} state={item} nextMandatoryPayment={snapshot.nextMandatoryPayment} />
      ))}

      <Panel className="overflow-hidden">
        <div className="grid grid-cols-[28px_1fr] gap-3 p-4 sm:grid-cols-[36px_1fr]">
          <div className="border-2 border-[var(--ink)] bg-[var(--yellow-soft)]" />
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs font-black uppercase text-[var(--muted-ink)]">
              <span>Можно потратить сегодня</span>
              <InfoHint text="Дневной лимит: свободные деньги до зарплаты делятся на оставшиеся дни." />
            </div>
            <div className="mt-2">
              <MoneyNumber
                value={snapshot.safeToSpendToday}
                size="xl"
                tone={snapshot.primaryState === "cash-risk" ? "red" : "ink"}
                strike={snapshot.primaryState === "cash-risk"}
              />
            </div>
          </div>
        </div>

        <details className="border-t-2 border-[var(--ink)]">
          <summary className="cursor-pointer list-none p-4 text-xs font-black uppercase text-[var(--ink)]">
            Как это считается
          </summary>
          <div className="grid gap-2 border-t-2 border-[var(--ink)] p-4 text-sm">
            <FormulaRow label="Оперативный остаток" value={state.operationalBalance} />
            {snapshot.incomeBeforeNextPaycheck > 0 ? (
              <FormulaRow label="Плюс ожидаемые доходы до зарплаты" value={snapshot.incomeBeforeNextPaycheck} positive />
            ) : null}
            <FormulaRow label="Минус обязательные платежи до зарплаты" value={snapshot.mandatoryPaymentsBeforeNextPaycheck} negative />
            <FormulaRow label="Минус подушка" value={state.reserve.amount} negative />
            <FormulaRow label="Минус плановые переводы в накопления" value={snapshot.plannedSavingsTransfersBeforeNextPaycheck} negative />
            <div className="border-t-2 border-[var(--ink)] pt-2">
              <FormulaRow label="Свободно до зарплаты" value={snapshot.availableUntilNextPaycheck} strong />
              <div className="mt-1 flex justify-between gap-3">
                <span className="text-[var(--muted-ink)]">Осталось дней</span>
                <span className="slab uppercase">{snapshot.remainingDays}</span>
              </div>
              <FormulaRow label="Итог: можно потратить сегодня" value={snapshot.safeToSpendToday} strong />
            </div>
          </div>
        </details>

        <div className="border-t-2 border-[var(--ink)] p-4">
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div className="text-sm leading-snug text-[var(--muted-ink)]">
              Если сегодня не трачу — завтра могу
            </div>
            <MoneyNumber value={Math.max(0, snapshot.ifZeroTodayTomorrow)} size="md" />
          </div>
        </div>

        {showConfirmPaycheck ? (
          <div className="border-t-2 border-[var(--ink)] border-l-[10px] border-l-[var(--blue-line)] bg-[var(--paper-3)] p-3">
            <Button className="w-full" variant="default" onClick={onConfirmPaycheck}>
              Подтвердить зарплату и начать новый цикл
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <div className="grid grid-cols-3">
          <Metric
            label="Оперативный остаток"
            value={`${formatMoney(state.operationalBalance)} ₽`}
            info="Деньги в текущем контуре: из них считается жизнь до зарплаты."
          />
          <Metric
            label="Подушка"
            value={`${formatMoney(state.reserve.amount)} ₽`}
            info="Защитный запас внутри текущей системы. Он не считается свободными деньгами."
          />
          <Metric
            label="Накопления"
            value={`${formatMoney(state.savings.balance)} ₽`}
            tone="blue"
            info="Отдельный контур денег на цели и будущее. Это не подушка текущего цикла."
          />
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Цикл</div>
            <div className="slab text-lg uppercase">
              {formatShortDate(snapshot.today)} <ArrowRight className="mb-1 inline h-4 w-4" />{" "}
              {formatShortDate(snapshot.nextPaycheckDate)}
            </div>
          </div>
          <div className="text-right text-xs text-[var(--muted-ink)]">
            маркеры обязательных платежей
          </div>
        </div>
        <Progress value={progress} tone={snapshot.primaryState === "cash-risk" ? "red" : "blue"} />
        <div className="mt-3 grid grid-cols-5 gap-1 sm:grid-cols-11">
          {runway.map((day) => (
            <div
              key={day.date}
              className={[
                "flex min-h-16 flex-col justify-between border-2 border-[var(--ink)] p-1 text-center",
                day.today ? "bg-[var(--ink)] text-[var(--paper)]" : day.payment ? "bg-[var(--yellow-soft)]" : "bg-[var(--paper)]"
              ].join(" ")}
            >
              <span className="slab text-xs">{formatShortDate(day.date).replace(".", "")}</span>
              {day.payment ? <span className="truncate text-[10px] font-black uppercase">{day.payment.title}</span> : <span />}
              <span className="text-[11px]">{formatMoney(day.projected)} ₽</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="text-xs font-black uppercase text-[var(--muted-ink)]">
            Ближайший обязательный платёж
          </div>
          {snapshot.nextMandatoryPayment ? (
            <div className="mt-1">
              <div className="slab text-lg uppercase">{snapshot.nextMandatoryPayment.title}</div>
              <div className="text-sm text-[var(--muted-ink)]">
                {formatShortDate(snapshot.nextMandatoryPayment.dueDate)} ·{" "}
                {formatMoney(snapshot.nextMandatoryPayment.amount)} ₽ · учтён в лимите{" "}
                <InfoHint text="Сумма уже вычтена из свободного остатка до зарплаты. Оплату вы отмечаете отдельно на экране Цикл." />
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm text-[var(--muted-ink)]">До зарплаты платежей нет.</div>
          )}
        </div>
        {snapshot.nextMandatoryPayment ? (
          <MoneyNumber value={snapshot.nextMandatoryPayment.amount} size="md" />
        ) : null}
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="default" size="lg" onClick={() => onAction("expense")}>
          <Minus className="mr-2 h-5 w-5" />
          Записать расход
        </Button>
        <Button variant="blue" size="lg" onClick={() => onAction("transfer")}>
          <Plus className="mr-2 h-5 w-5" />В накопления
        </Button>
      </div>
    </div>
  );
}

function FormulaRow({
  label,
  value,
  negative = false,
  positive = false,
  strong = false
}: {
  label: string;
  value: number;
  negative?: boolean;
  positive?: boolean;
  strong?: boolean;
}) {
  const sign = negative ? "- " : positive ? "+ " : "";
  const displayValue = negative || positive ? Math.abs(value) : value;

  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--muted-ink)]">{label}</span>
      <span className={strong ? "slab uppercase" : ""}>
        {sign}
        {formatMoney(displayValue)} ₽
      </span>
    </div>
  );
}
