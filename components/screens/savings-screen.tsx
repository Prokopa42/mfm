"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { Progress } from "@/components/ui/progress";
import { addDays, compareDates, daysBetween, parseISODate, toISODate } from "@/lib/dates";
import type {
  CalculationSnapshot,
  CushionSnapshot,
  FinanceState,
  GoalStatus,
  ISODate,
  SavingsGoal,
  SavingsGoalSnapshot
} from "@/lib/types";
import { formatMoney, numberFromInput } from "@/lib/utils";

interface SavingsScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  onAllocate: (payload: SavingsAllocationPayload) => void;
  onSaveGoal?: (goal: Omit<SavingsGoal, "id"> & { id?: string }) => void;
  onDeleteGoal?: (goalId: string) => void;
}

export type SavingsBucketId = "unallocated" | "cushion" | `goal:${string}`;

export interface SavingsAllocationPayload {
  sourceId: SavingsBucketId;
  targetId: SavingsBucketId;
  amount: number;
}

/* ─────────────────────────────────────────────────────────────
   Hi-fi 03/05 — Savings screen.
   Direct port of design/final/МФМ/hifi-savings.jsx onto the v2
   pot-model snapshot from step 8.

   Canonical model — first full UI implementation:
     - savings.balance        = общий котёл (totalSavings)
     - savings.cushion        = system reserve INSIDE the pot, NOT a goal
     - goals[*]               = envelopes inside the pot
     - cushion.allocated + Σ goals.allocated + unallocated = totalSavings

   Honest data:
     - PotTrajectory renders from explicit point series. If the real ledger
       has enough transfer/withdrawal points, it uses those; otherwise it
       falls back to a named demo point pattern for visual QA. The chart
       never draws a decorative line without input points.
     - Goals with status="unconfigured" render in NEUTRAL styling — no
       red/yellow alarm, no off-track marker. Only "behind" is alarming.
     - "Распределить" CTA secondary is DISABLED (no allocation flow yet —
       lands in step 11). Showing a non-functional button would lie.
   ───────────────────────────────────────────────────────────── */

// ─── ru locale helpers ──────────────────────────────────
const RU_MONTH_SHORT = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек"
];

const DEMO_POT_HISTORY_PATTERN = [
  { progress: 0, ratio: 0 },
  { progress: 0.14, ratio: 0.08 },
  { progress: 0.3, ratio: 0.22 },
  { progress: 0.48, ratio: 0.4 },
  { progress: 0.66, ratio: 0.58 },
  { progress: 0.84, ratio: 0.79 },
  { progress: 1, ratio: 1 }
] as const;

function fmtDate(iso: string) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${RU_MONTH_SHORT[d.getMonth()]}`;
}

// ─── Status palette ────────────────────────────────────
const GOAL_STATUS_COLOR: Record<GoalStatus, string> = {
  done: "var(--ink)",
  "on-track": "var(--blue)",
  behind: "var(--red)",
  unconfigured: "var(--ink-35)" // neutral, no alarm
};

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  done: "достигнута",
  "on-track": "в графике",
  behind: "отстаёт",
  unconfigured: "не настроена"
};

// ─── Header ─────────────────────────────────────────────
interface SavingsHeaderData {
  todayLabel: string;
  monthlyPace: number;
}

function SavingsHeader({ d }: { d: SavingsHeaderData }) {
  const positive = d.monthlyPace >= 0;
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
          Накопления
        </span>
        <div style={{ width: 14, height: 0.5, background: "var(--ink-55)" }} />
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
          {d.todayLabel}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="eyebrow">темп котла</span>
        <span
          className="slab tnum"
          style={{ fontSize: 13, color: positive ? "var(--blue)" : "var(--red)" }}
        >
          {positive ? "+" : "−"}
          {formatMoney(Math.abs(d.monthlyPace))}
        </span>
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          ₽/мес
        </span>
      </div>
    </div>
  );
}

// ─── PotHero ────────────────────────────────────────────
// Hero — strictly nominal, current value. The pot's balance is already in
// today's ₽ (it's "сейчас"); applying purchasingPowerCoef here would be a
// fabricated future-discount on a present number. Inflation reasoning lives
// in the trajectory section below, where it correctly applies to the
// FORECAST horizon.
interface PotHeroData {
  totalSavings: number;
}

function PotHero({ d }: { d: PotHeroData }) {
  return (
    <div
      style={{
        padding: "22px var(--pad-x) 14px",
        display: "grid",
        gridTemplateColumns: "3px 1fr",
        gap: 14,
        alignItems: "stretch"
      }}
    >
      <div style={{ background: "var(--blue)" }} />
      <div>
        <div className="eyebrow">Накоплено всего · общий котёл</div>
        <div style={{ marginTop: 10 }}>
          <HeroNumber value={formatMoney(d.totalSavings)} />
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 1, background: "var(--ink)" }} />
          <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
            сегодняшний номинал
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Allocation bar + legend + triad ───────────────────
interface AllocSegment {
  id: string;
  label: string;
  value: number;
  fill: string;
  hatch?: boolean;
  textColor?: string; // for legend value text
}

interface AllocationData {
  segments: AllocSegment[];
  total: number;            // for percentage = totalSavings (denominator)
  totalAllocated: number;
  unallocated: number;
  monthlyPace: number;
  overAllocated: boolean;   // true if totalAllocated > totalSavings
}

interface AllocationBucket {
  id: SavingsBucketId;
  label: string;
  amount: number;
  tone: "ink" | "blue" | "neutral";
}

function AllocationBar({ d }: { d: AllocationData }) {
  // For the bar, use absolute width sum to render proportions even when
  // unallocated < 0 (over-allocated). In that case we drop unallocated
  // segment from the bar (it's negative) and surface a clear hint above.
  const drawSegments = d.segments.filter((s) => s.value > 0);
  const sum = Math.max(1, drawSegments.reduce((acc, s) => acc + s.value, 0));
  const W = 304;
  const H = 16;

  return (
    <div style={{ padding: "0 var(--pad-x) 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span className="eyebrow eyebrow--ink">Распределение котла</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          = 100% от {formatMoney(d.total)} ₽
        </span>
      </div>

      {d.overAllocated && (
        <div
          style={{
            margin: "0 0 8px",
            border: "0.5px solid var(--red)",
            display: "grid",
            gridTemplateColumns: "2px 1fr",
            alignItems: "stretch"
          }}
        >
          <div style={{ background: "var(--red)" }} />
          <div style={{ padding: "5px 8px" }}>
            <span
              className="slab"
              style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              Распределено больше, чем в котле
            </span>{" "}
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
              · перепроверьте суммы аллокаций
            </span>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: "block", border: "0.5px solid var(--ink)" }}
      >
        <defs>
          <pattern
            id="alloc-hatch"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink-35)" strokeWidth="0.6" />
          </pattern>
        </defs>
        {(() => {
          let cx = 0;
          return drawSegments.map((s, i) => {
            const w = (s.value / sum) * W;
            const x = cx;
            cx += w;
            return (
              <g key={s.id}>
                <rect
                  x={x}
                  y="0"
                  width={w}
                  height={H}
                  fill={s.hatch ? "url(#alloc-hatch)" : s.fill}
                />
                {i > 0 && (
                  <line x1={x} y1="0" x2={x} y2={H} stroke="var(--paper)" strokeWidth="1" />
                )}
              </g>
            );
          });
        })()}
      </svg>

      {/* Legend */}
      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          columnGap: 10,
          rowGap: 5
        }}
      >
        {d.segments.map((s) => {
          const pct = d.total > 0 ? Math.round((s.value / d.total) * 100) : 0;
          return (
            <SegLegendRow key={s.id} segment={s} pct={pct} />
          );
        })}
      </div>

      {/* Triad */}
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          border: "0.5px solid var(--ink-80)"
        }}
      >
        <TriadCell label="распределено" value={d.totalAllocated} />
        <TriadCell label="не распределено" value={d.unallocated} divider muted={d.unallocated < 0} />
        <TriadCell
          label="темп котла/мес"
          value={d.monthlyPace}
          divider
          color="var(--blue)"
          signed
        />
      </div>
    </div>
  );
}

function SegLegendRow({ segment, pct }: { segment: AllocSegment; pct: number }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            background: segment.hatch ? "transparent" : segment.fill,
            border: segment.hatch ? "0.5px dashed var(--ink-35)" : "none"
          }}
        />
        <span className="mono" style={{ fontSize: 10, letterSpacing: "-0.01em" }}>
          {segment.label}
        </span>
      </div>
      <div
        style={{
          borderBottom: "0.5px dotted var(--ink-18)",
          alignSelf: "end",
          marginBottom: 3
        }}
      />
      <span
        className="mono tnum"
        style={{
          fontSize: 10,
          color: segment.textColor ?? "var(--ink)"
        }}
      >
        {segment.value < 0 ? "−" : ""}
        {formatMoney(Math.abs(segment.value))}
        <span style={{ color: "var(--ink-35)" }}> ₽ · {pct}%</span>
      </span>
    </>
  );
}

function TriadCell({
  label,
  value,
  divider,
  color = "var(--ink)",
  muted,
  signed
}: {
  label: string;
  value: number;
  divider?: boolean;
  color?: string;
  muted?: boolean;
  signed?: boolean;
}) {
  const display = signed
    ? `${value >= 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`
    : `${value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`;
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
      <span
        className="slab tnum"
        style={{ fontSize: 13, color: muted ? "var(--red)" : color }}
      >
        {display}
      </span>
      <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-55)", marginLeft: 3 }}>
        ₽
      </span>
    </div>
  );
}

// ─── PotTrajectory — explicit point series, no hidden fake line ──
type PotTrajectoryPointKind = "history" | "today" | "forecast";
type PotTrajectorySource = "ledger" | "demo";

interface PotTrajectoryPoint {
  date: ISODate;
  amount: number;
  kind: PotTrajectoryPointKind;
}

interface PotTrajectoryData {
  points: PotTrajectoryPoint[];
  source: PotTrajectorySource;
  forecastReal: number;
  forecastDateLabel: string;     // e.g. "31.12.26" or "+12 мес."
  hasDeadline: boolean;
}

function PotTrajectory({ d }: { d: PotTrajectoryData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(304);
  const H = 76;
  const padX = 6;
  const padTop = 13;
  const padBottom = 18;
  const plotW = Math.max(1, width - padX * 2);
  const plotH = H - padTop - padBottom;
  const amounts = d.points.map((point) => point.amount);
  const minVal = Math.min(...amounts);
  const maxVal = Math.max(...amounts);
  const range = maxVal - minVal || 1;
  const startDate = d.points[0]?.date;
  const endDate = d.points[d.points.length - 1]?.date;
  const dateSpan = startDate && endDate ? Math.max(1, daysBetween(startDate, endDate)) : 1;
  const todayPoint = d.points.find((point) => point.kind === "today") ?? d.points[0];
  const forecastPoint = d.points.find((point) => point.kind === "forecast") ?? d.points[d.points.length - 1];

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;

    const update = () => setWidth(Math.max(240, Math.round(node.clientWidth)));
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const xAt = (date: ISODate) => {
    if (!startDate) return padX;
    return padX + (daysBetween(startDate, date) / dateSpan) * plotW;
  };
  const yAt = (amount: number) => {
    return padTop + (1 - (amount - minVal) / range) * plotH;
  };
  const pointToCoord = (point: PotTrajectoryPoint) => ({
    x: xAt(point.date),
    y: yAt(point.amount)
  });
  const historyPoints = d.points.filter((point) => point.kind !== "forecast");
  const historyPath = historyPoints
    .map((point) => {
      const { x, y } = pointToCoord(point);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const forecastPath = [todayPoint, forecastPoint]
    .map((point) => {
      const { x, y } = pointToCoord(point);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const todayCoord = pointToCoord(todayPoint);
  const forecastCoord = pointToCoord(forecastPoint);

  return (
    <div style={{ padding: "6px var(--pad-x) 10px", borderTop: "0.5px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 6 }}>
        <span className="eyebrow eyebrow--ink">Траектория котла</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          сегодня → {d.forecastDateLabel}
        </span>
      </div>

      <div ref={wrapRef}>
        <svg
          width={width}
          height={H}
          style={{ display: "block", width: "100%", height: H, overflow: "visible" }}
          aria-label="Траектория котла накоплений"
        >
          <line
            x1={padX}
            y1={H - padBottom}
            x2={width - padX}
            y2={H - padBottom}
            stroke="var(--hair)"
            strokeWidth="0.5"
          />
          <line
            x1={padX}
            y1={padTop - 5}
            x2={width - padX}
            y2={padTop - 5}
            stroke="var(--hair)"
            strokeWidth="0.5"
            strokeDasharray="1 2"
          />

          <polyline
            points={historyPath}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="0.8"
          />
          <polyline
            points={forecastPath}
            fill="none"
            stroke="var(--blue)"
            strokeWidth="1.1"
            strokeDasharray="2 2"
          />

          {historyPoints.map((point) => {
            const { x, y } = pointToCoord(point);
            return (
              <circle
                key={`${point.kind}-${point.date}-${point.amount}`}
                cx={x}
                cy={y}
                r={point.kind === "today" ? 2.6 : 1.8}
                fill={point.kind === "today" ? "var(--ink)" : "var(--paper)"}
                stroke="var(--ink)"
                strokeWidth="0.8"
              />
            );
          })}

          <line
            x1={todayCoord.x}
            y1={padTop - 7}
            x2={todayCoord.x}
            y2={H - padBottom}
            stroke="var(--ink)"
            strokeWidth="1.2"
          />
          <text
            x={todayCoord.x}
            y="4"
            fontSize="7.5"
            fontFamily="var(--font-slab)"
            textAnchor="middle"
            fill="var(--ink)"
            letterSpacing="0.8"
          >
            СЕГ
          </text>

          <circle
            cx={forecastCoord.x}
            cy={forecastCoord.y}
            r="2.6"
            fill="none"
            stroke="var(--blue)"
            strokeWidth="1.2"
          />
          <text
            x={forecastCoord.x}
            y={Math.max(7, forecastCoord.y - 6)}
            fontSize="7.5"
            fontFamily="var(--font-slab)"
            textAnchor="end"
            fill="var(--blue)"
            letterSpacing="0.8"
          >
            {d.hasDeadline ? d.forecastDateLabel.toUpperCase() : "ГОРИЗОНТ"}
          </text>
        </svg>
      </div>

      <div className="mono" style={{ marginTop: 2, fontSize: 8.5, color: "var(--ink-55)" }}>
        {d.source === "ledger"
          ? "линия факта собрана из переводов и снятий"
          : "demo-точки для проверки экрана · прогноз от текущего котла"}
      </div>

      {/* Forecast pair — about the POT */}
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: "6px 0", borderTop: "0.5px solid var(--hair)" }}>
          <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>
            котёл к {d.forecastDateLabel} · номин.
          </div>
          <span className="slab tnum" style={{ fontSize: 15, color: "var(--blue)" }}>
            {formatMoney(forecastPoint.amount)}
          </span>
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)", marginLeft: 3 }}>
            ₽
          </span>
        </div>
        <div style={{ padding: "6px 0", borderTop: "0.5px solid var(--hair)" }}>
          <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>
            в сегодняшних ₽
          </div>
          <span className="slab tnum" style={{ fontSize: 15, color: "var(--ink-55)" }}>
            {formatMoney(d.forecastReal)}
          </span>
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)", marginLeft: 3 }}>
            ₽
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── CushionBlock — system reserve, NOT a goal ─────────
function CushionBlock({ c }: { c: CushionSnapshot }) {
  const isUnset = c.status === "unset";
  const hasAllocatedWithoutTarget = isUnset && c.allocated > 0;
  const fillColor =
    c.status === "ok" ? "var(--ink)" :
    c.status === "low" ? "var(--yellow)" :
    c.status === "critical" ? "var(--red)" :
    "var(--ink-35)"; // unset
  const pct = Math.round(c.progress * 100);
  return (
    <div
      style={{
        padding: "10px var(--pad-x)",
        borderTop: "0.5px solid var(--ink)"
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        {/* Rotated rhombus glyph — distinct from goal markers, signals system reserve */}
        <div
          style={{
            width: 9,
            height: 9,
            border: "1.2px solid var(--ink)",
            transform: "rotate(45deg)"
          }}
        />
        <span
          className="slab"
          style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          Подушка
        </span>
        <span
          className="mono"
          style={{
            fontSize: 9,
            color: "var(--ink-55)",
            letterSpacing: "0.04em",
            textTransform: "uppercase"
          }}
        >
          · системный резерв
        </span>
        <div style={{ flex: 1 }} />
        {isUnset ? (
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: "var(--ink-55)",
              letterSpacing: "0.04em",
              textTransform: "uppercase"
            }}
          >
            {hasAllocatedWithoutTarget ? "цель не задана" : "не настроена"}
          </span>
        ) : (
          <span className="mono tnum" style={{ fontSize: 10, color: "var(--ink)" }}>
            {formatMoney(c.allocated)}{" "}
            <span style={{ color: "var(--ink-55)" }}>из {formatMoney(c.target)} ₽</span>
          </span>
        )}
      </div>

      <div
        className="mono"
        style={{
          fontSize: 8.8,
          color: "var(--ink-55)",
          letterSpacing: "0.02em",
          lineHeight: 1.35,
          marginBottom: isUnset ? 0 : 7
        }}
      >
        Наполнение: через «Распределить». Целевой размер: Настройки → Накопления.
      </div>

      {isUnset ? (
        <div
          className="mono"
          style={{
            fontSize: 9.5,
            color: "var(--ink-55)",
            letterSpacing: "0.02em",
            paddingTop: 2
          }}
        >
          {hasAllocatedWithoutTarget
            ? `Средства выделены: ${formatMoney(c.allocated)} ₽, но целевой размер не задан.`
            : "Не настроена: денег в подушке нет и целевой размер не задан."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Progress
              value={pct}
              tone={c.status === "critical" ? "red" : c.status === "low" ? "ink" : "ink"}
            />
            <span
              className="slab tnum"
              style={{ fontSize: 11, minWidth: 30, textAlign: "right" }}
            >
              {pct}%
            </span>
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 14 }}>
            <span className="mono tnum" style={{ fontSize: 10 }}>
              {formatMoney(c.allocated)}{" "}
              <span style={{ color: "var(--ink-55)" }}>₽ выделено</span>
            </span>
            <span className="mono tnum" style={{ fontSize: 10, color: "var(--ink-55)" }}>
              цель {formatMoney(c.target)} ₽
            </span>
            <div style={{ flex: 1 }} />
            <span
              className="mono"
              style={{
                fontSize: 9,
                color: fillColor,
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              {c.status === "ok" ? "ok" : c.status === "low" ? "low" : "critical"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── GoalsList & GoalRow ───────────────────────────────
function GoalsList({
  goals,
  onCreateGoal,
  onEditGoal
}: {
  goals: SavingsGoalSnapshot[];
  onCreateGoal: () => void;
  onEditGoal: (goal: SavingsGoal) => void;
}) {
  const totalCount = goals.length;
  const configuredCount = goals.filter((g) => g.status !== "unconfigured").length;
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
        <span className="eyebrow eyebrow--ink">Цели · конверты внутри котла</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
            {totalCount} шт
            {totalCount > configuredCount && (
              <span style={{ color: "var(--ink-35)" }}>
                {" "}· {configuredCount} настроено
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onCreateGoal}
            className="tap-highlight slab"
            style={{
              appearance: "none",
              border: "none",
              borderBottom: "1px solid var(--blue)",
              background: "transparent",
              color: "var(--blue)",
              padding: "0 0 2px",
              fontFamily: "inherit",
              fontSize: 9.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer"
            }}
          >
            Новая цель
          </button>
        </div>
      </div>

      {goals.length === 0 ? (
        <div
          className="mono"
          style={{
            padding: "12px 0",
            fontSize: 11,
            color: "var(--ink-55)",
            letterSpacing: "0.02em"
          }}
        >
          Целей пока нет.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {goals.map((g) => (
            <GoalRow key={g.goal.id} g={g} onEditGoal={onEditGoal} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalRow({
  g,
  onEditGoal
}: {
  g: SavingsGoalSnapshot;
  onEditGoal: (goal: SavingsGoal) => void;
}) {
  const isUnconfigured = g.status === "unconfigured";
  const accent = GOAL_STATUS_COLOR[g.status];
  const statusLabel = GOAL_STATUS_LABEL[g.status];
  const pct = g.goal.target > 0 ? Math.min(100, Math.round((g.allocatedNow / g.goal.target) * 100)) : 0;
  const deadlineLabel = g.goal.deadline ? fmtDate(g.goal.deadline) : "без дедлайна";
  const monthsLabel = g.monthsLeft != null ? `${Math.round(g.monthsLeft)} мес.` : "—";

  return (
    <div
      style={{
        // unconfigured: thinner, neutral frame; configured: full ink-80 frame
        border: isUnconfigured ? "0.5px solid var(--ink-35)" : "0.5px solid var(--ink-80)",
        padding: "10px 12px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        rowGap: 7,
        columnGap: 10,
        // unconfigured rows lower visual weight overall
        opacity: isUnconfigured ? 0.78 : 1
      }}
    >
      {/* Name + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div style={{ width: 2, height: 11, background: accent }} />
        <span
          className="slab"
          style={{
            fontSize: 12,
            letterSpacing: "-0.01em",
            color: isUnconfigured ? "var(--ink-55)" : "var(--ink)"
          }}
        >
          {g.goal.title}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 8.5,
            color: accent,
            letterSpacing: "0.06em",
            textTransform: "uppercase"
          }}
        >
          · {statusLabel}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          до {deadlineLabel} · {monthsLabel}
        </span>
        <button
          type="button"
          onClick={() => onEditGoal(g.goal)}
          className="tap-highlight mono"
          style={{
            appearance: "none",
            border: "none",
            borderBottom: "0.5px solid var(--ink-55)",
            background: "transparent",
            color: "var(--ink-55)",
            padding: "0 0 1px",
            fontFamily: "inherit",
            fontSize: 8.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer"
          }}
        >
          Изменить
        </button>
      </div>

      {/* Progress bar = allocated / target */}
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
        <Progress
          value={pct}
          tone={g.status === "behind" ? "red" : g.status === "on-track" ? "blue" : "ink"}
        />
        <span
          className="slab tnum"
          style={{
            fontSize: 11,
            minWidth: 30,
            textAlign: "right",
            color: isUnconfigured ? "var(--ink-55)" : "var(--ink)"
          }}
        >
          {pct}%
        </span>
      </div>

      {isUnconfigured ? (
        // Quiet hint — no aggressive metric grid for unconfigured goals.
        <div
          style={{
            gridColumn: "1 / -1",
            paddingTop: 3,
            borderTop: "0.5px solid var(--hair)"
          }}
          className="mono"
        >
          <span style={{ fontSize: 9.5, color: "var(--ink-55)", letterSpacing: "0.02em" }}>
            Не выделено и не задан плановый темп. Цель: {formatMoney(g.goal.target)} ₽.
          </span>
        </div>
      ) : (
        <>
          {/* Row A: allocated / target / gap now */}
          <div
            style={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              paddingTop: 3,
              borderTop: "0.5px solid var(--hair)"
            }}
          >
            <GoalCell label="выделено" value={formatMoney(g.allocatedNow)} />
            <GoalCell label="цель" value={formatMoney(g.goal.target)} color="var(--ink-55)" />
            <GoalCell
              label="разрыв сейчас"
              value={formatMoney(g.gapNow)}
              color={accent}
            />
          </div>

          {/* Row B: required vs planned pace */}
          <div
            style={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
              borderTop: "0.5px solid var(--hair)",
              paddingTop: 4
            }}
          >
            <PaceCell
              label="нужный темп"
              value={formatPace(g.requiredPace)}
              color={accent}
            />
            <PaceCell
              label="плановый темп"
              value={`+${formatMoney(g.plannedPace)} ₽/мес`}
              color="var(--ink)"
            />
          </div>

          {/* Row C: forecast at deadline + gap at deadline */}
          <div
            style={{
              gridColumn: "1 / -1",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              borderTop: "0.5px solid var(--hair)",
              paddingTop: 4
            }}
          >
            <PaceCell
              label="прогноз к дедлайну"
              value={`${formatMoney(g.forecastAtDeadline)} ₽`}
              color="var(--ink)"
            />
            <PaceCell
              label="разрыв к дедлайну"
              value={g.gapAtDeadline > 0 ? `${formatMoney(g.gapAtDeadline)} ₽` : "0 ₽"}
              color={g.gapAtDeadline > 0 ? accent : "var(--ink-55)"}
            />
          </div>
        </>
      )}
    </div>
  );
}

type GoalDialogState = {
  mode: "create" | "edit";
  goal?: SavingsGoal;
};

function GoalCell({
  label,
  value,
  color = "var(--ink)"
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span
        className="mono"
        style={{
          fontSize: 8,
          color: "var(--ink-55)",
          letterSpacing: "0.04em",
          textTransform: "uppercase"
        }}
      >
        {label}
      </span>
      <span className="slab tnum" style={{ fontSize: 11, color, marginTop: 1 }}>
        {value}
        <span className="mono" style={{ fontSize: 8, color: "var(--ink-55)" }}>
          {" "}
          ₽
        </span>
      </span>
    </div>
  );
}

function PaceCell({
  label,
  value,
  color = "var(--ink)"
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span
        className="mono"
        style={{
          fontSize: 8,
          color: "var(--ink-55)",
          letterSpacing: "0.04em",
          textTransform: "uppercase"
        }}
      >
        {label}
      </span>
      <span
        className="mono tnum"
        style={{ fontSize: 10, color, marginTop: 1, fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  );
}

function GoalDialog({
  open,
  state,
  nextPriority,
  onOpenChange,
  onSave,
  onDelete
}: {
  open: boolean;
  state: GoalDialogState | null;
  nextPriority: number;
  onOpenChange: (open: boolean) => void;
  onSave: (goal: Omit<SavingsGoal, "id"> & { id?: string }) => void;
  onDelete: (goalId: string) => void;
}) {
  const mode = state?.mode ?? "create";
  const goal = state?.goal;
  const isEdit = mode === "edit" && Boolean(goal);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [plannedPace, setPlannedPace] = useState("0");
  const [priority, setPriority] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? "");
    setTarget(goal ? String(goal.target) : "");
    setDeadline(goal?.deadline ?? "");
    setPlannedPace(goal ? String(goal.plannedPace) : "0");
    setPriority(String(goal?.priority ?? nextPriority));
    setError(null);
    setConfirmDelete(false);
  }, [goal, nextPriority, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTitle = title.trim();
    const targetValue = numberFromInput(target);
    const plannedPaceValue = numberFromInput(plannedPace);
    const priorityValue = Math.round(numberFromInput(priority, nextPriority));
    const cleanDeadline = deadline.trim();

    if (!cleanTitle) {
      setError("Введите название цели.");
      return;
    }

    if (targetValue <= 0) {
      setError("Целевая сумма должна быть больше нуля.");
      return;
    }

    if (plannedPaceValue < 0) {
      setError("Плановый темп не может быть отрицательным.");
      return;
    }

    if (priorityValue <= 0) {
      setError("Приоритет должен быть больше нуля.");
      return;
    }

    if (cleanDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDeadline)) {
      setError("Дедлайн должен быть датой или пустым полем.");
      return;
    }

    onSave({
      id: goal?.id,
      title: cleanTitle,
      target: targetValue,
      deadline: cleanDeadline ? (cleanDeadline as ISODate) : undefined,
      priority: priorityValue,
      allocated: goal?.allocated ?? 0,
      plannedPace: plannedPaceValue
    });
  }

  function handleDelete() {
    if (!goal) return;
    onDelete(goal.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Изменить цель" : "Новая цель"}</DialogTitle>
          <DialogDescription>
            Форма меняет только структуру цели. Деньги в конверт двигаются через
            «Распределить».
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <DialogField label="Название" htmlFor="goal-title">
              <Input
                id="goal-title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                autoFocus
                required
                placeholder="Например, новый ноутбук"
              />
            </DialogField>

            <DialogField label="Целевая сумма" htmlFor="goal-target">
              <Input
                id="goal-target"
                value={target}
                onChange={(event) => setTarget(event.currentTarget.value)}
                inputMode="decimal"
                required
                placeholder="0"
              />
            </DialogField>

            <DialogField label="Дедлайн" htmlFor="goal-deadline">
              <Input
                id="goal-deadline"
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.currentTarget.value)}
              />
              <div className="mono" style={{ marginTop: 5, fontSize: 9, color: "var(--ink-55)" }}>
                Можно оставить пустым.
              </div>
            </DialogField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 12 }}>
              <DialogField label="Плановый темп" htmlFor="goal-pace">
                <Input
                  id="goal-pace"
                  value={plannedPace}
                  onChange={(event) => setPlannedPace(event.currentTarget.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </DialogField>
              <DialogField label="Приоритет" htmlFor="goal-priority">
                <Input
                  id="goal-priority"
                  value={priority}
                  onChange={(event) => setPriority(event.currentTarget.value)}
                  inputMode="numeric"
                  required
                  placeholder={String(nextPriority)}
                />
              </DialogField>
            </div>

            <div
              style={{
                borderTop: "0.5px solid var(--hair)",
                paddingTop: 9
              }}
            >
              <div className="eyebrow" style={{ marginBottom: 3 }}>
                Выделено сейчас
              </div>
              <div className="slab tnum" style={{ fontSize: 14 }}>
                {formatMoney(goal?.allocated ?? 0)}{" "}
                <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
                  ₽
                </span>
              </div>
              <div className="mono" style={{ marginTop: 4, fontSize: 9, color: "var(--ink-55)" }}>
                Эта сумма меняется через «Распределить», а не в форме цели.
              </div>
            </div>

            {error && (
              <div
                className="mono"
                style={{
                  borderTop: "0.5px solid var(--red)",
                  paddingTop: 8,
                  color: "var(--red)",
                  fontSize: 9.5
                }}
              >
                {error}
              </div>
            )}

            {isEdit && goal && confirmDelete && (
              <div
                style={{
                  borderTop: "1px solid var(--red)",
                  paddingTop: 9
                }}
              >
                <div className="slab" style={{ fontSize: 10, textTransform: "uppercase" }}>
                  Удалить цель?
                </div>
                <div
                  className="mono"
                  style={{ marginTop: 5, fontSize: 9.5, color: "var(--ink-55)", lineHeight: 1.45 }}
                >
                  {goal.allocated > 0
                    ? `${formatMoney(goal.allocated)} ₽ не исчезнут: цель удалится, а деньги вернутся в «Не распределено».`
                    : "Цель удалится. Общий котёл накоплений не изменится."}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 9 }}>
                  <button
                    type="button"
                    className="tap-highlight mono"
                    onClick={() => setConfirmDelete(false)}
                    style={smallDialogButtonStyle()}
                  >
                    Оставить
                  </button>
                  <button
                    type="button"
                    className="tap-highlight mono"
                    onClick={handleDelete}
                    style={smallDialogButtonStyle("var(--red)")}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )}
          </DialogBody>

          <div style={{ display: "grid", gridTemplateColumns: isEdit ? "1fr 1.4fr" : "1fr" }}>
            {isEdit && (
              <button
                type="button"
                className="tap-highlight slab"
                onClick={() => setConfirmDelete(true)}
                style={{
                  padding: "12px 14px",
                  background: "transparent",
                  color: "var(--red)",
                  border: "none",
                  borderTop: "1px solid var(--red)",
                  borderRight: "0.5px solid var(--ink)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em"
                }}
              >
                Удалить
              </button>
            )}
            <button
              type="submit"
              className="tap-highlight slab"
              style={{
                padding: "12px 14px",
                background: "var(--ink)",
                color: "var(--paper)",
                border: "none",
                borderTop: "1px solid var(--ink)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em"
              }}
            >
              {isEdit ? "Сохранить цель" : "Создать цель"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogField({
  label,
  htmlFor,
  children
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="eyebrow" style={{ display: "block", marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function smallDialogButtonStyle(color = "var(--ink)") {
  return {
    minHeight: 34,
    border: `0.5px solid ${color}`,
    background: "transparent",
    color,
    fontFamily: "inherit",
    fontSize: 9.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    cursor: "pointer"
  };
}

function formatPace(value: number) {
  if (!Number.isFinite(value)) return "сразу";
  return `${formatMoney(value)} ₽/мес`;
}

function addMonthsISO(date: ISODate, months: number): ISODate {
  const value = parseISODate(date);
  value.setMonth(value.getMonth() + months);
  return toISODate(value);
}

function buildPotTrajectorySeries({
  state,
  snapshot,
  forecastDate,
  forecastNominal
}: {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  forecastDate: ISODate;
  forecastNominal: number;
}): { points: PotTrajectoryPoint[]; source: PotTrajectorySource } {
  const ledgerPoints = buildLedgerPotHistory(state, snapshot);
  const source: PotTrajectorySource = ledgerPoints.length >= 4 ? "ledger" : "demo";
  const history = source === "ledger" ? ledgerPoints : buildDemoPotHistory(state, snapshot);
  const safeForecastDate =
    daysBetween(snapshot.today, forecastDate) > 0 ? forecastDate : addDays(snapshot.today, 30);
  const points = [
    ...history,
    {
      date: safeForecastDate,
      amount: forecastNominal,
      kind: "forecast" as const
    }
  ];

  return { points, source };
}

function buildLedgerPotHistory(state: FinanceState, snapshot: CalculationSnapshot): PotTrajectoryPoint[] {
  const startDate = state.savings.openedAt;
  const today = snapshot.today;
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
    .filter((operation) => {
      return daysBetween(startDate, operation.date) >= 0 && daysBetween(operation.date, today) >= 0;
    })
    .sort((a, b) => compareDates(a.date, b.date));

  let running = state.savings.baselineBalance;
  const points: PotTrajectoryPoint[] = [
    {
      date: startDate,
      amount: Math.round(running),
      kind: "history"
    }
  ];

  for (const operation of operations) {
    running += operation.delta;
    upsertPoint(points, {
      date: operation.date,
      amount: Math.round(running),
      kind: "history"
    });
  }

  upsertPoint(points, {
    date: today,
    amount: Math.round(snapshot.totalSavings),
    kind: "today"
  });

  return points;
}

function buildDemoPotHistory(state: FinanceState, snapshot: CalculationSnapshot): PotTrajectoryPoint[] {
  const startDate = state.savings.openedAt;
  const today = snapshot.today;
  const totalDays = Math.max(1, daysBetween(startDate, today));
  const startAmount = state.savings.baselineBalance;
  const delta = snapshot.totalSavings - startAmount;

  return DEMO_POT_HISTORY_PATTERN.map((step, index) => ({
    date: index === DEMO_POT_HISTORY_PATTERN.length - 1
      ? today
      : addDays(startDate, Math.round(totalDays * step.progress)),
    amount: Math.round(startAmount + delta * step.ratio),
    kind: index === DEMO_POT_HISTORY_PATTERN.length - 1 ? "today" : "history"
  }));
}

function upsertPoint(points: PotTrajectoryPoint[], next: PotTrajectoryPoint) {
  const last = points[points.length - 1];
  if (last?.date === next.date) {
    points[points.length - 1] = next;
    return;
  }
  points.push(next);
}

function AllocationDialog({
  open,
  buckets,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  buckets: AllocationBucket[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: SavingsAllocationPayload, labels: { source: string; target: string }) => void;
}) {
  const firstFunded = buckets.find((bucket) => bucket.amount > 0)?.id ?? "unallocated";
  const firstTarget =
    buckets.find((bucket) => bucket.id !== firstFunded)?.id ??
    (firstFunded === "unallocated" ? "cushion" : "unallocated");
  const [sourceId, setSourceId] = useState<SavingsBucketId>(firstFunded);
  const [targetId, setTargetId] = useState<SavingsBucketId>(firstTarget);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }

    const nextSource = buckets.find((bucket) => bucket.amount > 0)?.id ?? "unallocated";
    const nextTarget =
      buckets.find((bucket) => bucket.id !== nextSource)?.id ??
      (nextSource === "unallocated" ? "cushion" : "unallocated");
    setSourceId(nextSource);
    setTargetId(nextTarget);
    setError(null);
  }, [buckets, open]);

  useEffect(() => {
    if (sourceId !== targetId) return;
    const replacement = buckets.find((bucket) => bucket.id !== sourceId)?.id;
    if (replacement) setTargetId(replacement);
  }, [buckets, sourceId, targetId]);

  const source = buckets.find((bucket) => bucket.id === sourceId);
  const target = buckets.find((bucket) => bucket.id === targetId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = numberFromInput(form.get("amount"));

    if (!source || !target) {
      setError("Выберите откуда и куда распределить.");
      return;
    }

    if (source.id === target.id) {
      setError("Источник и цель должны отличаться.");
      return;
    }

    if (amount <= 0) {
      setError("Введите сумму больше нуля.");
      return;
    }

    if (amount > source.amount) {
      setError(`В источнике доступно ${formatMoney(source.amount)} ₽.`);
      return;
    }

    onSubmit(
      {
        sourceId: source.id,
        targetId: target.id,
        amount
      },
      {
        source: source.label,
        target: target.label
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Распределить</DialogTitle>
          <DialogDescription>
            Внутреннее движение внутри котла. Общая сумма накоплений не меняется.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <AllocationSelect
              id="allocation-source"
              label="Откуда"
              value={sourceId}
              buckets={buckets}
              onChange={setSourceId}
              onlyFunded
            />
            <AllocationSelect
              id="allocation-target"
              label="Куда"
              value={targetId}
              buckets={buckets}
              disabledId={sourceId}
              onChange={setTargetId}
            />
            <div>
              <label
                htmlFor="allocation-amount"
                className="eyebrow"
                style={{ display: "block", marginBottom: 5 }}
              >
                Сумма
              </label>
              <Input
                id="allocation-amount"
                name="amount"
                inputMode="decimal"
                autoFocus
                required
                placeholder={source ? formatMoney(source.amount) : "0"}
              />
              {source && (
                <div className="mono" style={{ marginTop: 5, fontSize: 9, color: "var(--ink-55)" }}>
                  Доступно в источнике: {formatMoney(source.amount)} ₽
                </div>
              )}
            </div>

            {error && (
              <div
                className="mono"
                style={{
                  borderTop: "0.5px solid var(--red)",
                  paddingTop: 8,
                  color: "var(--red)",
                  fontSize: 9.5
                }}
              >
                {error}
              </div>
            )}
          </DialogBody>

          <button
            type="submit"
            className="tap-highlight slab"
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "var(--ink)",
              color: "var(--paper)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderTop: "1px solid var(--ink)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em"
            }}
          >
            Применить распределение
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AllocationSelect({
  id,
  label,
  value,
  buckets,
  disabledId,
  onlyFunded,
  onChange
}: {
  id: string;
  label: string;
  value: SavingsBucketId;
  buckets: AllocationBucket[];
  disabledId?: SavingsBucketId;
  onlyFunded?: boolean;
  onChange: (value: SavingsBucketId) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow" style={{ display: "block", marginBottom: 5 }}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as SavingsBucketId)}
        style={{
          width: "100%",
          minHeight: 42,
          border: "1px solid var(--ink)",
          borderRadius: 0,
          background: "var(--paper)",
          color: "var(--ink)",
          padding: "0 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 12
        }}
      >
        {buckets.map((bucket) => (
          <option
            key={bucket.id}
            value={bucket.id}
            disabled={bucket.id === disabledId || (onlyFunded && bucket.amount <= 0)}
          >
            {bucket.label} — {formatMoney(bucket.amount)} ₽
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Screen ─────────────────────────────────────────────
export function SavingsScreen({
  state,
  snapshot,
  onAction,
  onAllocate,
  onSaveGoal,
  onDeleteGoal
}: SavingsScreenProps) {
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocationNotice, setAllocationNotice] = useState<{
    source: string;
    target: string;
    amount: number;
  } | null>(null);
  const [goalDialog, setGoalDialog] = useState<GoalDialogState | null>(null);

  const nextGoalPriority = useMemo(() => {
    return state.goals.reduce((max, goal) => Math.max(max, goal.priority), 0) + 1;
  }, [state.goals]);

  // Header
  const header: SavingsHeaderData = useMemo(
    () => ({
      todayLabel: fmtDate(snapshot.today),
      monthlyPace: Math.round(snapshot.monthlySavingPace)
    }),
    [snapshot.today, snapshot.monthlySavingPace]
  );

  // Hero — strictly nominal. Pot balance is "сейчас" — no inflation
  // discount applied to a present value.
  const totalSavings = snapshot.totalSavings;
  const hero: PotHeroData = { totalSavings };

  // Allocation segments — cushion + each goal envelope + unallocated (hatch)
  const allocation: AllocationData = useMemo(() => {
    const cushionAllocated = snapshot.cushion.allocated;
    const segments: AllocSegment[] = [];
    if (cushionAllocated > 0) {
      segments.push({
        id: "cushion",
        label: "Подушка",
        value: cushionAllocated,
        fill: "var(--ink)",
        textColor: "var(--ink)"
      });
    }
    for (const g of snapshot.goals) {
      if (g.allocatedNow > 0) {
        segments.push({
          id: g.goal.id,
          label: g.goal.title,
          value: g.allocatedNow,
          fill: g.status === "behind" ? "var(--red)" : "var(--blue)",
          textColor: "var(--ink)"
        });
      }
    }
    // Unallocated segment: only render if positive. If negative (over-
    // allocation), surface it via overAllocated flag on the bar instead.
    const unallocatedAbs = Math.max(0, snapshot.unallocatedSavings);
    if (unallocatedAbs > 0 || snapshot.unallocatedSavings === 0) {
      segments.push({
        id: "unallocated",
        label: "Не распределено",
        value: unallocatedAbs,
        fill: "var(--paper)",
        hatch: true,
        textColor: "var(--ink-55)"
      });
    }
    return {
      segments,
      total: snapshot.totalSavings,
      totalAllocated: snapshot.totalAllocated,
      unallocated: snapshot.unallocatedSavings,
      monthlyPace: Math.round(snapshot.monthlySavingPace),
      overAllocated: snapshot.unallocatedSavings < 0
    };
  }, [snapshot.cushion.allocated, snapshot.goals, snapshot.totalSavings, snapshot.totalAllocated, snapshot.unallocatedSavings, snapshot.monthlySavingPace]);

  const allocationBuckets: AllocationBucket[] = useMemo(() => {
    return [
      {
        id: "unallocated",
        label: "Не распределено",
        amount: Math.max(0, snapshot.unallocatedSavings),
        tone: "neutral"
      },
      {
        id: "cushion",
        label: "Подушка",
        amount: Math.max(0, snapshot.cushion.allocated),
        tone: "ink"
      },
      ...snapshot.goals.map((goal) => ({
        id: `goal:${goal.goal.id}` as const,
        label: goal.goal.title,
        amount: Math.max(0, goal.allocatedNow),
        tone: "blue" as const
      }))
    ];
  }, [snapshot.cushion.allocated, snapshot.goals, snapshot.unallocatedSavings]);

  function handleAllocateSubmit(
    payload: SavingsAllocationPayload,
    labels: { source: string; target: string }
  ) {
    onAllocate(payload);
    setAllocationNotice({
      source: labels.source,
      target: labels.target,
      amount: payload.amount
    });
    setAllocationOpen(false);
  }

  function handleSaveGoal(goal: Omit<SavingsGoal, "id"> & { id?: string }) {
    onSaveGoal?.(goal);
    setGoalDialog(null);
  }

  function handleDeleteGoal(goalId: string) {
    onDeleteGoal?.(goalId);
    setGoalDialog(null);
  }

  // Trajectory point series:
  //   - real ledger points when there are enough dated transfers/withdrawals;
  //   - otherwise named demo points anchored to baseline/current pot.
  // Forecast horizon = primaryGoal deadline if any, else +12 months default.
  const hasDeadline = Boolean(snapshot.primaryGoal?.goal.deadline);
  const forecastDate = hasDeadline
    ? snapshot.primaryGoal!.goal.deadline!
    : addMonthsISO(snapshot.today, 12);
  const forecastDateLabel = hasDeadline
    ? fmtDate(snapshot.primaryGoal!.goal.deadline!)
    : "+12 мес.";
  const trajectorySeries = buildPotTrajectorySeries({
    state,
    snapshot,
    forecastDate,
    forecastNominal: Math.round(snapshot.savingsForecastNominal)
  });
  const trajectory: PotTrajectoryData = {
    points: trajectorySeries.points,
    source: trajectorySeries.source,
    forecastReal: Math.round(snapshot.savingsForecastReal),
    forecastDateLabel,
    hasDeadline
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100dvh - env(safe-area-inset-bottom) - 52px)",
        background: "var(--paper)"
      }}
    >
      <SavingsHeader d={header} />
      <PotHero d={hero} />
      <AllocationBar d={allocation} />
      <PotTrajectory d={trajectory} />
      <CushionBlock c={snapshot.cushion} />
      <GoalsList
        goals={snapshot.goals}
        onCreateGoal={() => setGoalDialog({ mode: "create" })}
        onEditGoal={(goal) => setGoalDialog({ mode: "edit", goal })}
      />

      <div style={{ flex: 1, minHeight: 64 }} />

      {allocationNotice && (
        <div
          style={{
            margin: "0 var(--pad-x) 8px",
            borderTop: "1px solid var(--blue)",
            borderBottom: "0.5px solid var(--hair)",
            padding: "7px 0 8px"
          }}
        >
          <div className="eyebrow eyebrow--ink" style={{ marginBottom: 3 }}>
            Распределено
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-55)" }}>
            {allocationNotice.source} → {allocationNotice.target} ·{" "}
            <span className="slab tnum" style={{ color: "var(--blue)", fontSize: 11 }}>
              {formatMoney(allocationNotice.amount)} ₽
            </span>
          </div>
        </div>
      )}

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
            label: "Отложить в котёл",
            shape: "square",
            onClick: () => onAction("transfer")
          }}
          secondary={{
            label: "Распределить",
            shape: "circle",
            tone: "blue",
            onClick: () => setAllocationOpen(true)
          }}
        />
      </div>

      <AllocationDialog
        open={allocationOpen}
        buckets={allocationBuckets}
        onOpenChange={setAllocationOpen}
        onSubmit={handleAllocateSubmit}
      />
      <GoalDialog
        open={Boolean(goalDialog)}
        state={goalDialog}
        nextPriority={nextGoalPriority}
        onOpenChange={(open) => {
          if (!open) setGoalDialog(null);
        }}
        onSave={handleSaveGoal}
        onDelete={handleDeleteGoal}
      />
    </div>
  );
}
