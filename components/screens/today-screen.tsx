"use client";

import { useMemo, useState } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import {
  Banner,
  CTARow,
  Glyph,
  HeroNumber,
  InlineNumber
} from "@/components/mfm-ui";
import { Button } from "@/components/ui/button";
import { stateLabel, stateText } from "@/lib/calculations";
import {
  daysBetween,
  formatShortDate,
  isAfterOrSame,
  isBeforeOrSame,
  parseISODate
} from "@/lib/dates";
import type {
  CalculationSnapshot,
  FinanceState,
  InterfaceState
} from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface TodayScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onConfirmPaycheck: () => void;
}

/* ─────────────────────────────────────────────────────────────
   Hi-fi 01/05 — Today screen.
   Direct port of design/final/МФМ/hifi-dashboard.jsx onto live
   snapshot/state. No business-logic changes — only mapping
   into the hi-fi visual language. Composites that are unique to
   this screen (BalanceStrip, PaceRow, MiniCycleAxis,
   NearestPaymentRow, FooterStrips) live inline by design.
   ───────────────────────────────────────────────────────────── */

// ─── ru locale helpers ─────────────────────────────────────
const RU_DOW = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const RU_MONTH_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек"
];

function dateBits(iso: string) {
  const d = parseISODate(iso);
  return {
    dow: RU_DOW[d.getDay()],
    day: d.getDate(),
    month: RU_MONTH_SHORT[d.getMonth()]
  };
}

// ─── State → Banner mapping ────────────────────────────────
type BannerKind = "warning" | "info" | "notice" | "success";

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

// ─── BalanceStrip — потрачено / свободно / подушка ────────
interface BalanceStripData {
  spent: number;
  free: number;
  cushion: number;
}

function BalanceStrip({ d }: { d: BalanceStripData }) {
  const total = Math.max(1, d.spent + d.free + d.cushion);
  const pctS = (d.spent / total) * 100;
  const pctF = (d.free / total) * 100;
  const pctC = (d.cushion / total) * 100;
  return (
    <div style={{ padding: "4px var(--pad-x) 12px" }}>
      <div style={{ display: "flex", height: 5, border: "0.5px solid var(--ink)" }}>
        <div style={{ width: `${pctS}%`, background: "var(--ink)" }} />
        <div
          style={{
            width: `${pctF}%`,
            borderLeft: "0.5px solid var(--ink)",
            borderRight: "0.5px solid var(--ink)"
          }}
        />
        <div style={{ width: `${pctC}%`, background: "var(--yellow-bg)" }} />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${pctS}% ${pctF}% ${pctC}%`,
          marginTop: 5
        }}
      >
        <BalanceCell label="потрачено" value={d.spent} align="start" />
        <BalanceCell label="свободно" value={d.free} align="center" />
        <BalanceCell label="подушка" value={d.cushion} align="end" />
      </div>
    </div>
  );
}

function BalanceCell({
  label,
  value,
  align
}: {
  label: string;
  value: number;
  align: "start" | "center" | "end";
}) {
  const alignItems =
    align === "start" ? "flex-start" : align === "center" ? "center" : "flex-end";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems }}>
      <span
        className="mono"
        style={{ fontSize: 8.5, color: "var(--ink-55)", letterSpacing: "0.02em" }}
      >
        {label}
      </span>
      <span className="slab tnum" style={{ fontSize: 10.5 }}>
        {formatMoney(value)}
      </span>
    </div>
  );
}

// ─── PaceRow ─────────────────────────────────────────────
interface PaceRowData {
  pace: number;
  paceTarget: number;
  paceGoalDate: string;
  paceOk: boolean;
  paceDelta?: number;
}

function PaceRow({ d }: { d: PaceRowData }) {
  // Status signal lives in the 2px accent left + the value colour. No chart.
  // A real-history sparkline requires a dated balance ledger we don't keep
  // in MVP; honest absence beats invented trend in a finance UI.
  const color = d.paceOk ? "var(--blue)" : "var(--red)";
  return (
    <div style={{ padding: "0 var(--pad-x)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2px auto auto 1fr auto",
          alignItems: "center",
          gap: 8,
          padding: "9px 0",
          borderTop: "0.5px solid var(--hair)",
          borderBottom: "0.5px solid var(--hair)"
        }}
      >
        <div style={{ width: 2, height: 14, background: color }} />
        <span className="eyebrow">Темп</span>
        <span className="slab tnum" style={{ fontSize: 11.5 }}>
          {d.pace >= 0 ? "+" : "−"}
          {formatMoney(Math.abs(d.pace))}
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            {" "}
            ₽/мес
          </span>
        </span>
        <div />
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            к {d.paceGoalDate}
          </span>
          <span className="slab tnum" style={{ fontSize: 12.5, color }}>
            {formatMoney(d.paceTarget)}
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
              {" "}
              ₽
            </span>
          </span>
        </div>
      </div>
      {!d.paceOk && d.paceDelta !== undefined && d.paceDelta !== 0 && (
        <div style={{ padding: "4px 0 8px", display: "flex", justifyContent: "flex-end" }}>
          <span
            className="mono"
            style={{ fontSize: 9, color: "var(--red)", letterSpacing: "0.02em" }}
          >
            {d.paceDelta < 0 ? "−" : "+"}
            {formatMoney(Math.abs(d.paceDelta))} к цели
          </span>
        </div>
      )}
    </div>
  );
}

// ─── MiniCycleAxis ───────────────────────────────────────
interface AxisPayment {
  idx: number;
  label: string;
  amount: number;
  nearest: boolean;
}

interface MiniCycleAxisData {
  cycleStartLabel: string;
  cycleEndLabel: string;
  cycleLen: number;
  todayIdx: number;
  payments: AxisPayment[];
}

function MiniCycleAxis({ d }: { d: MiniCycleAxisData }) {
  const W = 304;
  const H = 58;
  const N = Math.max(1, d.cycleLen);
  const col = W / N;
  const todayIdxClamped = Math.max(0, Math.min(N - 1, d.todayIdx));
  const todayX = (todayIdxClamped + 0.5) * col;
  const baselineY = 28;

  return (
    <div style={{ padding: "12px var(--pad-x) 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span className="eyebrow eyebrow--ink">Цикл</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          {d.cycleStartLabel} → {d.cycleEndLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
        <text
          x={todayX}
          y="9"
          fontSize="8"
          fontFamily="var(--font-slab)"
          textAnchor="middle"
          fill="var(--ink)"
          letterSpacing="1"
        >
          СЕГОДНЯ
        </text>
        <line x1="0" y1={baselineY} x2={W} y2={baselineY} stroke="var(--ink)" strokeWidth="0.6" />
        {Array.from({ length: N }).map((_, i) => {
          const x = (i + 0.5) * col;
          return (
            <line
              key={`t${i}`}
              x1={x}
              y1={baselineY - 4}
              x2={x}
              y2={baselineY}
              stroke="var(--ink-55)"
              strokeWidth="0.5"
            />
          );
        })}
        <line
          x1={todayX}
          y1="13"
          x2={todayX}
          y2={baselineY + 16}
          stroke="var(--ink)"
          strokeWidth="1.5"
        />
        <circle cx={todayX} cy={baselineY} r="2" fill="var(--ink)" />
        {d.payments.map((p, k) => {
          const x = (p.idx + 0.5) * col;
          const c = p.nearest ? "var(--red)" : "var(--ink-80)";
          return (
            <g key={`p${k}`}>
              <line
                x1={x}
                y1={baselineY}
                x2={x}
                y2={baselineY + (p.nearest ? 14 : 10)}
                stroke={c}
                strokeWidth={p.nearest ? 1.2 : 0.8}
              />
              {p.nearest && <circle cx={x} cy={baselineY + 14} r="1.6" fill={c} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── NearestPaymentRow ───────────────────────────────────
interface NearestPaymentRowData {
  label: string;
  date: string;
  amount: number;
}

function NearestPaymentRow({ d }: { d: NearestPaymentRowData }) {
  return (
    <div style={{ padding: "0 var(--pad-x)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2px auto 1fr auto",
          alignItems: "center",
          gap: 8,
          padding: "9px 0",
          borderTop: "0.5px solid var(--hair)"
        }}
      >
        <div style={{ width: 2, height: 14, background: "var(--red)" }} />
        <span className="eyebrow">Ближайший</span>
        <span className="slab" style={{ fontSize: 11.5 }}>
          {d.label}
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            {" "}
            · {d.date}
          </span>
        </span>
        <span className="slab tnum" style={{ fontSize: 12.5 }}>
          {formatMoney(d.amount)}
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            {" "}
            ₽
          </span>
        </span>
      </div>
    </div>
  );
}

// ─── Explainer — "как считается" disclosure under hero ──
// Compact hi-fi expandable. Lives directly under the Hero so the formula
// is reachable next to the number it explains. Numbers are pulled from
// the live snapshot (no synthetic values).
interface ExplainerProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  safeToday: number;
}

function Explainer({ state, snapshot, safeToday }: ExplainerProps) {
  const [open, setOpen] = useState(false);
  const free = snapshot.availableUntilNextPaycheck;
  return (
    <div style={{ padding: "0 var(--pad-x)", borderTop: "0.5px solid var(--hair)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tap-highlight"
        style={{
          width: "100%",
          padding: "8px 0",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            transform: open ? "rotate(180deg)" : "rotate(90deg)",
            transition: "transform 0.1s"
          }}
        >
          <Glyph shape="triangle" fill="var(--ink-55)" size={6} />
        </div>
        <span className="eyebrow">Как считается</span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
          {open ? "свернуть" : "формула"}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "4px 0 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4
          }}
        >
          <FormulaRow sign="+" label="Оперативный остаток" value={state.operationalBalance} />
          {snapshot.incomeBeforeNextPaycheck > 0 && (
            <FormulaRow
              sign="+"
              label="Ожидаемые доходы"
              value={snapshot.incomeBeforeNextPaycheck}
            />
          )}
          <FormulaRow
            sign="−"
            label="Обязательные платежи"
            value={snapshot.mandatoryPaymentsBeforeNextPaycheck}
          />
          <FormulaRow sign="−" label="Подушка" value={state.reserve.amount} />
          {snapshot.plannedSavingsTransfersBeforeNextPaycheck > 0 && (
            <FormulaRow
              sign="−"
              label="Плановые переводы"
              value={snapshot.plannedSavingsTransfersBeforeNextPaycheck}
            />
          )}
          <div
            style={{
              height: 0.5,
              background: "var(--ink-80)",
              marginTop: 4,
              marginBottom: 4
            }}
          />
          <FormulaRow sign="=" label="Свободно до зарплаты" value={free} bold />
          <FormulaRow
            sign="÷"
            label="оставшихся дней"
            value={snapshot.remainingDays}
            numberOnly
          />
          <div
            style={{
              height: 0.5,
              background: "var(--ink-80)",
              marginTop: 4,
              marginBottom: 4
            }}
          />
          <FormulaRow sign="=" label="Можно потратить сегодня" value={safeToday} bold />
        </div>
      )}
    </div>
  );
}

interface FormulaRowProps {
  sign: string;
  label: string;
  value: number;
  bold?: boolean;
  numberOnly?: boolean;
}

function FormulaRow({ sign, label, value, bold = false, numberOnly = false }: FormulaRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "12px 1fr auto",
        alignItems: "baseline",
        gap: 8
      }}
    >
      <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
        {sign}
      </span>
      <span className="mono" style={{ fontSize: 10, color: "var(--ink-80)" }}>
        {label}
      </span>
      <span
        className={bold ? "slab tnum" : "mono tnum"}
        style={{ fontSize: bold ? 11 : 10, color: "var(--ink)" }}
      >
        {value < 0 ? "−" : ""}
        {formatMoney(Math.abs(value))}
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

// ─── FooterStrips ────────────────────────────────────────
interface FooterStripData {
  label: string;
  value: number;
  accent?: string | null;
}

function FooterStrips({ items }: { items: FooterStripData[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        borderTop: "1px solid var(--ink)"
      }}
    >
      {items.map((s, i) => (
        <div
          key={i}
          style={{
            padding: "9px 12px",
            borderLeft: i > 0 ? "0.5px solid var(--ink)" : "none",
            position: "relative"
          }}
        >
          {s.accent && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: i > 0 ? 0 : -0.5,
                width: "100%",
                height: 1.5,
                background: s.accent
              }}
            />
          )}
          <span className="eyebrow" style={{ fontSize: 8 }}>
            {s.label}
          </span>
          <div style={{ marginTop: 3 }}>
            <span
              className="slab tnum"
              style={{ fontSize: 14, color: s.accent || "var(--ink)" }}
            >
              {formatMoney(s.value)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────
export function TodayScreen({
  state,
  snapshot,
  onAction,
  onConfirmPaycheck
}: TodayScreenProps) {
  const date = useMemo(() => dateBits(snapshot.today), [snapshot.today]);

  // Banner: take first non-normal state. State signals live IN the screen
  // per hi-fi (hifi-dashboard.jsx renders <Banner> between header and hero).
  const bannerState = snapshot.uiStates.find((s) => s !== "normal");
  const bannerKind = bannerState ? stateToBannerKind(bannerState) : null;

  // Hero
  const safeToday = Math.max(0, snapshot.safeToSpendToday);
  const tomorrow = Math.max(0, snapshot.ifZeroTodayTomorrow);
  const tomorrowDelta = Math.round(tomorrow - safeToday);
  const tickValue = Math.round(safeToday / 100) * 100;

  // Balance strip — spent within the current cycle window
  const cycleStart = state.payCycle.startDate;
  const spent = state.variableExpenses
    .filter(
      (e) =>
        isAfterOrSame(e.date, cycleStart) && isBeforeOrSame(e.date, snapshot.today)
    )
    .reduce((sum, e) => sum + e.amount, 0);
  const balanceStrip: BalanceStripData = {
    spent,
    free: Math.max(0, snapshot.availableUntilNextPaycheck),
    cushion: state.reserve.amount
  };

  // Pace row
  const paceOk = !snapshot.uiStates.includes("savings-off-track");
  const paceGoalDate = snapshot.primaryGoal?.goal.deadline
    ? formatShortDate(snapshot.primaryGoal.goal.deadline)
    : "31.12";
  const paceData: PaceRowData = {
    pace: Math.round(snapshot.monthlySavingPace),
    paceTarget: Math.round(snapshot.savingsForecastNominal),
    paceGoalDate,
    paceOk,
    paceDelta:
      !paceOk && snapshot.primaryGoal
        ? Math.round(
            snapshot.primaryGoal.forecastAtDeadline - snapshot.primaryGoal.goal.target
          )
        : undefined
  };

  // Mini cycle axis
  const cycleLen = Math.max(
    1,
    daysBetween(state.payCycle.startDate, state.payCycle.endDate) + 1
  );
  const todayIdx = daysBetween(state.payCycle.startDate, snapshot.today);
  const upcoming = snapshot.upcomingMandatoryPayments.slice(0, 6);
  const axisPayments: AxisPayment[] = upcoming.map((p, i) => ({
    idx: Math.max(
      0,
      Math.min(cycleLen - 1, daysBetween(state.payCycle.startDate, p.dueDate))
    ),
    label: p.title,
    amount: p.amount,
    nearest: i === 0
  }));
  const cycleAxis: MiniCycleAxisData = {
    cycleStartLabel: formatShortDate(state.payCycle.startDate),
    cycleEndLabel: formatShortDate(snapshot.nextPaycheckDate),
    cycleLen,
    todayIdx,
    payments: axisPayments
  };

  // Nearest payment row
  const nearest: NearestPaymentRowData | null = snapshot.nextMandatoryPayment
    ? {
        label: snapshot.nextMandatoryPayment.title,
        date: formatShortDate(snapshot.nextMandatoryPayment.dueDate),
        amount: snapshot.nextMandatoryPayment.amount
      }
    : null;

  // Footer strips
  const savingsAccent = paceOk ? "var(--blue)" : "var(--red)";
  const footer: FooterStripData[] = [
    { label: "Оперативный", value: state.operationalBalance, accent: null },
    { label: "Подушка", value: state.reserve.amount, accent: null },
    { label: "Накопления", value: state.savings.balance, accent: savingsAccent }
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "var(--paper)"
      }}
    >
      {/* ─── Screen header — ДОВ дата · до зарплаты N дн. ─── */}
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
            {snapshot.rawRemainingDays}
          </span>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
            дн.
          </span>
        </div>
      </div>

      {/* ─── State banner (first non-normal state) ───────── */}
      {bannerState && bannerKind && (
        <Banner
          kind={bannerKind}
          title={stateLabel(bannerState)}
          note={stateText(bannerState, snapshot.nextMandatoryPayment)}
        />
      )}

      {/* payday-arrived: in-flow confirm button right under the banner */}
      {snapshot.uiStates.includes("payday-arrived") && (
        <div style={{ padding: "0 var(--pad-x) 8px", marginTop: 8 }}>
          <Button
            variant="primary"
            onClick={onConfirmPaycheck}
            style={{ width: "100%" }}
          >
            <Glyph shape="square" fill="var(--paper)" size={8} />
            Подтвердить зарплату и начать новый цикл
          </Button>
        </div>
      )}

      {/* ─── Hero — 3px yellow axis · safe today · tick · tomorrow ─── */}
      <div
        style={{
          padding: "22px var(--pad-x) 16px",
          display: "grid",
          gridTemplateColumns: "3px 1fr",
          gap: 14,
          alignItems: "stretch"
        }}
      >
        <div style={{ background: "var(--yellow)" }} />
        <div>
          <div className="eyebrow">Можно потратить сегодня</div>
          <div style={{ marginTop: 10 }}>
            <HeroNumber value={formatMoney(safeToday)} />
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 1, background: "var(--ink)" }} />
            <span
              className="mono"
              style={{ fontSize: 9.5, color: "var(--ink-55)", letterSpacing: "0.02em" }}
            >
              ≈ {formatMoney(tickValue)} ₽/день
            </span>
          </div>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              flexWrap: "wrap"
            }}
          >
            <span className="eyebrow">если не трачу — завтра</span>
            <InlineNumber value={formatMoney(tomorrow)} size={15} />
            {tomorrowDelta > 0 && (
              <span
                className="mono"
                style={{ fontSize: 9, color: "var(--ink-35)" }}
              >
                +{formatMoney(tomorrowDelta)}
              </span>
            )}
          </div>
        </div>
      </div>

      <Explainer state={state} snapshot={snapshot} safeToday={safeToday} />
      <BalanceStrip d={balanceStrip} />
      <PaceRow d={paceData} />
      <MiniCycleAxis d={cycleAxis} />
      {nearest && <NearestPaymentRow d={nearest} />}

      <div style={{ flex: 1, minHeight: 6 }} />

      <FooterStrips items={footer} />
      <CTARow
        primary={{
          label: "Записать расход",
          shape: "square",
          onClick: () => onAction("expense")
        }}
        secondary={{
          label: "В накопления",
          shape: "circle",
          onClick: () => onAction("transfer"),
          tone: "blue"
        }}
      />
    </div>
  );
}
