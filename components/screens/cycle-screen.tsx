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
  isAfterOrSame,
  isBeforeOrSame,
  parseISODate
} from "@/lib/dates";
import type {
  CalculationSnapshot,
  Credit,
  CreditEvent,
  CreditEventKind,
  FinanceState,
  ISODate,
  MandatoryPayment,
  MandatoryPaymentRecurrence,
  Rubric
} from "@/lib/types";
import { formatMoney, numberFromInput } from "@/lib/utils";

interface CycleScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onMarkPaymentPaid: (payment: MandatoryPayment) => void;
  onAddMandatoryPayment: (payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onUpdateMandatoryPayment: (paymentId: string, payment: Omit<MandatoryPayment, "id" | "status">) => void;
  onDeleteMandatoryPayment: (paymentId: string) => void;
  onCancelMandatoryPayment: (payment: MandatoryPayment) => void;
  onSaveCredit: (credit: Omit<Credit, "id"> & { id?: string }) => void;
  onAddCreditEvent: (event: Omit<CreditEvent, "id">) => void;
  onDeleteCreditEvent: (eventId: string) => void;
  onToggleCreditClosed: (creditId: string, isClosed: boolean) => void;
  rubrics: Rubric[];
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

const STATUS_SOFT_BG: Record<HiFiStatus, string> = {
  paid: "transparent",
  due: "rgba(214, 48, 49, 0.08)",
  counted: "rgba(7, 73, 169, 0.08)"
};

const STATUS_LABEL: Record<HiFiStatus, string> = {
  paid: "Оплачены",
  due: "К оплате",
  counted: "Учтены в лимите"
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
          gridTemplateColumns: "repeat(3, auto)",
          justifyContent: "start",
          alignItems: "center",
          columnGap: 14,
          marginTop: -6
        }}
      >
        <LegendItem label="оплачен" color={STATUS_COLOR.paid} shape="bar" />
        <LegendItem label="к оплате" color={STATUS_COLOR.due} shape="tri" />
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
  shape: "bar" | "tri" | "dot";
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" style={{ display: "block" }}>
        {shape === "bar" && <line x1="3" y1="6" x2="9" y2="6" stroke={color} strokeWidth="1.5" />}
        {shape === "tri" && <polygon points="3,8 9,8 6,3.5" fill={color} />}
        {shape === "dot" && <circle cx="6" cy="6" r="2.7" fill="none" stroke={color} strokeWidth="1.5" />}
      </svg>
      <span className="mono" style={{ fontSize: 7.8, color: "var(--ink-55)", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </span>
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
  defaultDate: ISODate;
  rubrics: Rubric[];
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
  defaultDate,
  rubrics,
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

  useEffect(() => {
    if (!open) return;
    setTitle(payment?.title ?? "");
    setAmount(payment ? String(payment.amount) : "");
    setDueDate(payment?.dueDate ?? defaultDate);
    setRecurrence(payment?.recurrence ?? "monthly");
    setDeleteConfirm(false);
    setCategoryId(
      payment?.categoryId && rubricOptions.some((rubric) => rubric.id === payment.categoryId)
        ? payment.categoryId
        : rubricOptions[0]?.id
    );
    setLinkedCreditId(payment?.linkedCreditId ?? "");
  }, [defaultDate, open, payment, rubricOptions]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const numericAmount = numberFromInput(amount);
    if (!cleanTitle || numericAmount <= 0 || !dueDate) return;

    onSave({
      title: cleanTitle,
      amount: numericAmount,
      dueDate,
      recurrence,
      categoryId,
      linkedCreditId: linkedCreditId || undefined
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
                onChange={(event) => setLinkedCreditId(event.currentTarget.value)}
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
            <DialogField id="cycle-payment-recurrence" label="Тип">
              <PaymentTypeControl value={recurrence} onChange={setRecurrence} />
            </DialogField>
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
                      Удалить этот неоплаченный платёж? Он исчезнет из расчёта и списка. Деньги не изменятся.
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
                Сумма {formatMoney(payment.amount)} ₽ вернётся в оперативный остаток, а платёж станет {nextStatus}.
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
        label="к оплате"
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
        emptyText="нет срочных платежей"
        onPayPayment={onPayPayment}
        onEditPayment={onEditPayment}
        onCancelPayment={onCancelPayment}
      />
      <PaymentGroup
        status="counted"
        payments={counted}
        emptyText="нет будущих платежей"
        onPayPayment={onPayPayment}
        onEditPayment={onEditPayment}
        onCancelPayment={onCancelPayment}
      />
      <PaymentGroup
        status="paid"
        payments={paid}
        muted
        emptyText="пока нет оплаченных"
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
          <span style={{ width: 7, height: 7, border: `1px solid ${accent}`, background: STATUS_SOFT_BG[status] }} />
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
                    color: p.status === "due" ? "var(--red)" : "var(--blue)",
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
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(credit?.title ?? "");
    setOpenedAt(credit?.openedAt ?? new Date().toISOString().slice(0, 10));
    setOpeningBalance(credit ? String(credit.openingBalance) : "");
    setNote(credit?.note ?? "");
  }, [credit, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const numericOpeningBalance = Math.max(0, numberFromInput(openingBalance));
    if (!cleanTitle) return;

    onSave({
      id: credit?.id,
      title: cleanTitle,
      openedAt,
      openingBalance: numericOpeningBalance,
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
            Это карточка обязательства. Текущий остаток считается от стартового долга и движений.
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
            <DialogField id="cycle-credit-opening-balance" label="Стартовый остаток">
              <Input
                id="cycle-credit-opening-balance"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.currentTarget.value)}
                inputMode="decimal"
                placeholder="0"
                required
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
              Последующие изменения долга добавляются отдельными движениями. Общую денежную историю это не меняет.
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

function CreditEventDialog({
  credit,
  open,
  onOpenChange,
  onSave
}: {
  credit: Credit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: Omit<CreditEvent, "id">) => void;
}) {
  const [kind, setKind] = useState<CreditEventKind>("payment");
  const [date, setDate] = useState<ISODate>(new Date().toISOString().slice(0, 10) as ISODate);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind("payment");
    setDate(new Date().toISOString().slice(0, 10) as ISODate);
    setAmount("");
    setNote("");
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credit) return;
    const numericAmount = kind === "adjustment"
      ? numberFromInput(amount)
      : Math.abs(numberFromInput(amount));
    if (numericAmount === 0 || !date) return;

    onSave({
      creditId: credit.id,
      date,
      kind,
      amount: numericAmount,
      note: note.trim() || undefined
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Движение по кредиту</DialogTitle>
          <DialogDescription>
            Это меняет только остаток долга. Денежная история приложения не меняется.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogField id="cycle-credit-event-kind" label="Тип движения">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  border: "0.5px solid var(--ink-80)"
                }}
              >
                {(["charge", "payment", "adjustment"] as CreditEventKind[]).map((option, index) => {
                  const selected = option === kind;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setKind(option)}
                      className="tap-highlight"
                      style={{
                        minWidth: 0,
                        padding: "7px 4px",
                        border: "none",
                        borderLeft: index === 0 ? "none" : "0.5px solid var(--ink-80)",
                        background: selected ? "var(--ink)" : "transparent",
                        color: selected ? "var(--paper)" : "var(--ink-55)",
                        cursor: "pointer",
                        fontFamily: "inherit"
                      }}
                    >
                      <span className="slab" style={{ fontSize: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        {creditEventLabel(option)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </DialogField>
            <DialogField id="cycle-credit-event-date" label="Дата">
              <Input
                id="cycle-credit-event-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.currentTarget.value as ISODate)}
                required
              />
            </DialogField>
            <DialogField id="cycle-credit-event-amount" label="Сумма">
              <Input
                id="cycle-credit-event-amount"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                inputMode="decimal"
                placeholder={kind === "adjustment" ? "например -500 или 500" : "0"}
                required
              />
            </DialogField>
            <DialogField id="cycle-credit-event-note" label="Комментарий">
              <Input
                id="cycle-credit-event-note"
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                placeholder="Что изменилось"
              />
            </DialogField>
            <div className="mono" style={{ fontSize: 9, lineHeight: 1.45, color: "var(--ink-55)" }}>
              Увеличение и платёж всегда вводятся положительной суммой. Корректировка может быть со знаком.
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
              Добавить движение
            </span>
          </button>
        </form>
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
            Платёж уже отмечен как оплаченный. Можно отдельно уменьшить остаток долга.
          </DialogDescription>
        </DialogHeader>
        {payment && credit && (
          <form onSubmit={handleSubmit}>
            <DialogBody>
              <div className="mono" style={{ fontSize: 10, lineHeight: 1.5, color: "var(--ink-80)" }}>
                {credit.title} · текущий остаток {formatMoney(creditBalance)} ₽ · дата события {fmtCycleDate(today)}.
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
                По умолчанию: min(сумма платежа, остаток кредита). Нельзя зачесть больше текущего остатка.
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
  onNewEvent,
  onToggleClosed
}: {
  credits: Credit[];
  creditEvents: CreditEvent[];
  onNewCredit: () => void;
  onEditCredit: (credit: Credit) => void;
  onNewEvent: (credit: Credit) => void;
  onToggleClosed: (credit: Credit, isClosed: boolean) => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const sortedCredits = credits.slice().sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));
  const active = sortedCredits.filter((credit) => !credit.isClosed);
  const closed = sortedCredits.filter((credit) => credit.isClosed);
  const activeBalance = active.reduce((sum, credit) => sum + calculateCreditBalance(credit, creditEvents), 0);

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
            Реестр обязательств. Платежи по ним ведутся отдельно.
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
          активные · {active.length}
        </span>
        <span className="slab tnum" style={{ fontSize: 12.5, color: "var(--red)" }}>
          {formatMoney(activeBalance)} ₽
        </span>
      </div>

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
            onNewEvent={() => onNewEvent(credit)}
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
                  onNewEvent={() => onNewEvent(credit)}
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
  onNewEvent,
  onToggle
}: {
  credit: Credit;
  events: CreditEvent[];
  muted?: boolean;
  onEdit: () => void;
  onNewEvent: () => void;
  onToggle: () => void;
}) {
  const currentBalance = calculateCreditBalance(credit, events);
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
          {!credit.isClosed && (
            <button
              type="button"
              onClick={onNewEvent}
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
              движение
            </button>
          )}
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
        <CreditMiniTrend credit={credit} events={events} />
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
          старт {formatMoney(credit.openingBalance)} ₽ · {fmtCycleDate(credit.openedAt)}
          {lastEvent ? ` · ${creditEventLabel(lastEvent.kind).toLowerCase()} ${formatMoney(Math.abs(lastEvent.amount))} ₽` : ""}
        </div>
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

function CreditMiniTrend({ credit, events }: { credit: Credit; events: CreditEvent[] }) {
  const points = useMemo(() => {
    const sorted = events.slice().sort((a, b) => compareDates(a.date, b.date) || a.id.localeCompare(b.id));
    let balance = credit.openingBalance;
    return [
      { date: credit.openedAt, balance },
      ...sorted.map((event) => {
        balance = Math.max(0, balance + creditEventEffect(event));
        return { date: event.date, balance };
      })
    ];
  }, [credit.openedAt, credit.openingBalance, events]);

  const W = 92;
  const H = 18;
  if (points.length < 2) {
    return (
      <div style={{ marginTop: 4, width: W, height: H, borderBottom: "0.5px solid var(--hair)" }} />
    );
  }

  const min = Math.min(...points.map((point) => point.balance));
  const max = Math.max(...points.map((point) => point.balance));
  const span = Math.max(1, max - min);
  const coords = points.map((point, index) => ({
    x: (index / Math.max(1, points.length - 1)) * W,
    y: H - 2 - ((point.balance - min) / span) * (H - 5)
  }));
  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const balanceDelta = points[points.length - 1].balance - points[0].balance;
  const trendColor =
    Math.abs(balanceDelta) < 1
      ? "var(--ink-55)"
      : balanceDelta < 0
        ? "var(--blue)"
        : "var(--red)";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label="Тренд остатка кредита" style={{ display: "block", marginTop: 4 }}>
      <line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke="var(--hair)" strokeWidth="0.5" />
      <path d={path} fill="none" stroke={trendColor} strokeWidth="1.2" />
      <circle cx={last.x} cy={last.y} r="1.6" fill={trendColor} />
    </svg>
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
  onCancelMandatoryPayment,
  onSaveCredit,
  onAddCreditEvent,
  onDeleteCreditEvent,
  onToggleCreditClosed,
  rubrics
}: CycleScreenProps) {
  const [paymentDialog, setPaymentDialog] = useState<{
    mode: PaymentDialogMode;
    payment?: MandatoryPayment;
  } | null>(null);
  const [cancelPayment, setCancelPayment] = useState<MandatoryPayment | null>(null);
  const [creditDialog, setCreditDialog] = useState<{
    mode: CreditDialogMode;
    credit?: Credit;
  } | null>(null);
  const [creditEventCredit, setCreditEventCredit] = useState<Credit | null>(null);
  const [bridgePayment, setBridgePayment] = useState<MandatoryPayment | null>(null);

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
  // Pick the first non-paid payment in the live cycle window. This includes
  // missed/overdue payments, unlike upcoming-only lists.
  const nextRaw = cyclePayments.find((p) => p.status !== "paid");
  const nextStatus = nextRaw ? hifiStatus(nextRaw, snapshot.today) : null;
  const nextCallout: NextPaymentCalloutData =
    nextRaw && nextStatus
      ? {
          name: nextRaw.title,
          dateLabel: fmtCycleDate(nextRaw.dueDate),
          whenLabel: relativeDayLabel(nextRaw.dueDate, snapshot.today),
          amount: nextRaw.amount,
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
  const bridgeCredit =
    bridgePayment?.linkedCreditId
      ? state.credits.find((credit) => credit.id === bridgePayment.linkedCreditId)
      : undefined;
  const bridgeCreditBalance = bridgeCredit
    ? calculateCreditBalance(bridgeCredit, state.creditEvents)
    : 0;
  const cancelLinkedCreditEvent = cancelPayment
    ? state.creditEvents.find(
        (event) =>
          event.kind === "payment" &&
          event.linkedMandatoryPaymentId === cancelPayment.id
      )
    : undefined;

  function markMandatoryPaymentPaid(payment: MandatoryPayment) {
    onMarkPaymentPaid(payment);

    const credit = payment.linkedCreditId
      ? state.credits.find((item) => item.id === payment.linkedCreditId)
      : undefined;
    const alreadyLinked = state.creditEvents.some(
      (event) =>
        event.kind === "payment" &&
        event.linkedMandatoryPaymentId === payment.id
    );
    const balance = credit ? calculateCreditBalance(credit, state.creditEvents) : 0;
    if (credit && balance > 0 && !alreadyLinked) setBridgePayment(payment);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100dvh - env(safe-area-inset-bottom) - 52px)",
        background: "var(--paper)"
      }}
    >
      <CycleHeader d={headerData} />
      <AvailableHero d={hero} />
      <FullCycleAxis d={axisData} />
      <NextPaymentCallout d={nextCallout} />
      <CycleSummary d={summary} />
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
        onNewEvent={setCreditEventCredit}
        onToggleClosed={(credit, isClosed) => onToggleCreditClosed(credit.id, isClosed)}
      />

      <div style={{ flex: 1, minHeight: 6 }} />

      <div
        style={{
          position: "sticky",
          bottom: "calc(env(safe-area-inset-bottom) + 52px)",
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
        defaultDate={snapshot.today}
        rubrics={rubrics}
        credits={state.credits}
        creditEvents={state.creditEvents}
        onOpenChange={(open) => {
          if (!open) setPaymentDialog(null);
        }}
        onSave={(payment) => {
          if (paymentDialog?.mode === "edit" && paymentDialog.payment) {
            onUpdateMandatoryPayment(paymentDialog.payment.id, payment);
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
      <CreditEventDialog
        credit={creditEventCredit}
        open={Boolean(creditEventCredit)}
        onOpenChange={(open) => {
          if (!open) setCreditEventCredit(null);
        }}
        onSave={onAddCreditEvent}
      />
      <CreditPaymentBridgeDialog
        payment={bridgePayment}
        credit={bridgeCredit}
        creditBalance={bridgeCreditBalance}
        today={snapshot.today}
        onOpenChange={(open) => {
          if (!open) setBridgePayment(null);
        }}
        onConfirm={(amount) => {
          if (!bridgePayment?.linkedCreditId) return;
          const alreadyLinked = state.creditEvents.some(
            (event) =>
              event.kind === "payment" &&
              event.linkedMandatoryPaymentId === bridgePayment.id
          );
          if (alreadyLinked) return;
          onAddCreditEvent({
            creditId: bridgePayment.linkedCreditId,
            date: snapshot.today,
            kind: "payment",
            amount: Math.min(amount, bridgeCreditBalance),
            note: `Зачтено из платежа: ${bridgePayment.title}`,
            linkedMandatoryPaymentId: bridgePayment.id
          });
        }}
      />
    </div>
  );
}
