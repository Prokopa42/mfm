"use client";

import type { ActionDialogKind } from "@/components/action-dialogs";
import { CTARow, HeroNumber } from "@/components/mfm-ui";
import {
  compareDates,
  daysBetween,
  isAfterOrSame,
  isBeforeOrSame,
  parseISODate
} from "@/lib/dates";
import type {
  CalculationSnapshot,
  FinanceState,
  ISODate,
  MandatoryPayment
} from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface CycleScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onMarkPaymentPaid: (payment: MandatoryPayment) => void;
}

/* ─────────────────────────────────────────────────────────────
   Hi-fi 02/05 — Cycle screen.
   Direct port of design/final/МФМ/hifi-cycle.jsx onto live
   snapshot/state. Three payment statuses are kept distinct
   throughout (visually + structurally + textually):
     paid    — оплачен (мат-факт)
     due     — к оплате (вот-вот / просрочен)
     counted — учтён в лимите (вычтен из свободного, но дата позже)
   This mirrors hi-fi {paid, due, counted} status vocabulary.
   ───────────────────────────────────────────────────────────── */

// ─── ru locale: month-short without trailing dot (Intl adds it) ─
const RU_MONTH_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек"
];

function fmtCycleDate(iso: ISODate) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${RU_MONTH_SHORT[d.getMonth()]}`;
}

function fmtTodayAxisLabel(iso: ISODate) {
  const d = parseISODate(iso);
  return `СЕГ · ${d.getDate()} ${RU_MONTH_SHORT[d.getMonth()].toUpperCase()}`;
}

// ─── Hi-fi status derivation ─────────────────────────────
type HiFiStatus = "paid" | "due" | "counted";

const STATUS_COLOR: Record<HiFiStatus, string> = {
  paid: "var(--ink-55)",
  due: "var(--red)",
  counted: "var(--blue)"
};

/**
 * Map our MandatoryPaymentStatus + due-date proximity into hi-fi vocabulary.
 *   - "paid"    → hi-fi "paid"
 *   - status not paid AND (overdue OR dueDate ≤ today + 1)  → "due"
 *   - status not paid AND dueDate further out                → "counted"
 *
 * `counted` corresponds to "уже вычтен из свободного остатка, но платить не пора".
 * This split must stay readable — both label and colour carry it.
 */
function hifiStatus(payment: MandatoryPayment, today: ISODate): HiFiStatus {
  if (payment.status === "paid") return "paid";
  const diff = daysBetween(today, payment.dueDate);
  if (payment.status === "missed" || diff <= 1) return "due";
  return "counted";
}

function relativeDayLabel(dueDate: ISODate, today: ISODate): string {
  const diff = daysBetween(today, dueDate);
  if (diff < -1) return `просрочен на ${Math.abs(diff)} дн.`;
  if (diff === -1) return "был вчера";
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  return `через ${diff} дн.`;
}

// ─── CycleHeader ─────────────────────────────────────────
interface CycleHeaderData {
  cycleStartLabel: string;
  cycleEndLabel: string;
  dayNo: number;
  totalDays: number;
}

function CycleHeader({ d }: { d: CycleHeaderData }) {
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
        <span
          className="slab"
          style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          Цикл
        </span>
        <div style={{ width: 14, height: 0.5, background: "var(--ink-55)" }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
          {d.cycleStartLabel} → {d.cycleEndLabel}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="eyebrow">день</span>
        <span className="slab tnum" style={{ fontSize: 13 }}>
          {d.dayNo}
        </span>
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          / {d.totalDays}
        </span>
      </div>
    </div>
  );
}

// ─── AvailableHero ───────────────────────────────────────
interface AvailableHeroData {
  available: number;
  daysLeft: number;
  dailyLimit: number;
}

function AvailableHero({ d }: { d: AvailableHeroData }) {
  return (
    <div
      style={{
        padding: "18px var(--pad-x) 14px",
        display: "grid",
        gridTemplateColumns: "3px 1fr",
        gap: 14,
        alignItems: "stretch"
      }}
    >
      <div style={{ background: "var(--ink)" }} />
      <div>
        <div className="eyebrow">Доступно до зарплаты</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <HeroNumber value={formatMoney(d.available)} />
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>· {d.daysLeft} дн.</span>
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 1, background: "var(--ink)" }} />
          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>дневной лимит</span>
          <span className="slab tnum" style={{ fontSize: 13 }}>{formatMoney(d.dailyLimit)}</span>
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>₽/день</span>
        </div>
      </div>
    </div>
  );
}

// ─── CycleAxis (full salary→salary) ──────────────────────
interface AxisPayment {
  id: string;
  dayIdx: number;
  status: HiFiStatus;
}

interface FullCycleAxisData {
  totalDays: number;
  todayDayIdx: number;
  cycleStartLabel: string;
  cycleEndLabel: string;
  todayLabel: string;
  payments: AxisPayment[];
}

function FullCycleAxis({ d }: { d: FullCycleAxisData }) {
  const W = 304;
  const H = 78;
  const padX = 6;
  const axisY = 42;
  const N = Math.max(1, d.totalDays);
  const step = (W - padX * 2) / N;
  const xAt = (dayIdx: number) => padX + dayIdx * step;
  const todayIdxClamped = Math.max(0, Math.min(N, d.todayDayIdx));

  return (
    <div style={{ padding: "4px var(--pad-x) 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <span className="eyebrow eyebrow--ink">Ось дней · зарплата → зарплата</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>{d.totalDays} дн.</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* salary endpoints */}
        <line x1={xAt(0)} y1="8" x2={xAt(0)} y2={axisY + 10} stroke="var(--ink)" strokeWidth="1.5" />
        <line x1={xAt(N)} y1="8" x2={xAt(N)} y2={axisY + 10} stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={xAt(0)} cy="8" r="3" fill="var(--blue)" />
        <circle cx={xAt(N)} cy="8" r="3" fill="none" stroke="var(--blue)" strokeWidth="1.2" />

        {/* main axis */}
        <line x1={xAt(0)} y1={axisY} x2={xAt(N)} y2={axisY} stroke="var(--ink)" strokeWidth="0.8" />

        {/* day ticks (week-marks slightly longer) */}
        {Array.from({ length: N + 1 }).map((_, i) => {
          const isWeek = i % 7 === 0;
          return (
            <line
              key={`t${i}`}
              x1={xAt(i)}
              y1={axisY}
              x2={xAt(i)}
              y2={axisY + (isWeek ? 5 : 3)}
              stroke="var(--hair)"
              strokeWidth="0.5"
            />
          );
        })}

        {/* past shade — hairline below axis up to today */}
        <line
          x1={xAt(0)}
          y1={axisY + 2}
          x2={xAt(todayIdxClamped)}
          y2={axisY + 2}
          stroke="var(--ink-35)"
          strokeWidth="0.8"
        />

        {/* today vertical + circle + label */}
        <line
          x1={xAt(todayIdxClamped)}
          y1={axisY - 18}
          x2={xAt(todayIdxClamped)}
          y2={axisY + 12}
          stroke="var(--ink)"
          strokeWidth="1.5"
        />
        <circle cx={xAt(todayIdxClamped)} cy={axisY} r="2.6" fill="var(--ink)" />
        <text
          x={xAt(todayIdxClamped)}
          y={axisY - 22}
          fontSize="7.5"
          fontFamily="var(--font-slab)"
          textAnchor="middle"
          fill="var(--ink)"
          letterSpacing="0.8"
        >
          {d.todayLabel}
        </text>

        {/* payment notches above axis — paid mark / due triangle / counted ring */}
        {d.payments.map((p) => {
          const x = xAt(Math.max(0, Math.min(N, p.dayIdx)));
          const col = STATUS_COLOR[p.status];
          const y0 = axisY - 10;
          const y1 = axisY;
          return (
            <g key={p.id}>
              <line x1={x} y1={y0} x2={x} y2={y1} stroke={col} strokeWidth={p.status === "due" ? 1.5 : 1} />
              {p.status === "paid" && (
                <line x1={x - 2} y1={y0} x2={x + 2} y2={y0} stroke={col} strokeWidth="1" />
              )}
              {p.status === "due" && (
                <polygon points={`${x - 2.2},${y0 - 1} ${x + 2.2},${y0 - 1} ${x},${y0 - 4}`} fill={col} />
              )}
              {p.status === "counted" && (
                <circle cx={x} cy={y0} r="1.6" fill="none" stroke={col} strokeWidth="1" />
              )}
            </g>
          );
        })}

        {/* endpoint labels */}
        <text
          x={xAt(0)}
          y={axisY + 18}
          fontSize="7"
          fontFamily="var(--font-mono)"
          fill="var(--ink-55)"
          textAnchor="start"
        >
          {d.cycleStartLabel}
        </text>
        <text
          x={xAt(N)}
          y={axisY + 18}
          fontSize="7"
          fontFamily="var(--font-mono)"
          fill="var(--ink-55)"
          textAnchor="end"
        >
          {d.cycleEndLabel}
        </text>

        {/* mid-week tick labels — only if cycle is long enough */}
        {[7, 14, 21].filter((wk) => wk < N).map((wk) => (
          <text
            key={wk}
            x={xAt(wk)}
            y={axisY + 18}
            fontSize="7"
            fontFamily="var(--font-mono)"
            fill="var(--ink-35)"
            textAnchor="middle"
          >
            {wk}
          </text>
        ))}

        {/* legend */}
        <g transform={`translate(${padX}, ${H - 8})`}>
          <LegendDot x={0} label="оплачен" color={STATUS_COLOR.paid} shape="bar" />
          <LegendDot x={68} label="к оплате" color={STATUS_COLOR.due} shape="tri" />
          <LegendDot x={138} label="учтён" color={STATUS_COLOR.counted} shape="dot" />
        </g>
      </svg>
    </div>
  );
}

function LegendDot({
  x,
  label,
  color,
  shape
}: {
  x: number;
  label: string;
  color: string;
  shape: "bar" | "tri" | "dot";
}) {
  return (
    <g transform={`translate(${x}, 0)`}>
      {shape === "bar" && <line x1="0" y1="-2" x2="4" y2="-2" stroke={color} strokeWidth="1" />}
      {shape === "tri" && <polygon points="0,-1 4,-1 2,-4" fill={color} />}
      {shape === "dot" && <circle cx="2" cy="-2" r="1.6" fill="none" stroke={color} strokeWidth="1" />}
      <text
        x="8"
        y="0"
        fontSize="7"
        fontFamily="var(--font-mono)"
        fill="var(--ink-55)"
        letterSpacing="0.04em"
      >
        {label}
      </text>
    </g>
  );
}

// ─── NextPaymentCallout ──────────────────────────────────
interface NextPaymentCalloutData {
  name: string;
  dateLabel: string;
  whenLabel: string;
  amount: number;
  status: HiFiStatus;
}

function NextPaymentCallout({ d }: { d: NextPaymentCalloutData }) {
  return (
    <div
      style={{
        margin: "0 var(--pad-x) 10px",
        border: "0.5px solid var(--ink)",
        display: "grid",
        gridTemplateColumns: "3px 1fr auto",
        alignItems: "stretch"
      }}
    >
      <div style={{ background: STATUS_COLOR[d.status] }} />
      <div style={{ padding: "8px 10px" }}>
        <div className="eyebrow" style={{ fontSize: 8 }}>
          Ближайший платёж · {d.whenLabel}
        </div>
        <div style={{ marginTop: 2, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="slab" style={{ fontSize: 13, letterSpacing: "-0.01em" }}>
            {d.name}
          </span>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
            · {d.dateLabel}
          </span>
        </div>
      </div>
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          borderLeft: "0.5px solid var(--hair)"
        }}
      >
        <span className="slab tnum" style={{ fontSize: 15, color: STATUS_COLOR[d.status] }}>
          {formatMoney(d.amount)}
        </span>
        <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
          ₽
        </span>
      </div>
    </div>
  );
}

// ─── CycleSummary triad ──────────────────────────────────
interface CycleSummaryData {
  paidSoFar: number;
  remainingMandatory: number;
  discretionary: number;
}

function CycleSummary({ d }: { d: CycleSummaryData }) {
  return (
    <div
      style={{
        margin: "4px var(--pad-x) 8px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        border: "0.5px solid var(--ink-80)"
      }}
    >
      <SummaryCell label="оплачено" value={d.paidSoFar} color="var(--ink-55)" />
      <SummaryCell
        label="осталось платежей"
        value={d.remainingMandatory}
        color="var(--red)"
        divider
      />
      <SummaryCell label="свободные" value={d.discretionary} color="var(--blue)" divider />
    </div>
  );
}

function SummaryCell({
  label,
  value,
  color,
  divider
}: {
  label: string;
  value: number;
  color: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        padding: "7px 9px",
        borderLeft: divider ? "0.5px solid var(--ink-80)" : "none"
      }}
    >
      <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>
        {label}
      </div>
      <span className="slab tnum" style={{ fontSize: 13, color }}>
        {value < 0 ? "−" : ""}
        {formatMoney(Math.abs(value))}
      </span>
      <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)", marginLeft: 3 }}>
        ₽
      </span>
    </div>
  );
}

// ─── PaymentsList ────────────────────────────────────────
interface ListPayment {
  id: string;
  date: string;
  name: string;
  amount: number;
  status: HiFiStatus;
}

function PaymentsList({ d }: { d: { payments: ListPayment[]; total: number } }) {
  const due = d.payments.filter((p) => p.status === "due");
  const counted = d.payments.filter((p) => p.status === "counted");
  const paid = d.payments.filter((p) => p.status === "paid");

  return (
    <div style={{ padding: "4px var(--pad-x) 8px", borderTop: "0.5px solid var(--hair)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginTop: 8,
          marginBottom: 8
        }}
      >
        <span className="eyebrow eyebrow--ink">Обязательные платежи</span>
        <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          {d.payments.length} шт · {formatMoney(d.total)} ₽
        </span>
      </div>

      <PaymentGroup title="К оплате" payments={due} />
      <PaymentGroup title="Учтены в лимите" payments={counted} />
      <PaymentGroup title="Оплачены" payments={paid} muted />
    </div>
  );
}

function PaymentGroup({
  title,
  payments,
  muted
}: {
  title: string;
  payments: ListPayment[];
  muted?: boolean;
}) {
  if (payments.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 4
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 8.5,
            color: "var(--ink-55)",
            letterSpacing: "0.06em",
            textTransform: "uppercase"
          }}
        >
          {title}
        </span>
        <span className="mono tnum" style={{ fontSize: 9, color: "var(--ink-55)" }}>
          {payments.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {payments.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: "grid",
              gridTemplateColumns: "2px 44px 1fr auto",
              alignItems: "center",
              columnGap: 10,
              padding: "6px 0",
              borderTop: i === 0 ? "0.5px solid var(--ink-80)" : "0.5px solid var(--hair)",
              opacity: muted ? 0.6 : 1
            }}
          >
            <div style={{ width: 2, height: 14, background: STATUS_COLOR[p.status] }} />
            <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
              {p.date}
            </span>
            <span
              className="slab"
              style={{
                fontSize: 11.5,
                letterSpacing: "-0.01em",
                textDecoration: muted ? "line-through" : "none",
                textDecorationColor: "var(--ink-35)"
              }}
            >
              {p.name}
            </span>
            <span
              className="slab tnum"
              style={{ fontSize: 12, color: p.status === "due" ? "var(--red)" : "var(--ink)" }}
            >
              {formatMoney(p.amount)}
              <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
                {" "}
                ₽
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────
export function CycleScreen({ state, snapshot, onMarkPaymentPaid }: CycleScreenProps) {
  // ─── Cycle window / day index ─────────────────────────
  const cycleStart = state.payCycle.startDate;
  const cycleEnd = state.payCycle.endDate;
  const totalDays = Math.max(1, daysBetween(cycleStart, cycleEnd) + 1);
  const todayDayIdx = Math.max(0, daysBetween(cycleStart, snapshot.today));

  const headerData: CycleHeaderData = {
    cycleStartLabel: fmtCycleDate(cycleStart),
    cycleEndLabel: fmtCycleDate(cycleEnd),
    dayNo: Math.min(totalDays, todayDayIdx + 1),
    totalDays
  };

  // ─── Hero ─────────────────────────────────────────────
  const hero: AvailableHeroData = {
    available: Math.max(0, snapshot.availableUntilNextPaycheck),
    daysLeft: snapshot.rawRemainingDays,
    dailyLimit: Math.round(snapshot.safeToSpendToday)
  };

  // ─── All payments inside the current cycle window ────
  // Includes paid ones (we want them visible in the "Оплачены" group +
  // as paid notches on the axis). Sort by due date asc.
  const cyclePayments = state.mandatoryPayments
    .filter((p) => isAfterOrSame(p.dueDate, cycleStart) && isBeforeOrSame(p.dueDate, cycleEnd))
    .sort((a, b) => compareDates(a.dueDate, b.dueDate))
    .map((p) => ({
      ...p,
      _hifiStatus: hifiStatus(p, snapshot.today)
    }));

  // ─── Axis payments (id + dayIdx + hi-fi status) ──────
  const axisPayments: AxisPayment[] = cyclePayments.map((p) => ({
    id: p.id,
    dayIdx: Math.max(0, Math.min(totalDays, daysBetween(cycleStart, p.dueDate))),
    status: p._hifiStatus
  }));

  const axisData: FullCycleAxisData = {
    totalDays,
    todayDayIdx,
    cycleStartLabel: fmtCycleDate(cycleStart),
    cycleEndLabel: fmtCycleDate(cycleEnd),
    todayLabel: fmtTodayAxisLabel(snapshot.today),
    payments: axisPayments
  };

  // ─── Next payment callout ────────────────────────────
  // Pick first non-paid payment in the cycle window. snapshot.upcomingMandatoryPayments
  // already excludes paid ones — use the first there. If none, no callout.
  const nextRaw = snapshot.upcomingMandatoryPayments[0];
  const nextStatus = nextRaw ? hifiStatus(nextRaw, snapshot.today) : null;
  const nextCallout: NextPaymentCalloutData | null =
    nextRaw && nextStatus
      ? {
          name: nextRaw.title,
          dateLabel: fmtCycleDate(nextRaw.dueDate),
          whenLabel: relativeDayLabel(nextRaw.dueDate, snapshot.today),
          amount: nextRaw.amount,
          status: nextStatus
        }
      : null;

  // ─── Summary triad ───────────────────────────────────
  const totalMandatory = cyclePayments.reduce((s, p) => s + p.amount, 0);
  const paidSoFar = cyclePayments
    .filter((p) => p._hifiStatus === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const remainingMandatory = totalMandatory - paidSoFar;
  // Discretionary = opening balance of this cycle minus all mandatory in window.
  // We use openingOperational (recorded at cycle start) as the honest baseline.
  const discretionary = state.payCycle.openingOperational - totalMandatory;

  const summary: CycleSummaryData = {
    paidSoFar,
    remainingMandatory,
    discretionary
  };

  // ─── Payments list ───────────────────────────────────
  const listPayments: ListPayment[] = cyclePayments.map((p) => ({
    id: p.id,
    date: fmtCycleDate(p.dueDate),
    name: p.title,
    amount: p.amount,
    status: p._hifiStatus
  }));

  // ─── CTA — "Отметить оплату" ──────────────────────────
  // Marks the next non-paid payment as paid through the existing handler.
  // If no candidate exists, primary CTA is disabled. "Новый платёж"
  // (secondary slot in hi-fi mock) is intentionally omitted in this step:
  // there's no MandatoryPayment dialog kind in action-dialogs yet (planned
  // for step 11). Showing a non-functional secondary would lie to the user.
  const markPaymentTarget = nextRaw ?? null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "var(--paper)"
      }}
    >
      <CycleHeader d={headerData} />
      <AvailableHero d={hero} />
      <FullCycleAxis d={axisData} />
      {nextCallout && <NextPaymentCallout d={nextCallout} />}
      <CycleSummary d={summary} />
      <PaymentsList
        d={{
          payments: listPayments,
          total: totalMandatory
        }}
      />

      <div style={{ flex: 1, minHeight: 6 }} />

      <CTARow
        primary={{
          label: "Отметить оплату",
          shape: "triangle",
          onClick: () => {
            if (markPaymentTarget) onMarkPaymentPaid(markPaymentTarget);
          },
          disabled: !markPaymentTarget
        }}
      />
    </div>
  );
}

