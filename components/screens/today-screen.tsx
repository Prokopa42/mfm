"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { Banner, CTARow, Glyph, HeroNumber, InlineNumber } from "@/components/mfm-ui";
import { Button } from "@/components/ui/button";
import { stateLabel, stateText } from "@/lib/calculations";
import {
  addDays,
  daysBetween,
  formatShortDate,
  isAfterOrSame,
  isBeforeOrSame,
  parseISODate
} from "@/lib/dates";
import type {
  CalculationSnapshot,
  FinanceState,
  InterfaceState,
  MandatoryPayment
} from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface TodayScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onConfirmPaycheck: () => void;
}

const RU_DOW = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const RU_MONTH_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек"
];

type BannerKind = "warning" | "info" | "notice" | "success";

function dateBits(iso: string) {
  const d = parseISODate(iso);
  return {
    dow: RU_DOW[d.getDay()],
    day: d.getDate(),
    month: RU_MONTH_SHORT[d.getMonth()]
  };
}

function stateToBannerKind(state: InterfaceState): BannerKind | null {
  switch (state) {
    case "tight":
      return "notice";
    case "cash-risk":
    case "payment-due-tomorrow":
    case "savings-off-track":
      return "warning";
    case "payday-arrived":
      return "info";
    default:
      return null;
  }
}

function Section({
  children,
  compact = false,
  topLine = "var(--line-hair) solid var(--hair)",
  bottomLine = "none"
}: {
  children: React.ReactNode;
  compact?: boolean;
  topLine?: string;
  bottomLine?: string;
}) {
  return (
    <section
      style={{
        padding: compact ? "8px var(--pad-x)" : "10px var(--pad-x)",
        borderTop: topLine,
        borderBottom: bottomLine
      }}
    >
      {children}
    </section>
  );
}

function Header({
  date,
  daysToPaycheck
}: {
  date: ReturnType<typeof dateBits>;
  daysToPaycheck: number;
}) {
  return (
    <div
      style={{
        padding: "12px var(--pad-x) 10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderBottom: "0.5px solid var(--hair)"
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="slab" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
          {date.dow}
        </span>
        <span className="slab tnum" style={{ fontSize: 14 }}>
          {date.day}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
          {date.month}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="eyebrow">до зарплаты</span>
        <span className="slab tnum" style={{ fontSize: 13 }}>
          {daysToPaycheck}
        </span>
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          дн.
        </span>
      </div>
    </div>
  );
}

function Hero({
  safeToday,
  freeUntilPaycheck,
  remainingDays,
  tomorrow
}: {
  safeToday: number;
  freeUntilPaycheck: number;
  remainingDays: number;
  tomorrow: number;
}) {
  const tickValue = Math.round(safeToday / 100) * 100;
  const delta = Math.max(0, Math.round(tomorrow - safeToday));
  const freeUntilLabel =
    freeUntilPaycheck < 0
      ? `до безопасного минимума не хватает ${formatMoney(Math.abs(freeUntilPaycheck))} ₽`
      : `до зарплаты ${formatMoney(freeUntilPaycheck)} ₽`;
  return (
    <div
      style={{
        padding: "20px var(--pad-x) 14px",
        display: "grid",
        gridTemplateColumns: "3px 1fr",
        gap: 14,
        alignItems: "stretch"
      }}
    >
      <div style={{ background: "var(--yellow)" }} />
      <div>
        <div className="eyebrow">Можно потратить сегодня</div>
        <div style={{ marginTop: 9 }}>
          <HeroNumber value={formatMoney(safeToday)} />
        </div>
        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 1, background: "var(--ink)" }} />
          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
            ≈ {formatMoney(tickValue)} ₽/день
          </span>
        </div>
        <div
          className="mono"
          style={{ marginTop: 8, fontSize: 9.5, color: "var(--ink-55)", lineHeight: 1.35 }}
        >
          {freeUntilLabel} · {remainingDays} дн.
        </div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span className="eyebrow eyebrow--ink">если не трачу — завтра</span>
          <InlineNumber value={formatMoney(tomorrow)} size={15} />
          {delta > 0 && (
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-35)" }}>
              +{formatMoney(delta)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FormulaDisclosure({
  state,
  snapshot,
  safeToday
}: {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  safeToday: number;
}) {
  const [open, setOpen] = useState(false);
  const hasSafeMinimumDeficit = snapshot.availableUntilNextPaycheck < 0;
  return (
    <Section compact>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="tap-highlight"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit"
        }}
      >
        <Glyph shape="triangle" fill="var(--ink-55)" size={6} />
        <span className="eyebrow">Как считается</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
          {open ? "свернуть" : "формула"}
        </span>
      </button>
      {open && (
        <div style={{ paddingTop: 8 }}>
          <FormulaRow sign="+" label="Оперативный остаток" value={state.operationalBalance} />
          {snapshot.incomeBeforeNextPaycheck > 0 && (
            <FormulaRow sign="+" label="Ожидаемые доходы" value={snapshot.incomeBeforeNextPaycheck} />
          )}
          <FormulaRow
            sign="−"
            label="Обязательные платежи"
            value={snapshot.mandatoryPaymentsBeforeNextPaycheck}
          />
          {snapshot.paydayMandatoryPaymentsTotal > 0 && (
            <FormulaRow
              sign="•"
              label="В день зарплаты · не вычтено"
              value={snapshot.paydayMandatoryPaymentsTotal}
            />
          )}
          <FormulaRow sign="−" label="Подушка" value={state.reserve.amount} />
          {snapshot.plannedSavingsTransfersBeforeNextPaycheck > 0 && (
            <FormulaRow
              sign="−"
              label="Плановые переводы"
              value={snapshot.plannedSavingsTransfersBeforeNextPaycheck}
            />
          )}
          <FormulaRow
            sign="="
            label={hasSafeMinimumDeficit ? "До безопасного минимума не хватает" : "Свободно до зарплаты"}
            value={hasSafeMinimumDeficit ? Math.abs(snapshot.availableUntilNextPaycheck) : snapshot.availableUntilNextPaycheck}
            strong
          />
          <FormulaRow sign="÷" label="Осталось дней" value={snapshot.remainingDays} numberOnly />
          <FormulaRow sign="=" label="Можно потратить сегодня" value={safeToday} strong />
        </div>
      )}
    </Section>
  );
}

function FormulaRow({
  sign,
  label,
  value,
  strong = false,
  numberOnly = false
}: {
  sign: string;
  label: string;
  value: number;
  strong?: boolean;
  numberOnly?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: strong ? "6px 0 2px" : "3px 0",
        borderTop: strong ? "0.5px solid var(--ink-80)" : "none"
      }}
    >
      <span className="mono" style={{ width: 12, fontSize: 10, color: "var(--ink-55)" }}>
        {sign}
      </span>
      <span
        className={strong ? "slab" : "mono"}
        style={{
          flex: 1,
          fontSize: strong ? 10 : 10,
          color: strong ? "var(--ink)" : "var(--ink-80)",
          textTransform: strong ? "uppercase" : "none",
          letterSpacing: strong ? "0.04em" : 0
        }}
      >
        {label}
      </span>
      <span className={strong ? "slab tnum" : "mono tnum"} style={{ fontSize: strong ? 11 : 10 }}>
        {formatMoney(value)}
        {!numberOnly && (
          <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
            {" "}
            ₽
          </span>
        )}
      </span>
    </div>
  );
}

function BalanceStrip({
  spent,
  free,
  cushion
}: {
  spent: number;
  free: number;
  cushion: number;
}) {
  const total = Math.max(1, spent + free + cushion);
  const spentPct = (spent / total) * 100;
  const freePct = (free / total) * 100;
  const cushionPct = (cushion / total) * 100;

  return (
    <Section>
      <div style={{ display: "flex", height: 5, border: "0.5px solid var(--ink)" }}>
        <div style={{ width: `${spentPct}%`, background: "var(--ink)" }} />
        <div
          style={{
            width: `${freePct}%`,
            borderLeft: "0.5px solid var(--ink)",
            borderRight: "0.5px solid var(--ink)"
          }}
        />
        <div style={{ width: `${cushionPct}%`, background: "var(--yellow-bg)" }} />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          paddingTop: 7
        }}
      >
        <BalanceCell label="потрачено" value={spent} align="start" />
        <BalanceCell label="свободно" value={free} align="center" />
        <BalanceCell label="подушка" value={cushion} align="end" color="var(--ink)" />
      </div>
    </Section>
  );
}

function BalanceCell({
  label,
  value,
  align,
  color = "var(--ink)"
}: {
  label: string;
  value: number;
  align: "start" | "center" | "end";
  color?: string;
}) {
  const alignItems =
    align === "start" ? "flex-start" : align === "center" ? "center" : "flex-end";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems }}>
      <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
        {label}
      </span>
      <span className="slab tnum" style={{ fontSize: 12, color }}>
        {formatMoney(value)}
      </span>
    </div>
  );
}

function PaceLine({
  pace,
  forecast,
  current,
  date,
  ok,
  delta
}: {
  pace: number;
  forecast: number;
  current: number;
  date: string;
  ok: boolean;
  delta?: number;
}) {
  const color = ok ? "var(--blue)" : "var(--red)";
  return (
    <Section
      topLine="var(--line-heavy) solid var(--hair)"
      bottomLine="var(--line-heavy) solid var(--hair)"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2px auto auto minmax(120px, 1fr) auto",
          alignItems: "baseline",
          gap: 8,
          minWidth: 0
        }}
      >
        <div style={{ width: 2, height: 15, background: color, alignSelf: "center" }} />
        <span className="eyebrow">темп</span>
        <span className="slab tnum" style={{ fontSize: 13, color: "var(--ink)" }}>
          {pace >= 0 ? "+" : "−"}
          {formatMoney(Math.abs(pace))}
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            {" "}
            ₽/мес
          </span>
        </span>
        <ForecastLine current={current} forecast={forecast} color={color} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            к {date}
          </span>
          <span className="slab tnum" style={{ color, fontSize: 13 }}>
            {formatMoney(forecast)} ₽
          </span>
        </div>
      </div>
      <div style={{ paddingTop: ok || delta === undefined || delta === 0 ? 0 : 6 }}>
        {!ok && delta !== undefined && delta !== 0 && (
          <div
            className="mono tnum"
            style={{ textAlign: "right", fontSize: 9.5, color: "var(--red)" }}
          >
            {delta < 0 ? "−" : "+"}
            {formatMoney(Math.abs(delta))} к цели
          </div>
        )}
      </div>
    </Section>
  );
}

function ForecastLine({
  current,
  forecast,
  color
}: {
  current: number;
  forecast: number;
  color: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(120);
  const width = Math.max(120, containerWidth);
  const height = 18;
  const pad = 2;
  const steps = 5;
  const values = Array.from({ length: steps + 1 }, (_, index) =>
    current + ((forecast - current) * index) / steps
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = pad + ((width - pad * 2) * index) / steps;
      const y =
        max === min
          ? height / 2
          : height - pad - ((height - pad * 2) * (value - min)) / range;
      return `${x},${y}`;
    })
    .join(" ");

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = Math.round(element.clientWidth);
      if (nextWidth > 0) setContainerWidth(nextWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", minWidth: 0, alignSelf: "center" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label="Прогноз темпа накоплений"
        role="img"
        style={{ display: "block" }}
      >
        <title>Прогноз: от текущих накоплений к рассчитанной сумме</title>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--hair)" strokeWidth="0.7" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" />
      </svg>
    </div>
  );
}

function CycleMini({
  startDate,
  endDate,
  today,
  payments
}: {
  startDate: string;
  endDate: string;
  today: string;
  payments: { date: string; nearest: boolean; missed: boolean }[];
}) {
  const cycleDays = Math.max(1, daysBetween(startDate, endDate) + 1);
  const todayIdx = Math.max(0, Math.min(cycleDays - 1, daysBetween(startDate, today)));
  const pct = (idx: number) => `${((Math.max(0, Math.min(cycleDays - 1, idx)) + 0.5) / cycleDays) * 100}%`;
  const tickStep = Math.max(1, Math.ceil((cycleDays - 1) / 5));
  const tickIndexes = Array.from({ length: cycleDays }, (_, index) => index).filter(
    (index) => index === 0 || index === cycleDays - 1 || index % tickStep === 0
  );
  const visiblePayments = payments
    .filter((payment) => isAfterOrSame(payment.date, startDate))
    .filter((payment) => isBeforeOrSame(payment.date, endDate));

  return (
    <Section topLine="none" bottomLine="var(--line-heavy) solid var(--hair)">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
        <span className="eyebrow eyebrow--ink">Цикл</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          {formatShortDate(startDate)} → {formatShortDate(endDate)}
        </span>
      </div>
      <div style={{ position: "relative", height: 62 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 27,
            height: 1,
            background: "var(--ink-55)"
          }}
        />
        {tickIndexes.map((index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: pct(index),
              top: 22,
              width: 1,
              height: index === 0 || index === cycleDays - 1 ? 11 : 7,
              background: "var(--ink-35)",
              transform: "translateX(-0.5px)"
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: pct(todayIdx),
            top: 4,
            transform: "translateX(-50%)",
            textAlign: "center"
          }}
        >
          <div className="slab" style={{ fontSize: 8, letterSpacing: "0.12em" }}>
            СЕГОДНЯ
          </div>
          <div style={{ width: 2, height: 28, margin: "2px auto 0", background: "var(--ink)" }} />
          <div
            style={{
              width: 5,
              height: 5,
              margin: "-18px auto 0",
              borderRadius: 999,
              background: "var(--ink)"
            }}
          />
        </div>
        {visiblePayments.map((payment, index) => {
          const paymentIdx = daysBetween(startDate, payment.date);
          return (
            <div
              key={`${payment.date}-${index}`}
              title={formatShortDate(payment.date)}
              style={{
                position: "absolute",
                left: pct(paymentIdx),
                top: payment.nearest ? 28 : 25,
                width: payment.nearest ? 5 : 3,
                height: payment.nearest ? 18 : 10,
                transform: "translateX(-50%)",
                background: payment.missed ? "var(--red)" : payment.nearest ? "var(--red)" : "var(--ink-55)"
              }}
            />
          );
        })}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 16 }}>
          {tickIndexes.map((index) => {
            const tickDate = addDays(startDate, index);
            const tick = parseISODate(tickDate);
            const isEdge = index === 0 || index === cycleDays - 1;
            return (
              <span
                key={`label-${index}`}
                className="mono tnum"
                style={{
                  position: "absolute",
                  left: pct(index),
                  transform: isEdge && index === 0
                    ? "translateX(-15%)"
                    : isEdge && index === cycleDays - 1
                      ? "translateX(-85%)"
                      : "translateX(-50%)",
                  fontSize: 9,
                  color: "var(--ink-55)"
                }}
              >
                {tick.getDate()}
              </span>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function PaymentLine({ payment, isPaydayPayment = false }: { payment?: MandatoryPayment; isPaydayPayment?: boolean }) {
  if (!payment) {
    return (
      <Section compact topLine="none">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ width: 2, height: 17, background: "var(--ink-35)" }} />
          <span className="eyebrow">ближайший</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
            до зарплаты нет обязательных платежей
          </span>
        </div>
      </Section>
    );
  }

  return (
    <Section compact topLine="none">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2px auto 1fr auto",
          alignItems: "baseline",
          gap: 8
        }}
      >
        <div style={{ width: 2, height: 18, background: "var(--red)", alignSelf: "center" }} />
        <span className="eyebrow">ближайший</span>
        <div style={{ minWidth: 0 }}>
          <span className="slab" style={{ fontSize: 12 }}>
            {payment.title}
          </span>
          <span className="mono" style={{ marginLeft: 6, fontSize: 9.5, color: "var(--ink-55)" }}>
            · {formatShortDate(payment.dueDate)} · {payment.status === "paid" ? "оплачен" : isPaydayPayment ? "в день зарплаты" : "учтён"}
          </span>
        </div>
        <InlineNumber value={formatMoney(payment.amount)} size={13} color="var(--ink)" />
      </div>
    </Section>
  );
}

function FooterStrips({
  state,
  savingsAccent
}: {
  state: FinanceState;
  savingsAccent: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        borderTop: "0.5px solid var(--ink)",
        borderBottom: "0.5px solid var(--ink)"
      }}
    >
      <FooterStrip label="оперативный" value={state.operationalBalance} />
      <FooterStrip label="подушка" value={state.reserve.amount} />
      <FooterStrip label="накопления" value={state.savings.balance} color={savingsAccent} accent={savingsAccent} />
    </div>
  );
}

function FooterStrip({
  label,
  value,
  color = "var(--ink)",
  accent
}: {
  label: string;
  value: number;
  color?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: "13px var(--pad-x) 14px",
        borderRight: "0.5px solid var(--ink)",
        borderTop: accent ? `2px solid ${accent}` : "none"
      }}
    >
      <div className="eyebrow" style={{ color: "var(--ink-55)" }}>
        {label}
      </div>
      <div className="slab tnum" style={{ marginTop: 8, fontSize: 16, color }}>
        {formatMoney(value)}
      </div>
    </div>
  );
}

function ActionRow({ onAction }: { onAction: (action: ActionDialogKind) => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onAction("income")}
        className="tap-highlight"
        style={{
          width: "100%",
          padding: "7px var(--pad-x)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 7,
          background: "var(--paper)",
          color: "var(--ink-55)",
          border: "none",
          borderTop: "0.5px solid var(--hair)",
          cursor: "pointer",
          fontFamily: "inherit"
        }}
      >
        <span className="mono" style={{ fontSize: 9.5 }}>
          + доход / премия
        </span>
        <Glyph shape="circle" fill="none" stroke="var(--ink-55)" size={7} sw={1} />
      </button>
      <CTARow
        primary={{ label: "Записать расход", shape: "square", onClick: () => onAction("expense") }}
        secondary={{
          label: "В накопления",
          shape: "circle",
          tone: "blue",
          onClick: () => onAction("transfer")
        }}
      />
    </div>
  );
}

export function TodayScreen({
  state,
  snapshot,
  onAction,
  onConfirmPaycheck
}: TodayScreenProps) {
  const date = useMemo(() => dateBits(snapshot.today), [snapshot.today]);
  const bannerState = snapshot.uiStates.find((s) => s !== "normal");
  const bannerKind = bannerState ? stateToBannerKind(bannerState) : null;

  const safeToday = Math.max(0, Math.round(snapshot.safeToSpendToday));
  const tomorrow = Math.max(0, Math.round(snapshot.ifZeroTodayTomorrow));

  const spent = state.variableExpenses
    .filter((expense) => isAfterOrSame(expense.date, state.payCycle.startDate))
    .filter((expense) => isBeforeOrSame(expense.date, snapshot.today))
    .reduce((sum, expense) => sum + expense.amount, 0);

  const paceOk = !snapshot.uiStates.includes("savings-off-track");
  const savingsAccent = paceOk ? "var(--blue)" : "var(--red)";
  const cycleStartDate = snapshot.previousPaycheckDate;
  const cycleEndDate = snapshot.nextPaycheckDate;
  const payments = state.mandatoryPayments
    .filter((payment) => payment.status === "scheduled" || payment.status === "missed")
    .map((payment) => ({
      date: payment.dueDate,
      nearest: payment.id === snapshot.nextMandatoryPayment?.id,
      missed: payment.status === "missed"
    }));
  const paceDate = snapshot.primaryGoal?.goal.deadline
    ? formatShortDate(snapshot.primaryGoal.goal.deadline)
    : "12 мес.";
  const paceDelta =
    !paceOk && snapshot.primaryGoal
      ? Math.round(snapshot.primaryGoal.forecastAtDeadline - snapshot.primaryGoal.goal.target)
      : undefined;

  return (
    <div
      style={{
        minHeight: "calc(100dvh - env(safe-area-inset-bottom) - var(--tabbar-base))",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Header date={date} daysToPaycheck={snapshot.rawRemainingDays} />

      {bannerState && bannerKind && (
        <Banner
          kind={bannerKind}
          title={stateLabel(bannerState)}
          note={stateText(bannerState, snapshot.nextMandatoryPayment)}
        />
      )}

      {snapshot.uiStates.includes("payday-arrived") && (
        <div style={{ padding: "8px var(--pad-x) 0" }}>
          <Button variant="primary" onClick={onConfirmPaycheck} style={{ width: "100%" }}>
            <Glyph shape="square" fill="var(--paper)" size={8} />
            Подтвердить зарплату
          </Button>
        </div>
      )}

      <Hero
        safeToday={safeToday}
        freeUntilPaycheck={Math.round(snapshot.availableUntilNextPaycheck)}
        remainingDays={snapshot.remainingDays}
        tomorrow={tomorrow}
      />
      <FormulaDisclosure state={state} snapshot={snapshot} safeToday={safeToday} />
      <BalanceStrip
        spent={spent}
        free={Math.max(0, Math.round(snapshot.availableUntilNextPaycheck))}
        cushion={state.reserve.amount}
      />
      <PaceLine
        pace={Math.round(snapshot.monthlySavingPace)}
        forecast={Math.round(snapshot.savingsForecastNominal)}
        current={Math.round(state.savings.balance)}
        date={paceDate}
        ok={paceOk}
        delta={paceDelta}
      />
      <CycleMini
        startDate={cycleStartDate}
        endDate={cycleEndDate}
        today={snapshot.today}
        payments={payments}
      />
      <PaymentLine
        payment={snapshot.nextMandatoryPayment}
        isPaydayPayment={snapshot.nextMandatoryPayment?.dueDate === snapshot.nextPaycheckDate}
      />
      <div style={{ flex: 1, minHeight: 10 }} />
      <FooterStrips state={state} savingsAccent={savingsAccent} />
      <ActionRow onAction={onAction} />
    </div>
  );
}
