"use client";

import { Check } from "lucide-react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { EmptyNote, InfoHint, MoneyNumber, Panel, SectionTitle } from "@/components/mfm-ui";
import { Button } from "@/components/ui/button";
import { addDays, compareDates, formatShortDate, getPaycheckCandidates, isBeforeOrSame, isSameDate } from "@/lib/dates";
import type { CalculationSnapshot, FinanceState, ISODate, MandatoryPayment } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";

interface CycleScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onMarkPaymentPaid: (payment: MandatoryPayment) => void;
}

export function CycleScreen({ state, snapshot, onAction, onMarkPaymentPaid }: CycleScreenProps) {
  const daysCount = Math.max(1, snapshot.rawRemainingDays);
  const cycleDays = Array.from({ length: daysCount + 1 }, (_, index) => {
    const date = addDays(snapshot.today, index);
    const divisor = Math.max(1, snapshot.remainingDays - index);
    const safe = Math.max(0, snapshot.availableUntilNextPaycheck) / divisor;
    const payments = state.mandatoryPayments.filter((payment) => isSameDate(payment.dueDate, date));
    return { date, safe, payments, today: index === 0 };
  });
  const paycheckDates = getPaycheckCandidates(snapshot.today, state.settings).filter(
    (date) => compareDates(date, snapshot.today) >= 0 && isBeforeOrSame(date, snapshot.nextPaycheckDate)
  );

  return (
    <div className="grid gap-4">
      <SectionTitle title="Цикл" eyebrow={`${formatShortDate(snapshot.today)} → ${formatShortDate(snapshot.nextPaycheckDate)}`} />

      <Panel>
        <div className="grid grid-cols-3">
          <div className="border-r-2 border-[var(--ink)] p-3">
            <div className="flex items-center gap-1 text-xs font-black uppercase text-[var(--muted-ink)]">
              <span>Доступно до зарплаты</span>
              <InfoHint text="Свободный остаток до следующей зарплаты после обязательных платежей, подушки и плановых переводов." />
            </div>
            <MoneyNumber value={snapshot.availableUntilNextPaycheck} size="sm" tone={snapshot.availableUntilNextPaycheck <= 0 ? "red" : "ink"} />
          </div>
          <div className="border-r-2 border-[var(--ink)] p-3">
            <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Обязательные платежи</div>
            <MoneyNumber value={snapshot.mandatoryPaymentsBeforeNextPaycheck} size="sm" />
          </div>
          <div className="p-3">
            <div className="flex items-center gap-1 text-xs font-black uppercase text-[var(--muted-ink)]">
              <span>Подушка</span>
              <InfoHint text="Защитный запас внутри текущей системы. Он вычитается из свободного остатка." />
            </div>
            <MoneyNumber value={state.reserve.amount} size="sm" />
          </div>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Полоса цикла</div>
            <div className="slab text-lg uppercase leading-none">
              {formatShortDate(snapshot.today)} → {formatShortDate(snapshot.nextPaycheckDate)}
            </div>
          </div>
          <CycleLegend />
        </div>
        <CycleTimeline days={cycleDays} paycheckDates={paycheckDates} snapshot={snapshot} />
      </Panel>

      <div className="grid gap-2">
        {cycleDays.map((day) => {
          const activePayments = day.payments.filter((payment) => payment.status !== "paid");
          const tight = day.safe < 500 || activePayments.length > 0;
          return (
            <Panel
              key={day.date}
              className={cn(
                day.today && "border-l-[6px] border-l-[var(--ink)]",
                tight && !day.today && "border-l-[6px] border-l-[var(--yellow-line)]"
              )}
            >
              <div className="grid gap-3 p-3 sm:grid-cols-[88px_1fr_auto] sm:items-center">
                <div>
                  <div className="text-xs text-[var(--muted-ink)]">{day.today ? "сегодня" : "дата"}</div>
                  <div className="slab text-base uppercase">{formatShortDate(day.date)}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Дневной допустимый лимит</div>
                  {day.payments.length > 0 ? (
                    <div className="mt-2 grid gap-1">
                      {day.payments.map((payment) => (
                        <PaymentLine
                          key={payment.id}
                          payment={payment}
                          accounted={isPaymentAccounted(payment, snapshot)}
                          overdue={isPaymentOverdue(payment, snapshot.today)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-[var(--muted-ink)]">Без обязательных платежей.</div>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs font-black uppercase text-[var(--muted-ink)]">лимит дня</div>
                  <MoneyNumber value={day.safe} size="sm" tone={day.safe < 500 ? "red" : "ink"} />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[var(--muted-ink)]">Обязательные платежи</div>
            <div className="text-sm text-[var(--muted-ink)]">Шаблоны MVP, без банковских интеграций.</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onAction("expense")}>
            Расход
          </Button>
        </div>
        <div className="grid gap-2">
          {snapshot.upcomingMandatoryPayments.length === 0 ? (
            <EmptyNote>До зарплаты нет неоплаченных обязательных платежей.</EmptyNote>
          ) : (
            snapshot.upcomingMandatoryPayments.map((payment) => (
              <div
                key={payment.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-2 border-[var(--ink)] p-3"
              >
                <div>
                  <div className="slab text-base uppercase">{payment.title}</div>
                  <div className="text-sm text-[var(--muted-ink)]">
                    {formatShortDate(payment.dueDate)} · {formatMoney(payment.amount)} ₽ ·{" "}
                    {isPaymentAccounted(payment, snapshot) ? "учтён в лимите" : "не учтён в лимите"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted-ink)]">
                    Учтён в лимите значит уже вычтен из свободного остатка. Оплачен — факт платежа, который вы отмечаете вручную.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MoneyNumber value={payment.amount} size="sm" />
                  <Button variant="secondary" size="sm" onClick={() => onMarkPaymentPaid(payment)}>
                    <Check className="h-4 w-4" />
                    Отметить как оплаченный
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 border-t-2 border-dashed border-[var(--thin)] pt-3 text-xs text-[var(--muted-ink)]">
          Если платёж уже был учтён в лимите, после отметки оплаты «Доступно до зарплаты» может не измениться: вычет из плана просто становится фактом оплаты.
        </div>
      </Panel>
    </div>
  );
}

function CycleTimeline({
  days,
  paycheckDates,
  snapshot
}: {
  days: Array<{ date: ISODate; safe: number; payments: MandatoryPayment[]; today: boolean }>;
  paycheckDates: ISODate[];
  snapshot: CalculationSnapshot;
}) {
  const lastIndex = Math.max(1, days.length - 1);

  return (
    <div className="border-2 border-[var(--ink)] bg-[var(--paper)] p-3">
      <div className="relative h-24">
        <div className="absolute left-0 right-0 top-10 border-t-2 border-[var(--ink)]" />
        {days.map((day, index) => {
          const left = `${(index / lastIndex) * 100}%`;
          const hasPaycheck = paycheckDates.some((date) => isSameDate(date, day.date));
          const hasPayment = day.payments.length > 0;
          const hasRisk =
            day.safe < 500 || day.payments.some((payment) => isPaymentOverdue(payment, snapshot.today));
          const showLabel = day.today || index === lastIndex || hasPaycheck || hasPayment || hasRisk;

          return (
            <div
              key={day.date}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left }}
            >
              <div className="h-10 border-l-2 border-[var(--ink)]" />
              <div className="flex h-5 items-center justify-center gap-1">
                {hasPayment ? <TimelineMarker kind="payment" label={day.payments.map((payment) => payment.title).join(", ")} /> : null}
                {hasPaycheck ? <TimelineMarker kind="paycheck" label="зарплата" /> : null}
                {hasRisk ? <TimelineMarker kind="risk" label="риск" /> : null}
              </div>
              {showLabel ? (
                <div className="mt-1 whitespace-nowrap text-[10px] font-black uppercase text-[var(--muted-ink)]">
                  {day.today ? "сегодня" : formatShortDate(day.date).replace(".", "")}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineMarker({ kind, label }: { kind: "payment" | "paycheck" | "risk"; label: string }) {
  if (kind === "payment") {
    return (
      <svg width="15" height="15" viewBox="0 0 15 15" aria-label={label}>
        <rect x="3" y="3" width="9" height="9" fill="var(--paper)" stroke="var(--yellow-line)" strokeWidth="2" />
      </svg>
    );
  }

  if (kind === "paycheck") {
    return (
      <svg width="15" height="15" viewBox="0 0 15 15" aria-label={label}>
        <circle cx="7.5" cy="7.5" r="5" fill="var(--paper)" stroke="var(--blue-line)" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg width="16" height="15" viewBox="0 0 16 15" aria-label={label}>
      <path d="M8 2.5 14 12.5H2Z" fill="var(--paper)" stroke="var(--red-line)" strokeWidth="2" strokeLinejoin="miter" />
    </svg>
  );
}

function CycleLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase text-[var(--muted-ink)]">
      <span className="inline-flex items-center gap-1">
        <TimelineMarker kind="payment" label="обязательный платёж" />
        обязательный
      </span>
      <span className="inline-flex items-center gap-1">
        <TimelineMarker kind="paycheck" label="зарплата" />
        зарплата
      </span>
      <span className="inline-flex items-center gap-1">
        <TimelineMarker kind="risk" label="риск" />
        риск
      </span>
    </div>
  );
}

function PaymentLine({
  payment,
  accounted,
  overdue
}: {
  payment: MandatoryPayment;
  accounted: boolean;
  overdue: boolean;
}) {
  const paid = payment.status === "paid";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={cn("h-3 w-3 shrink-0 border-2", overdue ? "border-[var(--red-line)]" : "border-[var(--yellow-line)]")} />
      <span className="slab uppercase">{payment.title}</span>
      <span className="text-[var(--muted-ink)]">{formatMoney(payment.amount)} ₽</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 border-2 px-2 py-0.5 text-[10px] font-black uppercase",
          accounted
            ? "border-[var(--blue-line)] text-[var(--blue)]"
            : "border-[var(--red-line)] text-[var(--red)]"
        )}
      >
        {paid ? "учтён фактом" : accounted ? "учтён в лимите" : "не учтён в лимите"}
        <InfoHint text="Учтён в лимите: сумма уже вычтена из свободного остатка до зарплаты." />
      </span>
      {paid ? (
        <span className="border-2 border-[var(--ink)] px-2 py-0.5 text-[10px] font-black uppercase">
          оплачен
        </span>
      ) : null}
    </div>
  );
}

function isPaymentAccounted(payment: MandatoryPayment, snapshot: CalculationSnapshot) {
  return payment.status === "paid" || isBeforeOrSame(payment.dueDate, snapshot.nextPaycheckDate);
}

function isPaymentOverdue(payment: MandatoryPayment, today: ISODate) {
  if (payment.status === "paid") return false;
  return payment.status === "missed" || compareDates(payment.dueDate, today) < 0;
}
