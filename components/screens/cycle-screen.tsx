"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { CTARow, HeroNumber } from "@/components/mfm-ui";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDays,
  compareDates,
  daysBetween,
  getPaycheckSlotForDate,
  isAfterOrSame,
  isBeforeOrSame,
  isSameDate,
  parseISODate,
  toISODate
} from "@/lib/dates";
import type {
  CalculationSnapshot,
  Credit,
  CreditEvent,
  CreditEventKind,
  ExpensePaymentSource,
  FinanceState,
  ISODate,
  MandatoryPayment,
  MandatoryPaymentRecurrence,
  Rubric,
  SavingsGoal
} from "@/lib/types";
import { formatMoney, numberFromInput } from "@/lib/utils";

interface CycleScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onMarkPaymentPaid: (
    payment: MandatoryPayment,
    options?: { paymentSource?: ExpensePaymentSource; creditId?: string }
  ) => void;
  onAddMandatoryPayment: (payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onUpdateMandatoryPayment: (paymentId: string, payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onDeleteMandatoryPayment: (paymentId: string) => void;
  onSkipMandatoryPaymentOccurrence: (paymentId: string, date: ISODate) => void;
  onCancelMandatoryPayment: (payment: MandatoryPayment) => void;
  onSaveCredit: (credit: Omit<Credit, "id"> & { id?: string }) => void;
  onAddCreditEvent: (event: Omit<CreditEvent, "id">) => void;
  onDeleteCreditEvent: (eventId: string) => void;
  onToggleCreditClosed: (creditId: string, isClosed: boolean) => void;
  rubrics: Rubric[];
  goals: SavingsGoal[];
}

/* ─────────────────────────────────────────────────────────────
   Hi-fi 02/05 — Cycle screen.
   Direct port of design/final/МФМ/hifi-cycle.jsx onto live
   snapshot/state. Three payment statuses are kept distinct
   throughout (visually + structurally + textually):
     paid    — оплачен (мат-факт)
     due     — к оплате (вот-вот / просрочен)
     payday  — в день зарплаты (виден, но не режет текущий лимит)
     counted — учтён в лимите (вычтен из свободного, но дата позже)
   This mirrors hi-fi {paid, due, payday, counted} status vocabulary.
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

function normalizeISODate(date: ISODate): ISODate {
  return date.slice(0, 10);
}

function monthKey(iso: ISODate) {
  const d = parseISODate(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(iso: ISODate) {
  const d = parseISODate(iso);
  return `${RU_MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function addMonthsClamped(date: ISODate, months: number): ISODate {
  const base = parseISODate(date);
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISODate(new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay)));
}

function fmtTodayAxisLabel(iso: ISODate) {
  const d = parseISODate(iso);
  return `СЕГ · ${d.getDate()} ${RU_MONTH_SHORT[d.getMonth()].toUpperCase()}`;
}

// ─── Hi-fi status derivation ─────────────────────────────
type HiFiStatus = "paid" | "due" | "payday" | "counted";

const STATUS_COLOR: Record<HiFiStatus, string> = {
  paid: "var(--ink-55)",
  due: "var(--red)",
  payday: "var(--yellow)",
  counted: "var(--blue)"
};

const STATUS_SOFT_BG: Record<HiFiStatus, string> = {
  paid: "transparent",
  due: "rgba(214, 48, 49, 0.08)",
  payday: "rgba(236, 204, 58, 0.16)",
  counted: "rgba(7, 73, 169, 0.08)"
};

const STATUS_LABEL: Record<HiFiStatus, string> = {
  paid: "Оплачены",
  due: "К оплате",
  payday: "В день зарплаты",
  counted: "Учтены в лимите"
};

const STATUS_HINT: Record<HiFiStatus, string> = {
  paid: "уже списаны",
  due: "сегодня или просрочены",
  payday: "видны отдельно, лимит не режут до зарплаты",
  counted: "до зарплаты, уже вычтены из свободных"
};

const STATUS_SHAPE: Record<HiFiStatus, "bar" | "tri" | "square" | "dot"> = {
  paid: "bar",
  due: "tri",
  payday: "square",
  counted: "dot"
};

/**
 * Map payment state into the hi-fi vocabulary used by Cycle.
 * Payday-date payments are visible before payday, but not counted in the
 * current pre-paycheck limit. On payday they become due.
 */
function hifiStatus(payment: MandatoryPayment, today: ISODate, nextPaycheckDate: ISODate): HiFiStatus {
  const dueDate = normalizeISODate(payment.dueDate);
  if (payment.status === "paid") return "paid";
  if (payment.status === "missed") return "due";
  if (isSameDate(dueDate, nextPaycheckDate) && compareDates(today, nextPaycheckDate) < 0) return "payday";
  const diff = daysBetween(today, dueDate);
  if (diff <= 1) return "due";
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

function paymentWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "платёж";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "платежа";
  return "платежей";
}

function creditEventEffect(event: CreditEvent) {
  if (event.kind === "charge") return event.amount;
  if (event.kind === "payment") return -event.amount;
  return event.amount;
}

function calculateCreditBalance(credit: Credit, events: CreditEvent[]) {
  return Math.max(
    0,
    credit.openingBalance +
      events
        .filter((event) => event.creditId === credit.id)
        .reduce((sum, event) => sum + creditEventEffect(event), 0)
  );
}

function creditEventLabel(kind: CreditEventKind) {
  const labels: Record<CreditEventKind, string> = {
    charge: "Увеличение",
    payment: "Платёж",
    adjustment: "Корректировка"
  };
  return labels[kind];
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
        padding: "14px var(--pad-x) 12px",
        display: "grid",
        gridTemplateColumns: "3px 1fr",
        gap: 12,
        alignItems: "stretch"
      }}
    >
      <div style={{ background: "var(--ink)" }} />
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div className="eyebrow">Доступно до зарплаты</div>
          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
            до зарплаты {d.daysLeft} дн.
          </span>
        </div>
        <div style={{ marginTop: 7, display: "flex", alignItems: "baseline", gap: 10 }}>
          <HeroNumber value={formatMoney(d.available)} size={58} xSize={24} />
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 9 }}>
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
  cycleStartDate: ISODate;
  cycleEndDate: ISODate;
  totalDays: number;
  todayDayIdx: number;
  cycleStartLabel: string;
  cycleEndLabel: string;
  todayLabel: string;
  payments: AxisPayment[];
}

function FullCycleAxis({ d }: { d: FullCycleAxisData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(304);
  const H = 60;
  const padX = 4;
  const axisY = 31;
  const N = Math.max(1, d.totalDays);
  const W = Math.max(260, containerWidth);
  const step = (W - padX * 2) / N;
  const xAt = (dayIdx: number) => padX + dayIdx * step;
  const todayIdxClamped = Math.max(0, Math.min(N, d.todayDayIdx));

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
    <div style={{ padding: "0 var(--pad-x) 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span
          className="eyebrow eyebrow--ink"
          style={{
            padding: "1px 5px 0",
            background: "var(--yellow)"
          }}
        >
          От зарплаты до зарплаты
        </span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>{d.totalDays} дн.</span>
      </div>
      <div ref={containerRef} style={{ width: "100%" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          style={{ display: "block", overflow: "visible" }}
        >
          {/* salary endpoints */}
          <line x1={xAt(0)} y1="8" x2={xAt(0)} y2={axisY + 8} stroke="var(--ink)" strokeWidth="1.4" />
          <line x1={xAt(N)} y1="8" x2={xAt(N)} y2={axisY + 8} stroke="var(--ink)" strokeWidth="1.4" />
          <circle cx={xAt(0)} cy="8" r="3" fill="var(--blue)" />
          <circle cx={xAt(N)} cy="8" r="3" fill="none" stroke="var(--blue)" strokeWidth="1.2" />
          <text
            x={xAt(0) + 6}
            y="10"
            fontSize="6.5"
            fontFamily="var(--font-mono)"
            fill="var(--ink-55)"
            letterSpacing="0.04em"
          >
            зп
          </text>
          <text
            x={xAt(N) - 6}
            y="10"
            fontSize="6.5"
            fontFamily="var(--font-mono)"
            fill="var(--ink-55)"
            textAnchor="end"
            letterSpacing="0.04em"
          >
            зп
          </text>

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
            y1={axisY - 14}
            x2={xAt(todayIdxClamped)}
            y2={axisY + 9}
            stroke="var(--ink)"
            strokeWidth="1.5"
          />
          <circle cx={xAt(todayIdxClamped)} cy={axisY} r="2.6" fill="var(--ink)" />
          <text
            x={xAt(todayIdxClamped)}
            y={axisY - 18}
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
            const y0 = axisY - 9;
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
                {p.status === "payday" && (
                  <rect x={x - 2.1} y={y0 - 4.1} width="4.2" height="4.2" fill="none" stroke={col} strokeWidth="1" />
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
            y={axisY + 15}
            fontSize="7"
            fontFamily="var(--font-mono)"
            fill="var(--ink-55)"
            textAnchor="start"
          >
            {d.cycleStartLabel}
          </text>
          <text
            x={xAt(N)}
            y={axisY + 15}
            fontSize="7"
            fontFamily="var(--font-mono)"
            fill="var(--ink-55)"
            textAnchor="end"
          >
            {d.cycleEndLabel}
          </text>

          {/* checkable date labels across the live cycle */}
          {makeAxisLabelIndexes(N).map((idx) => {
            if (idx === 0 || idx === N) return null;
            return (
              <text
                key={idx}
                x={xAt(idx)}
                y={axisY + 15}
                fontSize="7"
                fontFamily="var(--font-mono)"
                fill="var(--ink-35)"
                textAnchor="middle"
              >
                {parseISODate(addDays(d.cycleStartDate, idx)).getDate()}
              </text>
            );
          })}

        </svg>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, max-content)",
          justifyContent: "start",
          alignItems: "center",
          columnGap: 9,
          marginTop: -6,
          overflow: "hidden",
          whiteSpace: "nowrap"
        }}
      >
        <LegendItem label="оплачен" color={STATUS_COLOR.paid} shape="bar" />
        <LegendItem label="к оплате" color={STATUS_COLOR.due} shape="tri" />
        <LegendItem label="в день зарплаты" color={STATUS_COLOR.payday} shape="square" />
        <LegendItem label="учтён" color={STATUS_COLOR.counted} shape="dot" />
      </div>
    </div>
  );
}

function LegendItem({
  label,
  color,
  shape
}: {
  label: string;
  color: string;
  shape: "bar" | "tri" | "square" | "dot";
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, whiteSpace: "nowrap" }}>
      <StatusGlyph shape={shape} color={color} />
      <span className="mono" style={{ fontSize: 7.3, color: "var(--ink-55)", letterSpacing: "0.02em" }}>
        {label}
      </span>
    </span>
  );
}

function StatusGlyph({
  shape,
  color,
  size = 12
}: {
  shape: "bar" | "tri" | "square" | "dot";
  color: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "block", flex: "0 0 auto" }}>
      {shape === "bar" && <line x1="3" y1="6" x2="9" y2="6" stroke={color} strokeWidth="1.7" />}
      {shape === "tri" && <polygon points="3,8 9,8 6,3.5" fill={color} />}
      {shape === "square" && (
        <rect x="3.6" y="3.6" width="4.8" height="4.8" fill="none" stroke={color} strokeWidth="1.6" />
      )}
      {shape === "dot" && <circle cx="6" cy="6" r="2.7" fill="none" stroke={color} strokeWidth="1.6" />}
    </svg>
  );
}

function makeAxisLabelIndexes(totalDays: number) {
  const step = Math.max(1, Math.ceil(totalDays / 5));
  return Array.from(new Set([0, step, step * 2, step * 3, step * 4, totalDays]))
    .filter((idx) => idx >= 0 && idx <= totalDays)
    .sort((a, b) => a - b);
}

// ─── NextPaymentCallout ──────────────────────────────────
interface NextPaymentCalloutData {
  name: string;
  detail?: string;
  dateLabel?: string;
  whenLabel?: string;
  amount?: number;
  status: HiFiStatus;
  empty?: boolean;
}

function NextPaymentCallout({ d }: { d: NextPaymentCalloutData }) {
  return (
    <div
      style={{
        margin: "0 var(--pad-x) 8px",
        border: "0.5px solid var(--ink)",
        display: "grid",
        gridTemplateColumns: d.empty ? "3px 1fr" : "3px 1fr auto",
        alignItems: "stretch"
      }}
    >
      <div style={{ background: d.empty ? "var(--hair)" : STATUS_COLOR[d.status] }} />
      <div style={{ padding: "8px 10px" }}>
        <div className="eyebrow" style={{ fontSize: 8 }}>
          Ближайший платёж{d.whenLabel ? ` · ${d.whenLabel}` : ""}
        </div>
        <div style={{ marginTop: 2, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="slab" style={{ fontSize: 13, letterSpacing: "-0.01em" }}>
            {d.name}
          </span>
          {d.dateLabel && (
            <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
              · {d.dateLabel}
            </span>
          )}
        </div>
        {d.detail && (
          <div className="mono" style={{ marginTop: 3, fontSize: 8.8, color: "var(--ink-55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.detail}
          </div>
        )}
      </div>
      {!d.empty && typeof d.amount === "number" && (
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
      )}
    </div>
  );
}

// ─── Mandatory payment dialog ───────────────────────────
type PaymentDialogMode = "create" | "edit";

interface MandatoryPaymentDialogProps {
  open: boolean;
  mode: PaymentDialogMode;
  payment?: MandatoryPayment;
  draftPayment?: Partial<MandatoryPayment>;
  defaultDate: ISODate;
  rubrics: Rubric[];
  goals: SavingsGoal[];
  credits: Credit[];
  creditEvents: CreditEvent[];
  onOpenChange: (open: boolean) => void;
  onSave: (payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onDelete?: (payment: MandatoryPayment) => void;
}

function MandatoryPaymentDialog({
  open,
  mode,
  payment,
  draftPayment,
  defaultDate,
  rubrics,
  goals,
  credits,
  creditEvents,
  onOpenChange,
  onSave,
  onDelete
}: MandatoryPaymentDialogProps) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate);
  const [recurrence, setRecurrence] = useState<MandatoryPaymentRecurrence>("monthly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const rubricOptions = useMemo(
    () => {
      const active = rubrics
        .filter((rubric) => rubric.scope === "mandatory-payment" && !rubric.isArchived)
        .slice()
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));
      const current = payment?.categoryId
        ? rubrics.find((rubric) => rubric.id === payment.categoryId && rubric.scope === "mandatory-payment")
        : undefined;
      if (current && !active.some((rubric) => rubric.id === current.id)) return [...active, current];
      return active;
    },
    [payment?.categoryId, rubrics]
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(rubricOptions[0]?.id);
  const activeCredits = useMemo(
    () =>
      credits
        .filter((credit) => !credit.isClosed)
        .slice()
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru")),
    [credits]
  );
  const [linkedCreditId, setLinkedCreditId] = useState<string>("");
  const activeGoals = useMemo(
    () =>
      goals
        .slice()
        .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "ru")),
    [goals]
  );
  const [linkedGoalId, setLinkedGoalId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setTitle(payment?.title ?? "");
    setAmount(payment ? String(payment.amount) : draftPayment?.amount ? String(draftPayment.amount) : "");
    setTitle(payment?.title ?? draftPayment?.title ?? "");
    setDueDate(payment?.dueDate ?? draftPayment?.dueDate ?? defaultDate);
    setRecurrence(payment?.recurrence ?? draftPayment?.recurrence ?? "monthly");
    setRecurrenceEndDate(payment?.recurrenceEndDate ?? draftPayment?.recurrenceEndDate ?? "");
    setDeleteConfirm(false);
    setCategoryId(
      payment?.categoryId && rubricOptions.some((rubric) => rubric.id === payment.categoryId)
        ? payment.categoryId
        : draftPayment?.categoryId && rubricOptions.some((rubric) => rubric.id === draftPayment.categoryId)
          ? draftPayment.categoryId
        : rubricOptions[0]?.id
    );
    setLinkedCreditId(payment?.linkedCreditId ?? draftPayment?.linkedCreditId ?? "");
    setLinkedGoalId(payment?.linkedGoalId ?? draftPayment?.linkedGoalId ?? "");
  }, [defaultDate, draftPayment, open, payment, rubricOptions]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const numericAmount = numberFromInput(amount);
    if (!cleanTitle || numericAmount <= 0 || !dueDate) return;
    const nextLinkedCreditId = linkedCreditId && !linkedGoalId ? linkedCreditId : "";
    const nextLinkedGoalId = linkedGoalId ? linkedGoalId : "";

    onSave({
      title: cleanTitle,
      amount: numericAmount,
      dueDate,
      recurrence,
      recurrenceEndDate: recurrence === "monthly" && recurrenceEndDate ? recurrenceEndDate : undefined,
      recurrenceExceptions: payment?.recurrenceExceptions,
      sourceRecurringPaymentId: draftPayment?.sourceRecurringPaymentId,
      sourceRecurringDate: draftPayment?.sourceRecurringDate,
      categoryId,
      linkedCreditId: nextLinkedCreditId || undefined,
      linkedGoalId: nextLinkedGoalId || undefined
    });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Изменить платёж" : "Новый платёж"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Измените будущий обязательный платёж. Оплаченные платежи здесь не переписываются."
              : "Добавьте обязательный платёж. Если дата попадает до зарплаты, он сразу уменьшит доступную сумму."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogField id="cycle-payment-title" label="Название">
              <Input
                id="cycle-payment-title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Например: интернет, аренда, сервис"
                autoFocus
                required
              />
            </DialogField>
            <DialogField id="cycle-payment-amount" label="Сумма">
              <Input
                id="cycle-payment-amount"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                inputMode="decimal"
                placeholder="0"
                required
              />
            </DialogField>
            <DialogField id="cycle-payment-due-date" label="Дата">
              <Input
                id="cycle-payment-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.currentTarget.value as ISODate)}
                required
              />
            </DialogField>
            <DialogField id="cycle-payment-category" label="Рубрика">
              {rubricOptions.length > 0 ? (
                <select
                  id="cycle-payment-category"
                  value={categoryId ?? rubricOptions[0]?.id}
                  onChange={(event) => setCategoryId(event.currentTarget.value)}
                  style={{
                    width: "100%",
                    minHeight: 38,
                    border: "0.5px solid var(--ink-80)",
                    borderRadius: 0,
                    background: "var(--paper)",
                    color: "var(--ink)",
                    padding: "0 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11
                  }}
                >
                  {rubricOptions.map((rubric) => (
                    <option key={rubric.id} value={rubric.id}>
                      {rubric.title}
                      {rubric.isArchived ? " · архив" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
                  Нет активных рубрик для обязательных платежей.
                </div>
              )}
            </DialogField>
            <DialogField id="cycle-payment-credit" label="Кредит">
              <select
                id="cycle-payment-credit"
                value={linkedCreditId}
                onChange={(event) => {
                  setLinkedCreditId(event.currentTarget.value);
                  if (event.currentTarget.value) setLinkedGoalId("");
                }}
                style={{
                  width: "100%",
                  minHeight: 38,
                  border: "0.5px solid var(--ink-80)",
                  borderRadius: 0,
                  background: "var(--paper)",
                  color: "var(--ink)",
                  padding: "0 8px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11
                }}
              >
                <option value="">Без связи с кредитом</option>
                {activeCredits.map((credit) => (
                  <option key={credit.id} value={credit.id}>
                    {credit.title} · {formatMoney(calculateCreditBalance(credit, creditEvents))} ₽
                  </option>
                ))}
              </select>
            </DialogField>
            <DialogField id="cycle-payment-goal" label="Цель накоплений">
              <select
                id="cycle-payment-goal"
                value={linkedGoalId}
                onChange={(event) => {
                  setLinkedGoalId(event.currentTarget.value);
                  if (event.currentTarget.value) setLinkedCreditId("");
                }}
                style={{
                  width: "100%",
                  minHeight: 38,
                  border: "0.5px solid var(--ink-80)",
                  borderRadius: 0,
                  background: "var(--paper)",
                  color: "var(--ink)",
                  padding: "0 8px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11
                }}
              >
                <option value="">Без связи с целью</option>
                {activeGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title} · выделено {formatMoney(goal.allocated)} ₽
                  </option>
                ))}
              </select>
              <div className="mono" style={{ marginTop: 4, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
                При оплате своими деньгами сумма уйдёт в котёл и увеличит выделено по выбранной цели.
              </div>
            </DialogField>
            <DialogField id="cycle-payment-recurrence" label="Тип">
              <PaymentTypeControl value={recurrence} onChange={setRecurrence} />
            </DialogField>
            {recurrence === "monthly" && (
              <DialogField id="cycle-payment-recurrence-end" label="Повторять до">
                <Input
                  id="cycle-payment-recurrence-end"
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(event) => setRecurrenceEndDate(event.currentTarget.value)}
                />
                <div className="mono" style={{ marginTop: 4, fontSize: 9, color: "var(--ink-55)", lineHeight: 1.45 }}>
                  Пусто — бессрочно. Дата задана — повторения только до этой даты включительно.
                </div>
              </DialogField>
            )}
            {mode === "edit" && payment && payment.status !== "paid" && onDelete && (
              <div style={{ borderTop: "0.5px solid var(--hair)", paddingTop: 10 }}>
                {!deleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="tap-highlight mono"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--red)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 9.5,
                      padding: 0,
                      textDecoration: "underline",
                      textDecorationThickness: "0.5px",
                      textUnderlineOffset: 3
                    }}
                  >
                    Удалить платёж
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.45, color: "var(--ink-55)" }}>
                    {payment.recurrence === "monthly"
                      ? "Удалить всю серию неоплаченных ежемесячных платежей? Уже оплаченные платежи не переписываются."
                      : "Удалить этот неоплаченный платёж? Он исчезнет из расчёта и списка. Деньги не изменятся."}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                        className="tap-highlight"
                        style={{
                          border: "0.5px solid var(--ink-35)",
                          background: "transparent",
                          color: "var(--ink)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          padding: "8px 10px"
                        }}
                      >
                        <span className="slab" style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          Оставить
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(payment);
                          onOpenChange(false);
                        }}
                        className="tap-highlight"
                        style={{
                          border: "0.5px solid var(--red)",
                          background: "transparent",
                          color: "var(--red)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          padding: "8px 10px"
                        }}
                      >
                        <span className="slab" style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          Удалить
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogBody>
          <button
            type="submit"
            className="tap-highlight"
            style={{
              width: "100%",
              padding: "13px 14px",
              border: "none",
              borderTop: "0.5px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--paper)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span className="slab" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {mode === "edit" ? "Сохранить платёж" : "Добавить платёж"}
            </span>
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentTypeControl({
  value,
  onChange
}: {
  value: MandatoryPaymentRecurrence;
  onChange: (value: MandatoryPaymentRecurrence) => void;
}) {
  const options: Array<{ id: MandatoryPaymentRecurrence; label: string }> = [
    { id: "monthly", label: "Ежемесячно" },
    { id: "once", label: "Разово" }
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        width: "100%",
        border: "0.5px solid var(--ink-80)"
      }}
    >
      {options.map((option, index) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="tap-highlight"
            style={{
              minWidth: 0,
              padding: "7px 8px",
              background: selected ? "var(--ink)" : "transparent",
              color: selected ? "var(--paper)" : "var(--ink-55)",
              border: "none",
              borderLeft: index === 0 ? "none" : "0.5px solid var(--ink-80)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span
              className="slab"
              style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CancelPaymentDialog({
  payment,
  today,
  linkedCreditEvent,
  onOpenChange,
  onConfirm
}: {
  payment: MandatoryPayment | null;
  today: ISODate;
  linkedCreditEvent?: CreditEvent;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payment: MandatoryPayment, rollbackCreditEvent: boolean) => void;
}) {
  const [rollbackCreditEvent, setRollbackCreditEvent] = useState(true);
  const nextStatus = payment
    ? compareDates(payment.dueDate, today) < 0
      ? "просроченным"
      : "запланированным"
    : "";

  useEffect(() => {
    if (payment) setRollbackCreditEvent(Boolean(linkedCreditEvent));
  }, [linkedCreditEvent, payment]);

  const paidFromCredit = payment?.paidFrom === "credit";
  const cancelText = payment
    ? paidFromCredit
      ? `Оперативный остаток не изменится. Долг по карте будет откатан, а платёж станет ${nextStatus}.`
      : `Сумма ${formatMoney(payment.amount)} ₽ вернётся в оперативный остаток, а платёж станет ${nextStatus}.`
    : "";

  return (
    <Dialog open={Boolean(payment)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отменить оплату</DialogTitle>
          <DialogDescription>
            Это не удаляет платёж. Он снова станет неоплаченным и вернётся в расчёты.
          </DialogDescription>
        </DialogHeader>
        {payment && (
          <>
            <DialogBody>
              <div className="mono" style={{ fontSize: 10, lineHeight: 1.5, color: "var(--ink-80)" }}>
                {cancelText}
              </div>
              {linkedCreditEvent && (
                <button
                  type="button"
                  onClick={() => setRollbackCreditEvent((value) => !value)}
                  className="tap-highlight"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "14px 1fr",
                    gap: 8,
                    alignItems: "start",
                    border: "none",
                    borderTop: "0.5px solid var(--hair)",
                    background: "transparent",
                    color: "var(--ink)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "9px 0 0",
                    textAlign: "left"
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      marginTop: 2,
                      border: "0.5px solid var(--ink)",
                      background: rollbackCreditEvent ? "var(--ink)" : "transparent"
                    }}
                  />
                  <span className="mono" style={{ fontSize: 9.5, lineHeight: 1.45, color: "var(--ink-80)" }}>
                    Откатить уменьшение долга тоже: {formatMoney(Math.abs(linkedCreditEvent.amount))} ₽.
                  </span>
                </button>
              )}
            </DialogBody>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderTop: "0.5px solid var(--ink)"
              }}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="tap-highlight"
                style={{
                  padding: "12px 10px",
                  border: "none",
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Не трогать
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm(payment, Boolean(linkedCreditEvent && rollbackCreditEvent));
                  onOpenChange(false);
                }}
                className="tap-highlight"
                style={{
                  padding: "12px 10px",
                  border: "none",
                  borderLeft: "0.5px solid var(--ink)",
                  background: "var(--ink)",
                  color: "var(--paper)",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Отменить оплату
                </span>
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogField({
  id,
  label,
  children
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

// ─── CycleSummary triad ──────────────────────────────────
interface CycleSummaryData {
  paidSoFar: number;
  remainingMandatory: number;
  discretionary: number;
}

type CycleInfoTopic = "paid" | "toPay" | "free";

function CycleSummary({
  d,
  onExplain
}: {
  d: CycleSummaryData;
  onExplain: (topic: CycleInfoTopic) => void;
}) {
  return (
    <div
      style={{
        margin: "4px var(--pad-x) 8px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        border: "0.5px solid var(--ink-80)"
      }}
    >
      <SummaryCell label="оплачено" value={d.paidSoFar} color="var(--ink-55)" onClick={() => onExplain("paid")} />
      <SummaryCell
        label="к оплате"
        value={d.remainingMandatory}
        color="var(--red)"
        divider
        onClick={() => onExplain("toPay")}
      />
      <SummaryCell label="свободные" value={d.discretionary} color="var(--blue)" divider onClick={() => onExplain("free")} />
    </div>
  );
}

function SummaryCell({
  label,
  value,
  color,
  divider,
  onClick
}: {
  label: string;
  value: number;
  color: string;
  divider?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tap-highlight"
      onClick={onClick}
      style={{
        border: "none",
        padding: "7px 9px",
        borderLeft: divider ? "0.5px solid var(--ink-80)" : "none",
        background: "transparent",
        color: "var(--ink)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left"
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
    </button>
  );
}

function CycleInfoDialog({
  topic,
  state,
  snapshot,
  summary,
  onOpenChange
}: {
  topic: CycleInfoTopic | null;
  state: FinanceState;
  snapshot: CalculationSnapshot;
  summary: CycleSummaryData;
  onOpenChange: (open: boolean) => void;
}) {
  if (!topic) return null;

  const plannedSavings = snapshot.plannedSavingsTransfersBeforeNextPaycheck;
  const data: Record<CycleInfoTopic, { title: string; description: string; lines: string[] }> = {
    paid: {
      title: "Оплачено",
      description: "Сумма обязательных платежей текущего цикла, которые уже отмечены как оплаченные.",
      lines: [
        `Оплачено в цикле: ${formatMoney(summary.paidSoFar)} ₽`,
        "Эти платежи уже списаны и не считаются будущими обязательствами."
      ]
    },
    toPay: {
      title: "К оплате",
      description: "Все неоплаченные обязательные платежи внутри текущего зарплатного цикла.",
      lines: [
        `К оплате в цикле: ${formatMoney(summary.remainingMandatory)} ₽`,
        `Платежи до зарплаты, которые режут лимит: ${formatMoney(snapshot.mandatoryPaymentsBeforeNextPaycheck)} ₽`,
        `Платежи в день зарплаты: ${formatMoney(snapshot.paydayMandatoryPaymentsTotal)} ₽`,
        "Платежи в день зарплаты видны отдельно и не уменьшают текущий лимит до дня зарплаты."
      ]
    },
    free: {
      title: summary.discretionary < 0 ? "Почему денег не хватает" : "Останется до зарплаты",
      description:
        summary.discretionary < 0
          ? "Это не долг. Это предупреждение: будущих обязательств больше, чем доступных денег."
          : "Сколько останется после ближайших платежей, плановых накоплений и подушки.",
      lines: [
        `Оперативный остаток: ${formatMoney(state.operationalBalance)} ₽`,
        `+ ожидаемые доходы до зарплаты: ${formatMoney(snapshot.incomeBeforeNextPaycheck)} ₽`,
        `− платежи до зарплаты: ${formatMoney(snapshot.mandatoryPaymentsBeforeNextPaycheck)} ₽`,
        `− подушка на сегодня: ${formatMoney(state.reserve.amount)} ₽`,
        plannedSavings > 0 ? `− плановые переводы в накопления: ${formatMoney(plannedSavings)} ₽` : "− плановые переводы в накопления: 0 ₽",
        `= останется до зарплаты: ${formatMoney(summary.discretionary)} ₽`,
        "Настройка «учитывать сегодня в делителе» меняет дневной лимит, а не эту сумму."
      ]
    }
  };
  const current = data[topic];

  return (
    <Dialog open={Boolean(topic)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mono" style={{ display: "grid", gap: 7, fontSize: 9.5, lineHeight: 1.45, color: "var(--ink-80)" }}>
            {current.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ─── PaymentsList ────────────────────────────────────────
interface ListPayment {
  id: string;
  date: string;
  name: string;
  amount: number;
  status: HiFiStatus;
  canPay: boolean;
  canEdit: boolean;
  canCancel: boolean;
}

function PaymentsList({
  d,
  onPayPayment,
  onEditPayment,
  onCancelPayment
}: {
  d: { payments: ListPayment[]; total: number };
  onPayPayment: (paymentId: string) => void;
  onEditPayment: (paymentId: string) => void;
  onCancelPayment: (paymentId: string) => void;
}) {
  const due = d.payments.filter((p) => p.status === "due");
  const payday = d.payments.filter((p) => p.status === "payday");
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

      <PaymentGroup
        status="due"
        payments={due}
        emptyText="нет платежей на сегодня и просроченных"
        onPayPayment={onPayPayment}
        onEditPayment={onEditPayment}
        onCancelPayment={onCancelPayment}
      />
      <PaymentGroup
        status="counted"
        payments={counted}
        emptyText="нет будущих платежей до зарплаты, уже вычтенных из лимита"
        onPayPayment={onPayPayment}
        onEditPayment={onEditPayment}
        onCancelPayment={onCancelPayment}
      />
      <PaymentGroup
        status="payday"
        payments={payday}
        emptyText="нет платежей прямо в день зарплаты"
        onPayPayment={onPayPayment}
        onEditPayment={onEditPayment}
        onCancelPayment={onCancelPayment}
      />
      <PaymentGroup
        status="paid"
        payments={paid}
        muted
        emptyText="пока нет оплаченных платежей"
        onPayPayment={onPayPayment}
        onEditPayment={onEditPayment}
        onCancelPayment={onCancelPayment}
      />
    </div>
  );
}

function PaymentGroup({
  status,
  payments,
  muted,
  emptyText,
  onPayPayment,
  onEditPayment,
  onCancelPayment
}: {
  status: HiFiStatus;
  payments: ListPayment[];
  muted?: boolean;
  emptyText: string;
  onPayPayment: (paymentId: string) => void;
  onEditPayment: (paymentId: string) => void;
  onCancelPayment: (paymentId: string) => void;
}) {
  const amount = payments.reduce((sum, p) => sum + p.amount, 0);
  const accent = STATUS_COLOR[status];
  return (
    <div
      style={{
        marginBottom: 8,
        borderTop:
          status === "paid"
            ? "1.5px solid var(--ink-35)"
            : `1px solid ${accent}`
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          padding: "5px 0 4px",
          borderBottom:
            status === "paid"
              ? "1px solid var(--ink-35)"
              : "none"
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <StatusGlyph shape={STATUS_SHAPE[status]} color={accent} size={13} />
          <span
            className="mono"
            style={{
              fontSize: 8.5,
              color: status === "paid" ? "var(--ink-80)" : accent,
              letterSpacing: "0.06em",
              textTransform: "uppercase"
            }}
          >
            {STATUS_LABEL[status]}
          </span>
          <span className="mono" style={{ fontSize: 7.6, color: "var(--ink-35)" }}>
            · {STATUS_HINT[status]}
          </span>
        </span>
        <span className="mono tnum" style={{ fontSize: 9, color: status === "paid" ? "var(--ink-80)" : accent }}>
          {payments.length} · {formatMoney(amount)} ₽
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {payments.length === 0 && (
          <div
            className="mono"
            style={{
              padding: "5px 0 6px",
              borderTop: "0.5px solid var(--hair)",
              fontSize: 9,
              color: "var(--ink-35)"
            }}
          >
            {emptyText}
          </div>
        )}
        {payments.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: "grid",
              gridTemplateColumns: "2px 44px 1fr auto",
              alignItems: "center",
              columnGap: 10,
              padding: "5px 0",
              borderTop:
                i === 0 && status === "paid"
                  ? "none"
                  : i === 0
                    ? "0.5px solid var(--ink-80)"
                    : "0.5px solid var(--hair)",
              background: STATUS_SOFT_BG[p.status],
              opacity: muted ? 0.6 : 1
            }}
          >
            <div style={{ width: 2, height: 14, background: STATUS_COLOR[p.status] }} />
            <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
              {p.date}
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <span
                className="slab"
                style={{
                  minWidth: 0,
                  fontSize: 11.5,
                  letterSpacing: "-0.01em",
                  textDecoration: muted ? "line-through" : "none",
                  textDecorationColor: "var(--ink-35)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {p.name}
              </span>
              {p.canPay && (
                <button
                  type="button"
                  onClick={() => onPayPayment(p.id)}
                  className="tap-highlight mono"
                  style={{
                    flexShrink: 0,
                    border: "none",
                    background: "transparent",
                    color: p.status === "due" ? "var(--red)" : p.status === "payday" ? "var(--ink)" : "var(--blue)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 8.5,
                    padding: "2px 0",
                    textDecoration: "underline",
                    textDecorationThickness: "0.5px",
                    textUnderlineOffset: 3
                  }}
                >
                  оплатить
                </button>
              )}
              {p.canEdit && (
                <button
                  type="button"
                  onClick={() => onEditPayment(p.id)}
                  className="tap-highlight mono"
                  style={{
                    flexShrink: 0,
                    border: "none",
                    background: "transparent",
                    color: "var(--ink-55)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 8.5,
                    padding: "2px 0",
                    textDecoration: "underline",
                    textDecorationThickness: "0.5px",
                    textUnderlineOffset: 3
                  }}
                >
                  изменить
                </button>
              )}
              {p.canCancel && (
                <button
                  type="button"
                  onClick={() => onCancelPayment(p.id)}
                  className="tap-highlight mono"
                  style={{
                    flexShrink: 0,
                    border: "none",
                    background: "transparent",
                    color: "var(--ink-55)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 8.5,
                    padding: "2px 0",
                    textDecoration: "underline",
                    textDecorationThickness: "0.5px",
                    textUnderlineOffset: 3
                  }}
                >
                  отменить оплату
                </button>
              )}
            </div>
            <span
              className="slab tnum"
              style={{
                fontSize: 12,
                color: p.status === "due" ? "var(--red)" : p.status === "payday" ? "var(--ink)" : "var(--ink)"
              }}
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

interface FuturePaymentOccurrence {
  id: string;
  paymentId: string;
  payment: MandatoryPayment;
  date: ISODate;
  title: string;
  amount: number;
  status: MandatoryPayment["status"];
  isPayday: boolean;
  isRecurringOccurrence: boolean;
}

function buildSixMonthSchedule(
  payments: MandatoryPayment[],
  today: ISODate,
  settings: FinanceState["settings"]
) {
  const horizon = addMonthsClamped(today, 6);
  const occurrences: FuturePaymentOccurrence[] = [];

  payments
    .filter((payment) => payment.status !== "paid")
    .forEach((payment) => {
      const baseDate = normalizeISODate(payment.dueDate);
      if (payment.recurrence === "once") {
        if (isAfterOrSame(baseDate, today) && isBeforeOrSame(baseDate, horizon)) {
          occurrences.push({
            id: `${payment.id}:${baseDate}`,
            paymentId: payment.id,
            payment,
            date: baseDate,
            title: payment.title,
            amount: payment.amount,
            status: payment.status,
            isPayday: Boolean(getPaycheckSlotForDate(baseDate, settings)),
            isRecurringOccurrence: false
          });
        }
        return;
      }

      let occurrenceDate = baseDate;
      const exceptions = new Set(payment.recurrenceExceptions ?? []);
      const recurrenceEndDate = payment.recurrenceEndDate ? normalizeISODate(payment.recurrenceEndDate) : undefined;
      let guard = 0;
      while (compareDates(occurrenceDate, today) < 0 && guard < 120) {
        occurrenceDate = addMonthsClamped(occurrenceDate, 1);
        guard += 1;
      }

      while (compareDates(occurrenceDate, horizon) <= 0 && guard < 140) {
        if (compareDates(occurrenceDate, horizon) > 0) break;
        if (!recurrenceEndDate || compareDates(occurrenceDate, recurrenceEndDate) <= 0) {
          if (!exceptions.has(occurrenceDate)) {
            occurrences.push({
              id: `${payment.id}:${occurrenceDate}`,
              paymentId: payment.id,
              payment,
              date: occurrenceDate,
              title: payment.title,
              amount: payment.amount,
              status: payment.status,
              isPayday: Boolean(getPaycheckSlotForDate(occurrenceDate, settings)),
              isRecurringOccurrence: true
            });
          }
        }
        occurrenceDate = addMonthsClamped(occurrenceDate, 1);
        guard += 1;
      }
    });

  return occurrences.sort((a, b) => {
    const byDate = compareDates(a.date, b.date);
    return byDate !== 0 ? byDate : a.title.localeCompare(b.title, "ru");
  });
}

function SixMonthPayments({
  occurrences,
  onEditOnce,
  onEditSeries,
  onEditOccurrence,
  onSkipOccurrence
}: {
  occurrences: FuturePaymentOccurrence[];
  onEditOnce: (payment: MandatoryPayment) => void;
  onEditSeries: (payment: MandatoryPayment) => void;
  onEditOccurrence: (occurrence: FuturePaymentOccurrence) => void;
  onSkipOccurrence: (occurrence: FuturePaymentOccurrence) => void;
}) {
  const monthGroups = occurrences.reduce<Array<{ key: string; label: string; items: FuturePaymentOccurrence[] }>>(
    (groups, occurrence) => {
      const key = monthKey(occurrence.date);
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.items.push(occurrence);
      } else {
        groups.push({ key, label: monthLabel(occurrence.date), items: [occurrence] });
      }
      return groups;
    },
    []
  );

  return (
    <div style={{ padding: "8px var(--pad-x) 10px", borderTop: "0.5px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <span className="eyebrow eyebrow--ink">Ближайшие платежи</span>
        <span className="mono tnum" style={{ fontSize: 9, color: "var(--ink-55)" }}>
          6 мес. · {occurrences.length} шт
        </span>
      </div>
      {monthGroups.length === 0 ? (
        <div className="mono" style={{ borderTop: "1px solid var(--ink)", padding: "7px 0", fontSize: 9, color: "var(--ink-35)" }}>
          запланированных платежей нет
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {monthGroups.map((group) => (
            <div key={group.key} style={{ borderTop: "1px solid var(--ink)" }}>
              <div className="mono" style={{ padding: "5px 0 4px", fontSize: 8.8, color: "var(--ink-55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {group.label}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr auto",
                    gap: 8,
                    alignItems: "baseline",
                    padding: "4px 0",
                    borderTop: "0.5px solid var(--hair)"
                  }}
                >
                  <span className="mono tnum" style={{ fontSize: 9, color: "var(--ink-55)" }}>
                    {fmtCycleDate(item.date)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="slab" style={{ fontSize: 10.5 }}>
                      {item.title}
                    </span>
                    <span className="mono" style={{ marginLeft: 6, fontSize: 8.5, color: item.isPayday ? "var(--ink)" : "var(--ink-55)" }}>
                      · {item.status === "missed" ? "просрочен" : "запланирован"}
                      {item.isPayday ? " · в день зарплаты" : ""}
                    </span>
                  </span>
                  <span className="slab tnum" style={{ fontSize: 10.5 }}>
                    {formatMoney(item.amount)} <span className="mono" style={{ fontSize: 8, color: "var(--ink-55)" }}>₽</span>
                  </span>
                  <div
                    className="mono"
                    style={{
                      gridColumn: "2 / 4",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 9,
                      fontSize: 8.5,
                      color: "var(--ink-55)"
                    }}
                  >
                    {item.isRecurringOccurrence ? (
                      <>
                        <button type="button" className="tap-highlight mono" onClick={() => onEditOccurrence(item)} style={inlinePaymentActionStyle()}>
                          изменить этот
                        </button>
                        <button type="button" className="tap-highlight mono" onClick={() => onSkipOccurrence(item)} style={inlinePaymentActionStyle("var(--red)")}>
                          пропустить этот
                        </button>
                        <button type="button" className="tap-highlight mono" onClick={() => onEditSeries(item.payment)} style={inlinePaymentActionStyle()}>
                          серия
                        </button>
                      </>
                    ) : (
                      <button type="button" className="tap-highlight mono" onClick={() => onEditOnce(item.payment)} style={inlinePaymentActionStyle()}>
                        изменить / удалить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function inlinePaymentActionStyle(color = "var(--ink-55)") {
  return {
    border: "none",
    background: "transparent",
    color,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 8.5,
    padding: 0,
    textDecoration: "underline",
    textDecorationThickness: "0.5px",
    textUnderlineOffset: 3
  };
}

// ─── Credits registry ───────────────────────────────────
type CreditDialogMode = "create" | "edit";

interface CreditDialogProps {
  open: boolean;
  mode: CreditDialogMode;
  credit?: Credit;
  nextOrder: number;
  onOpenChange: (open: boolean) => void;
  onSave: (credit: Omit<Credit, "id"> & { id?: string }) => void;
}

function CreditDialog({
  open,
  mode,
  credit,
  nextOrder,
  onOpenChange,
  onSave
}: CreditDialogProps) {
  const [title, setTitle] = useState("");
  const [openedAt, setOpenedAt] = useState<ISODate>(new Date().toISOString().slice(0, 10) as ISODate);
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(credit?.title ?? "");
    setOpenedAt(credit?.openedAt ?? new Date().toISOString().slice(0, 10));
    setOpeningBalance(credit ? String(credit.openingBalance) : "");
    setCreditLimit(credit?.creditLimit ? String(credit.creditLimit) : "");
    setNote(credit?.note ?? "");
  }, [credit, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const numericOpeningBalance = Math.max(0, numberFromInput(openingBalance));
    const numericCreditLimit = Math.max(0, numberFromInput(creditLimit));
    if (!cleanTitle) return;

    onSave({
      id: credit?.id,
      title: cleanTitle,
      openedAt,
      openingBalance: numericOpeningBalance,
      creditLimit: numericCreditLimit > 0 ? numericCreditLimit : undefined,
      note: note.trim() || undefined,
      isClosed: credit?.isClosed ?? false,
      order: credit?.order ?? nextOrder
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Изменить кредит" : "Новый кредит"}</DialogTitle>
          <DialogDescription>
            Это карточка долга. Покупка по кредитке увеличивает долг, платёж по кредиту уменьшает.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogField id="cycle-credit-title" label="Название">
              <Input
                id="cycle-credit-title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Например: кредитная карта"
                autoFocus
                required
              />
            </DialogField>
            <DialogField id="cycle-credit-opened-at" label="Дата открытия">
              <Input
                id="cycle-credit-opened-at"
                type="date"
                value={openedAt}
                onChange={(event) => setOpenedAt(event.currentTarget.value as ISODate)}
                required
              />
            </DialogField>
            <DialogField id="cycle-credit-opening-balance" label="Текущий долг на старте">
              <Input
                id="cycle-credit-opening-balance"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.currentTarget.value)}
                inputMode="decimal"
                placeholder="0"
                required
              />
            </DialogField>
            <DialogField id="cycle-credit-limit" label="Лимит карты">
              <Input
                id="cycle-credit-limit"
                value={creditLimit}
                onChange={(event) => setCreditLimit(event.currentTarget.value)}
                inputMode="decimal"
                placeholder="Необязательно"
              />
            </DialogField>
            <DialogField id="cycle-credit-note" label="Комментарий">
              <Input
                id="cycle-credit-note"
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                placeholder="Что важно помнить"
              />
            </DialogField>
            <div className="mono" style={{ fontSize: 9, lineHeight: 1.45, color: "var(--ink-55)" }}>
              Если по карте уже есть долг, внесите его здесь. Лимит нужен, чтобы видеть доступный остаток.
            </div>
          </DialogBody>
          <button
            type="submit"
            className="tap-highlight"
            style={{
              width: "100%",
              padding: "13px 14px",
              border: "none",
              borderTop: "0.5px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--paper)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span className="slab" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {mode === "edit" ? "Сохранить кредит" : "Добавить кредит"}
            </span>
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InsufficientPaymentDialog({
  payment,
  operationalBalance,
  credits,
  creditEvents,
  onOpenChange,
  onPayFromCredit
}: {
  payment: MandatoryPayment | null;
  operationalBalance: number;
  credits: Credit[];
  creditEvents: CreditEvent[];
  onOpenChange: (open: boolean) => void;
  onPayFromCredit: (payment: MandatoryPayment, creditId: string) => void;
}) {
  const activeCredits = useMemo(
    () =>
      credits
        .filter((credit) => !credit.isClosed && credit.id !== payment?.linkedCreditId)
        .slice()
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru")),
    [credits, payment?.linkedCreditId]
  );
  const [creditId, setCreditId] = useState("");

  useEffect(() => {
    if (payment) setCreditId(activeCredits[0]?.id ?? "");
  }, [activeCredits, payment]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payment || !creditId) return;
    onPayFromCredit(payment, creditId);
  }

  return (
    <Dialog open={Boolean(payment)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Недостаточно денег</DialogTitle>
          <DialogDescription>
            Платёж не проведён. Оперативный остаток не должен уходить в минус без явного выбора кредитной карты.
          </DialogDescription>
        </DialogHeader>
        {payment && (
          <form onSubmit={submit}>
            <DialogBody>
              <div className="mono" style={{ fontSize: 10, lineHeight: 1.5, color: "var(--ink-80)" }}>
                Нужно {formatMoney(payment.amount)} ₽, в оперативном остатке {formatMoney(operationalBalance)} ₽.
              </div>
              {activeCredits.length > 0 ? (
                <DialogField id="cycle-insufficient-credit" label="Списать с кредитной карты">
                  <select
                    id="cycle-insufficient-credit"
                    value={creditId}
                    onChange={(event) => setCreditId(event.currentTarget.value)}
                    required
                    style={{
                      width: "100%",
                      minHeight: 38,
                      border: "0.5px solid var(--ink-80)",
                      borderRadius: 0,
                      background: "var(--paper)",
                      color: "var(--ink)",
                      padding: "0 8px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11
                    }}
                  >
                    {activeCredits.map((credit) => (
                      <option key={credit.id} value={credit.id}>
                        {credit.title} · долг {formatMoney(calculateCreditBalance(credit, creditEvents))} ₽
                      </option>
                    ))}
                  </select>
                  <div className="mono" style={{ marginTop: 4, fontSize: 9, lineHeight: 1.45, color: "var(--ink-55)" }}>
                    Оперативный остаток не изменится. Долг по выбранной карте увеличится на сумму платежа.
                  </div>
                </DialogField>
              ) : (
                <div className="mono" style={{ fontSize: 9.5, lineHeight: 1.45, color: "var(--red)" }}>
                  Доступных кредитных карт нет. Добавьте кредит на вкладке «Цикл» или пополните оперативный остаток.
                  Если это платёж по кредиту, нельзя списать его с той же карты.
                </div>
              )}
            </DialogBody>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "0.5px solid var(--ink)" }}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="tap-highlight"
                style={{
                  padding: "12px 10px",
                  border: "none",
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Отмена
                </span>
              </button>
              <button
                type="submit"
                className="tap-highlight"
                disabled={activeCredits.length === 0}
                style={{
                  padding: "12px 10px",
                  border: "none",
                  borderLeft: "0.5px solid var(--ink)",
                  background: activeCredits.length === 0 ? "var(--ink-18)" : "var(--ink)",
                  color: activeCredits.length === 0 ? "var(--ink-55)" : "var(--paper)",
                  cursor: activeCredits.length === 0 ? "default" : "pointer",
                  fontFamily: "inherit"
                }}
              >
                <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Оплатить с карты
                </span>
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreditPaymentBridgeDialog({
  payment,
  credit,
  creditBalance,
  today,
  onOpenChange,
  onConfirm
}: {
  payment: MandatoryPayment | null;
  credit?: Credit;
  creditBalance: number;
  today: ISODate;
  onOpenChange: (open: boolean) => void;
  onConfirm: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const defaultAmount = payment && credit ? Math.min(payment.amount, creditBalance) : 0;

  useEffect(() => {
    if (payment && credit) setAmount(String(defaultAmount));
  }, [credit, defaultAmount, payment]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Math.min(Math.abs(numberFromInput(amount)), creditBalance);
    if (!payment || !credit || numericAmount <= 0) return;
    onConfirm(numericAmount);
    onOpenChange(false);
  }

  return (
    <Dialog open={Boolean(payment && credit)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Зачесть в кредит?</DialogTitle>
          <DialogDescription>
            Платёж уже отмечен как оплаченный. Можно отдельно уменьшить долг по связанному кредиту.
          </DialogDescription>
        </DialogHeader>
        {payment && credit && (
          <form onSubmit={handleSubmit}>
            <DialogBody>
              <div className="mono" style={{ fontSize: 10, lineHeight: 1.5, color: "var(--ink-80)" }}>
                {credit.title} · текущий долг {formatMoney(creditBalance)} ₽ · дата события {fmtCycleDate(today)}.
              </div>
              <DialogField id="cycle-credit-bridge-amount" label="Сумма зачёта">
                <Input
                  id="cycle-credit-bridge-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.currentTarget.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                />
              </DialogField>
              <div className="mono" style={{ fontSize: 9, lineHeight: 1.45, color: "var(--ink-55)" }}>
                По умолчанию: min(сумма платежа, текущий долг). Нельзя зачесть больше текущего долга.
              </div>
            </DialogBody>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderTop: "0.5px solid var(--ink)"
              }}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="tap-highlight"
                style={{
                  padding: "12px 10px",
                  border: "none",
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Не зачитывать
                </span>
              </button>
              <button
                type="submit"
                className="tap-highlight"
                style={{
                  padding: "12px 10px",
                  border: "none",
                  borderLeft: "0.5px solid var(--ink)",
                  background: "var(--ink)",
                  color: "var(--paper)",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                <span className="slab" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Зачесть
                </span>
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreditsSection({
  credits,
  creditEvents,
  onNewCredit,
  onEditCredit,
  onToggleClosed
}: {
  credits: Credit[];
  creditEvents: CreditEvent[];
  onNewCredit: () => void;
  onEditCredit: (credit: Credit) => void;
  onToggleClosed: (credit: Credit, isClosed: boolean) => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const sortedCredits = credits.slice().sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));
  const active = sortedCredits.filter((credit) => !credit.isClosed);
  const closed = sortedCredits.filter((credit) => credit.isClosed);
  const activeBalance = active.reduce((sum, credit) => sum + calculateCreditBalance(credit, creditEvents), 0);
  const activeLimit = active.reduce((sum, credit) => sum + (credit.creditLimit ?? 0), 0);
  const activeAvailableLimit = active.reduce((sum, credit) => {
    if (!credit.creditLimit) return sum;
    return sum + Math.max(0, credit.creditLimit - calculateCreditBalance(credit, creditEvents));
  }, 0);
  const activeLimitCards = active.filter((credit) => Boolean(credit.creditLimit)).length;

  return (
    <div style={{ padding: "8px var(--pad-x) 10px", borderTop: "0.5px solid var(--hair)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8
        }}
      >
        <div>
          <div className="eyebrow eyebrow--ink">Кредиты</div>
          <div className="mono" style={{ marginTop: 2, fontSize: 8.5, lineHeight: 1.35, color: "var(--ink-55)" }}>
            Реестр долгов. Покупки по кредитке увеличивают долг, платежи по кредиту уменьшают.
          </div>
        </div>
        <button
          type="button"
          onClick={onNewCredit}
          className="tap-highlight"
          style={{
            border: "0.5px solid var(--ink)",
            background: "transparent",
            color: "var(--ink)",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "7px 8px"
          }}
        >
          <span className="slab" style={{ fontSize: 8.5, letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Новый кредит
          </span>
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          alignItems: "baseline",
          borderTop: "1px solid var(--red)",
          paddingTop: 5,
          marginBottom: 6
        }}
      >
        <span className="mono" style={{ fontSize: 8.5, color: "var(--red)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          активные долги · {active.length}
        </span>
        <span className="slab tnum" style={{ fontSize: 12.5, color: "var(--red)" }}>
          {formatMoney(activeBalance)} ₽
        </span>
      </div>
      {activeLimitCards > 0 && (
        <div className="mono" style={{ marginTop: -2, marginBottom: 7, fontSize: 8.8, color: "var(--ink-55)", lineHeight: 1.4 }}>
          Доступный лимит: {formatMoney(activeAvailableLimit)} ₽ из {formatMoney(activeLimit)} ₽
          {activeLimitCards < active.length ? " · у части карт лимит не задан" : ""}
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {active.length === 0 && (
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-35)", padding: "4px 0" }}>
            активных кредитов нет
          </div>
        )}
        {active.map((credit) => (
          <CreditRow
            key={credit.id}
            credit={credit}
            events={creditEvents.filter((event) => event.creditId === credit.id)}
            onEdit={() => onEditCredit(credit)}
            onToggle={() => onToggleClosed(credit, true)}
          />
        ))}
      </div>

      {closed.length > 0 && (
        <div style={{ marginTop: 8, borderTop: "0.5px solid var(--hair)", paddingTop: 6 }}>
          <button
            type="button"
            onClick={() => setShowClosed((value) => !value)}
            className="tap-highlight mono"
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              border: "none",
              background: "transparent",
              color: "var(--ink-55)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 8.5,
              padding: 0,
              textTransform: "uppercase",
              letterSpacing: "0.06em"
            }}
          >
            <span>закрытые</span>
            <span>{closed.length} шт</span>
          </button>
          {showClosed && (
            <div style={{ display: "grid", gap: 5, marginTop: 6 }}>
              {closed.map((credit) => (
                <CreditRow
                  key={credit.id}
                  credit={credit}
                  events={creditEvents.filter((event) => event.creditId === credit.id)}
                  muted
                  onEdit={() => onEditCredit(credit)}
                  onToggle={() => onToggleClosed(credit, false)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreditRow({
  credit,
  events,
  muted,
  onEdit,
  onToggle
}: {
  credit: Credit;
  events: CreditEvent[];
  muted?: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const currentBalance = calculateCreditBalance(credit, events);
  const limit = credit.creditLimit && credit.creditLimit > 0 ? credit.creditLimit : undefined;
  const availableLimit = limit === undefined ? undefined : Math.max(0, limit - currentBalance);
  const usedRatio = limit === undefined ? 0 : Math.min(1, currentBalance / limit);
  const sortedEvents = events.slice().sort((a, b) => {
    const byDate = compareDates(b.date, a.date);
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
  });
  const lastEvent = sortedEvents[0];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2px 1fr auto",
        gap: 10,
        alignItems: "stretch",
        borderTop: "0.5px solid var(--hair)",
        padding: "7px 0",
        opacity: muted ? 0.55 : 1
      }}
    >
      <div style={{ width: 2, background: muted ? "var(--ink-35)" : "var(--red)" }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span
            className="slab"
            style={{
              minWidth: 0,
              fontSize: 11.5,
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {credit.title}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="tap-highlight mono"
            style={{
              flexShrink: 0,
              border: "none",
              background: "transparent",
              color: "var(--ink-55)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 8.5,
              padding: 0,
              textDecoration: "underline",
              textDecorationThickness: "0.5px",
              textUnderlineOffset: 3
            }}
          >
            изменить
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="tap-highlight mono"
            style={{
              flexShrink: 0,
              border: "none",
              background: "transparent",
              color: "var(--ink-55)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 8.5,
              padding: 0,
              textDecoration: "underline",
              textDecorationThickness: "0.5px",
              textUnderlineOffset: 3
            }}
          >
            {credit.isClosed ? "вернуть" : "закрыть"}
          </button>
        </div>
        <div
          className="mono"
          style={{
            marginTop: 3,
            fontSize: 8.5,
            color: "var(--ink-55)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          стартовый долг {formatMoney(credit.openingBalance)} ₽ · {fmtCycleDate(credit.openedAt)}
          {lastEvent ? ` · ${creditEventLabel(lastEvent.kind).toLowerCase()} ${formatMoney(Math.abs(lastEvent.amount))} ₽` : ""}
        </div>
        <div className="mono" style={{ marginTop: 3, fontSize: 8.5, color: "var(--ink-55)", lineHeight: 1.35 }}>
          {limit === undefined
            ? "лимит карты не задан"
            : `доступно ${formatMoney(availableLimit ?? 0)} ₽ из лимита ${formatMoney(limit)} ₽`}
        </div>
        {limit !== undefined && (
          <div
            aria-hidden
            style={{
              marginTop: 4,
              width: "100%",
              height: 3,
              background: "var(--ink-18)"
            }}
          >
            <div
              style={{
                width: `${Math.round(usedRatio * 100)}%`,
                height: "100%",
                background: usedRatio > 0.85 ? "var(--red)" : "var(--blue)"
              }}
            />
          </div>
        )}
        {!credit.isClosed && currentBalance <= 0 && (
          <div className="mono" style={{ marginTop: 3, fontSize: 8.5, color: "var(--red)" }}>
            Остаток 0. Кредит можно закрыть вручную.
          </div>
        )}
        {credit.note && (
          <div
            className="mono"
            style={{
              marginTop: 2,
              fontSize: 8.5,
              color: "var(--ink-55)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {credit.note}
          </div>
        )}
      </div>
      <span
        className="slab tnum"
        style={{ alignSelf: "center", fontSize: 12, color: muted ? "var(--ink-55)" : "var(--red)" }}
      >
        {formatMoney(currentBalance)}
        <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)" }}>
          {" "}
          ₽
        </span>
      </span>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────
export function CycleScreen({
  state,
  snapshot,
  onMarkPaymentPaid,
  onAddMandatoryPayment,
  onUpdateMandatoryPayment,
  onDeleteMandatoryPayment,
  onSkipMandatoryPaymentOccurrence,
  onCancelMandatoryPayment,
  onSaveCredit,
  onAddCreditEvent,
  onDeleteCreditEvent,
  onToggleCreditClosed,
  rubrics,
  goals
}: CycleScreenProps) {
  const [paymentDialog, setPaymentDialog] = useState<{
    mode: PaymentDialogMode;
    payment?: MandatoryPayment;
    draftPayment?: Partial<MandatoryPayment>;
    overrideSource?: { paymentId: string; date: ISODate };
  } | null>(null);
  const [cycleInfoTopic, setCycleInfoTopic] = useState<CycleInfoTopic | null>(null);
  const [cancelPayment, setCancelPayment] = useState<MandatoryPayment | null>(null);
  const [insufficientPayment, setInsufficientPayment] = useState<MandatoryPayment | null>(null);
  const [creditBridgePayment, setCreditBridgePayment] = useState<MandatoryPayment | null>(null);
  const [creditDialog, setCreditDialog] = useState<{
    mode: CreditDialogMode;
    credit?: Credit;
  } | null>(null);

  // ─── Cycle window / day index ─────────────────────────
  const cycleStart = snapshot.previousPaycheckDate;
  const cycleEnd = snapshot.nextPaycheckDate;
  const totalDays = Math.max(1, daysBetween(cycleStart, cycleEnd));
  const todayDayIdx = Math.max(0, daysBetween(cycleStart, snapshot.today));

  const headerData: CycleHeaderData = {
    cycleStartLabel: fmtCycleDate(cycleStart),
    cycleEndLabel: fmtCycleDate(cycleEnd),
    dayNo: Math.min(totalDays, todayDayIdx + 1),
    totalDays
  };

  // ─── Hero ─────────────────────────────────────────────
  const hero: AvailableHeroData = {
    available: Math.round(snapshot.availableUntilNextPaycheck),
    daysLeft: snapshot.rawRemainingDays,
    dailyLimit: Math.round(snapshot.safeToSpendToday)
  };

  // ─── All payments inside the current cycle window ────
  // Includes paid ones (we want them visible in the "Оплачены" group +
  // as paid notches on the axis). Sort by due date asc.
  const cyclePayments = state.mandatoryPayments
    .map((p) => ({ ...p, dueDate: normalizeISODate(p.dueDate) }))
    .filter((p) => isAfterOrSame(p.dueDate, cycleStart) && isBeforeOrSame(p.dueDate, cycleEnd))
    .sort((a, b) => compareDates(a.dueDate, b.dueDate))
    .map((p) => ({
      ...p,
      _hifiStatus: hifiStatus(p, snapshot.today, snapshot.nextPaycheckDate)
    }));

  // ─── Axis payments (id + dayIdx + hi-fi status) ──────
  const axisPayments: AxisPayment[] = cyclePayments.map((p) => ({
    id: p.id,
    dayIdx: Math.max(0, Math.min(totalDays, daysBetween(cycleStart, p.dueDate))),
    status: p._hifiStatus
  }));

  const axisData: FullCycleAxisData = {
    cycleStartDate: cycleStart,
    cycleEndDate: cycleEnd,
    totalDays,
    todayDayIdx,
    cycleStartLabel: fmtCycleDate(cycleStart),
    cycleEndLabel: fmtCycleDate(cycleEnd),
    todayLabel: fmtTodayAxisLabel(snapshot.today),
    payments: axisPayments
  };

  // ─── Next payment callout ────────────────────────────
  // Pick the first non-paid payment date in the live cycle window. This
  // includes missed/overdue payments, unlike upcoming-only lists, and keeps
  // same-day payments together.
  const nextRaw = cyclePayments.find((p) => p.status !== "paid");
  const nextPayments = nextRaw
    ? cyclePayments.filter((payment) => payment.status !== "paid" && isSameDate(payment.dueDate, nextRaw.dueDate))
    : [];
  const nextStatus = nextRaw ? hifiStatus(nextRaw, snapshot.today, snapshot.nextPaycheckDate) : null;
  const nextAmount = nextPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const nextDetail = nextPayments.length > 1
    ? nextPayments
        .slice(0, 2)
        .map((payment) => payment.title)
        .join(", ") + (nextPayments.length > 2 ? "…" : "")
    : undefined;
  const nextCallout: NextPaymentCalloutData =
    nextRaw && nextStatus
      ? {
          name: nextPayments.length > 1 ? `${nextPayments.length} ${paymentWord(nextPayments.length)}` : nextRaw.title,
          detail: nextDetail,
          dateLabel: fmtCycleDate(nextRaw.dueDate),
          whenLabel: relativeDayLabel(nextRaw.dueDate, snapshot.today),
          amount: nextAmount,
          status: nextStatus
        }
      : {
          name: "до зарплаты обязательных платежей нет",
          status: "paid",
          empty: true
        };

  // ─── Summary triad ───────────────────────────────────
  const totalMandatory = cyclePayments.reduce((s, p) => s + p.amount, 0);
  const paidSoFar = cyclePayments
    .filter((p) => p._hifiStatus === "paid")
    .reduce((s, p) => s + p.amount, 0);
  const remainingMandatory = cyclePayments
    .filter((p) => p._hifiStatus !== "paid")
    .reduce((s, p) => s + p.amount, 0);
  const discretionary = Math.round(snapshot.availableUntilNextPaycheck);

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
    status: p._hifiStatus,
    canPay: p.status === "scheduled" || p.status === "missed",
    canEdit: p.status === "scheduled" || p.status === "missed",
    canCancel: p.status === "paid"
  }));

  // ─── CTA — "Отметить оплату" ──────────────────────────
  // Marks the next non-paid payment as paid through the existing handler.
  // If no candidate exists, primary CTA is disabled. "Новый платёж" opens
  // a local mandatory-payment dialog and saves through the existing shell
  // handler, so snapshot recalculates through the normal app state path.
  const markPaymentTarget = nextRaw ?? null;
  const nextCreditOrder = Math.max(0, ...state.credits.map((credit) => credit.order)) + 10;
  const cancelLinkedCreditEvent = cancelPayment
    ? state.creditEvents.find(
        (event) =>
          event.kind === "payment" &&
          event.linkedMandatoryPaymentId === cancelPayment.id
      )
    : undefined;
  const bridgeCredit = creditBridgePayment?.linkedCreditId
    ? state.credits.find((credit) => credit.id === creditBridgePayment.linkedCreditId && !credit.isClosed)
    : undefined;
  const bridgeCreditBalance = bridgeCredit
    ? calculateCreditBalance(
        bridgeCredit,
        state.creditEvents.filter((event) => event.creditId === bridgeCredit.id)
      )
    : 0;
  const sixMonthSchedule = buildSixMonthSchedule(state.mandatoryPayments, snapshot.today, state.settings);

  function markMandatoryPaymentPaid(
    payment: MandatoryPayment,
    options: { paymentSource?: ExpensePaymentSource; creditId?: string } = {}
  ) {
    const payFromCredit = options.paymentSource === "credit" && Boolean(options.creditId);
    if (!payFromCredit && state.operationalBalance < payment.amount) {
      setInsufficientPayment(payment);
      return;
    }

    onMarkPaymentPaid(payment, options);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100dvh - env(safe-area-inset-bottom) - var(--tabbar-base))",
        background: "var(--paper)"
      }}
    >
      <CycleHeader d={headerData} />
      <AvailableHero d={hero} />
      <FullCycleAxis d={axisData} />
      <NextPaymentCallout d={nextCallout} />
      <CycleSummary d={summary} onExplain={setCycleInfoTopic} />
      <PaymentsList
        d={{
          payments: listPayments,
          total: totalMandatory
        }}
        onPayPayment={(paymentId) => {
          const payment = state.mandatoryPayments.find((item) => item.id === paymentId);
          if (!payment || payment.status === "paid") return;
          markMandatoryPaymentPaid(payment);
        }}
        onEditPayment={(paymentId) => {
          const payment = state.mandatoryPayments.find((item) => item.id === paymentId);
          if (!payment || payment.status === "paid") return;
          setPaymentDialog({ mode: "edit", payment });
        }}
        onCancelPayment={(paymentId) => {
          const payment = state.mandatoryPayments.find((item) => item.id === paymentId);
          if (!payment || payment.status !== "paid") return;
          setCancelPayment(payment);
        }}
      />
      <CreditsSection
        credits={state.credits}
        creditEvents={state.creditEvents}
        onNewCredit={() => setCreditDialog({ mode: "create" })}
        onEditCredit={(credit) => setCreditDialog({ mode: "edit", credit })}
        onToggleClosed={(credit, isClosed) => onToggleCreditClosed(credit.id, isClosed)}
      />
      <SixMonthPayments
        occurrences={sixMonthSchedule}
        onEditOnce={(payment) => setPaymentDialog({ mode: "edit", payment })}
        onEditSeries={(payment) => setPaymentDialog({ mode: "edit", payment })}
        onEditOccurrence={(occurrence) =>
          setPaymentDialog({
            mode: "create",
            draftPayment: {
              title: occurrence.payment.title,
              amount: occurrence.payment.amount,
              dueDate: occurrence.date,
              recurrence: "once",
              categoryId: occurrence.payment.categoryId,
              linkedCreditId: occurrence.payment.linkedCreditId,
              linkedGoalId: occurrence.payment.linkedGoalId,
              sourceRecurringPaymentId: occurrence.payment.id,
              sourceRecurringDate: occurrence.date
            },
            overrideSource: {
              paymentId: occurrence.payment.id,
              date: occurrence.date
            }
          })
        }
        onSkipOccurrence={(occurrence) => {
          const confirmed = window.confirm(`Пропустить платёж «${occurrence.title}» ${fmtCycleDate(occurrence.date)}?`);
          if (confirmed) onSkipMandatoryPaymentOccurrence(occurrence.payment.id, occurrence.date);
        }}
      />

      <div style={{ flex: 1, minHeight: 6 }} />

      <div
        style={{
          position: "sticky",
          bottom: "calc(env(safe-area-inset-bottom) + var(--tabbar-base))",
          zIndex: 5,
          background: "var(--paper)"
        }}
      >
        <CTARow
          primary={{
            label: "Отметить оплату",
            shape: "triangle",
            onClick: () => {
              if (!markPaymentTarget) return;
              markMandatoryPaymentPaid(markPaymentTarget);
            },
            disabled: !markPaymentTarget
          }}
          secondary={{
            label: "Новый платёж",
            shape: "square",
            onClick: () => setPaymentDialog({ mode: "create" }),
            tone: "ink"
          }}
        />
      </div>
      <MandatoryPaymentDialog
        open={Boolean(paymentDialog)}
        mode={paymentDialog?.mode ?? "create"}
        payment={paymentDialog?.payment}
        draftPayment={paymentDialog?.draftPayment}
        defaultDate={snapshot.today}
        rubrics={rubrics}
        goals={goals}
        credits={state.credits}
        creditEvents={state.creditEvents}
        onOpenChange={(open) => {
          if (!open) setPaymentDialog(null);
        }}
        onSave={(payment) => {
          if (paymentDialog?.mode === "edit" && paymentDialog.payment) {
            onUpdateMandatoryPayment(paymentDialog.payment.id, payment);
          } else if (paymentDialog?.overrideSource) {
            onSkipMandatoryPaymentOccurrence(paymentDialog.overrideSource.paymentId, paymentDialog.overrideSource.date);
            onAddMandatoryPayment(payment);
          } else {
            onAddMandatoryPayment(payment);
          }
        }}
        onDelete={(payment) => onDeleteMandatoryPayment(payment.id)}
      />
      <CancelPaymentDialog
        payment={cancelPayment}
        today={snapshot.today}
        linkedCreditEvent={cancelLinkedCreditEvent}
        onOpenChange={(open) => {
          if (!open) setCancelPayment(null);
        }}
        onConfirm={(payment, rollbackCreditEvent) => {
          onCancelMandatoryPayment(payment);
          if (rollbackCreditEvent && cancelLinkedCreditEvent) {
            onDeleteCreditEvent(cancelLinkedCreditEvent.id);
          }
        }}
      />
      <CreditDialog
        open={Boolean(creditDialog)}
        mode={creditDialog?.mode ?? "create"}
        credit={creditDialog?.credit}
        nextOrder={nextCreditOrder}
        onOpenChange={(open) => {
          if (!open) setCreditDialog(null);
        }}
        onSave={onSaveCredit}
      />
      <InsufficientPaymentDialog
        payment={insufficientPayment}
        operationalBalance={state.operationalBalance}
        credits={state.credits}
        creditEvents={state.creditEvents}
        onOpenChange={(open) => {
          if (!open) setInsufficientPayment(null);
        }}
        onPayFromCredit={(payment, creditId) => {
          markMandatoryPaymentPaid(payment, { paymentSource: "credit", creditId });
          setInsufficientPayment(null);
        }}
      />
      <CreditPaymentBridgeDialog
        payment={creditBridgePayment}
        credit={bridgeCredit}
        creditBalance={bridgeCreditBalance}
        today={snapshot.today}
        onOpenChange={(open) => {
          if (!open) setCreditBridgePayment(null);
        }}
        onConfirm={(amount) => {
          if (!creditBridgePayment || !bridgeCredit) return;
          onAddCreditEvent({
            creditId: bridgeCredit.id,
            date: snapshot.today,
            kind: "payment",
            amount,
            note: `Зачёт обязательного платежа: ${creditBridgePayment.title}`,
            linkedMandatoryPaymentId: creditBridgePayment.id
          });
        }}
      />
      <CycleInfoDialog
        topic={cycleInfoTopic}
        state={state}
        snapshot={snapshot}
        summary={summary}
        onOpenChange={(open) => {
          if (!open) setCycleInfoTopic(null);
        }}
      />
    </div>
  );
}
