"use client";

import { useMemo } from "react";
import type { ActionDialogKind } from "@/components/action-dialogs";
import { CTARow, HeroNumber } from "@/components/mfm-ui";
import { Progress } from "@/components/ui/progress";
import { parseISODate } from "@/lib/dates";
import type {
  CalculationSnapshot,
  CushionSnapshot,
  FinanceState,
  GoalStatus,
  SavingsGoal,
  SavingsGoalSnapshot
} from "@/lib/types";
import { formatMoney } from "@/lib/utils";

interface SavingsScreenProps {
  state: FinanceState;
  snapshot: CalculationSnapshot;
  onAction: (action: ActionDialogKind) => void;
  /** Goal CRUD UI moves to dialogs in step 11. Handlers kept in props for
   *  app-shell wiring parity; not used by this screen. */
  onSaveGoal?: (goal: Omit<SavingsGoal, "id"> & { id?: string }) => void;
  onDeleteGoal?: (goalId: string) => void;
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
     - PotTrajectory shows FORECAST ONLY (no fabricated past). Without a
       dated balance ledger we don't pretend to know intermediate history.
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

// ─── PotTrajectory — forecast only, no fabricated past ──
interface PotTrajectoryData {
  currentSavings: number;
  forecastNominal: number;
  forecastReal: number;
  forecastDateLabel: string;     // e.g. "31.12.26" or "+12 мес."
  hasDeadline: boolean;
}

function PotTrajectory({ d }: { d: PotTrajectoryData }) {
  const W = 304;
  const H = 64;
  const padX = 6;
  const baselineY = H - 12;
  const todayX = padX;
  const endX = W - padX;

  // Vertical scale: today → forecast value
  const minVal = Math.min(d.currentSavings, d.forecastNominal);
  const maxVal = Math.max(d.currentSavings, d.forecastNominal);
  const range = maxVal - minVal || 1;
  const yAt = (v: number) => baselineY - 4 - ((v - minVal) / range) * (H - 24);
  const todayY = yAt(d.currentSavings);
  const endY = yAt(d.forecastNominal);

  return (
    <div style={{ padding: "6px var(--pad-x) 10px", borderTop: "0.5px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 6 }}>
        <span className="eyebrow eyebrow--ink">Траектория котла · forecast</span>
        <div style={{ flex: 1, height: 0.5, background: "var(--hair)" }} />
        <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          сегодня → {d.forecastDateLabel}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* baseline (current value) */}
        <line
          x1={todayX}
          y1={baselineY}
          x2={endX}
          y2={baselineY}
          stroke="var(--hair)"
          strokeWidth="0.5"
        />
        {/* horizon hint line at top */}
        <line
          x1={todayX}
          y1="8"
          x2={endX}
          y2="8"
          stroke="var(--hair)"
          strokeWidth="0.5"
          strokeDasharray="1 2"
        />

        {/* Forecast line — DASHED (we only know two anchors honestly:
            today and projected horizon). NO past line is fabricated. */}
        <line
          x1={todayX}
          y1={todayY}
          x2={endX}
          y2={endY}
          stroke="var(--blue)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />

        {/* Today anchor — solid ink vertical + filled circle */}
        <line
          x1={todayX}
          y1="4"
          x2={todayX}
          y2={baselineY}
          stroke="var(--ink)"
          strokeWidth="1.5"
        />
        <circle cx={todayX} cy={todayY} r="2.4" fill="var(--ink)" />
        <text
          x={todayX}
          y="3"
          fontSize="7.5"
          fontFamily="var(--font-slab)"
          textAnchor="start"
          fill="var(--ink)"
          letterSpacing="0.8"
        >
          СЕГ
        </text>

        {/* Horizon anchor — open blue circle + label */}
        <circle cx={endX} cy={endY} r="2.4" fill="none" stroke="var(--blue)" strokeWidth="1.2" />
        <text
          x={endX}
          y={endY - 6}
          fontSize="7.5"
          fontFamily="var(--font-slab)"
          textAnchor="end"
          fill="var(--blue)"
          letterSpacing="0.8"
        >
          {d.hasDeadline ? d.forecastDateLabel.toUpperCase() : "ГОРИЗОНТ"}
        </text>
      </svg>

      {/* Forecast pair — about the POT */}
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: "6px 0", borderTop: "0.5px solid var(--hair)" }}>
          <div className="eyebrow" style={{ fontSize: 8, marginBottom: 2 }}>
            котёл к {d.forecastDateLabel} · номин.
          </div>
          <span className="slab tnum" style={{ fontSize: 15, color: "var(--blue)" }}>
            {formatMoney(d.forecastNominal)}
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
            не настроена
          </span>
        ) : (
          <span className="mono tnum" style={{ fontSize: 10, color: "var(--ink)" }}>
            {formatMoney(c.allocated)}{" "}
            <span style={{ color: "var(--ink-55)" }}>из {formatMoney(c.target)} ₽</span>
          </span>
        )}
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
          Целевой размер подушки не задан. Когда установите, она получит
          собственную полосу прогресса и статус.
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
function GoalsList({ goals }: { goals: SavingsGoalSnapshot[] }) {
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
        <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
          {totalCount} шт
          {totalCount > configuredCount && (
            <span style={{ color: "var(--ink-35)" }}>
              {" "}· {configuredCount} настроено
            </span>
          )}
        </span>
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
            <GoalRow key={g.goal.id} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalRow({ g }: { g: SavingsGoalSnapshot }) {
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
      <span className="mono tnum" style={{ fontSize: 9.5, color: "var(--ink-55)" }}>
        до {deadlineLabel} · {monthsLabel}
      </span>

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

function formatPace(value: number) {
  if (!Number.isFinite(value)) return "сразу";
  return `${formatMoney(value)} ₽/мес`;
}

// ─── Screen ─────────────────────────────────────────────
export function SavingsScreen({ snapshot, onAction }: SavingsScreenProps) {
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

  // Trajectory — forecast only. Honest endpoints only:
  //   today (current pot) → horizon (snapshot.savingsForecastNominal).
  // Horizon = primaryGoal deadline if any, else +12 months default.
  const hasDeadline = Boolean(snapshot.primaryGoal?.goal.deadline);
  const forecastDateLabel = hasDeadline
    ? fmtDate(snapshot.primaryGoal!.goal.deadline!)
    : "+12 мес.";
  const trajectory: PotTrajectoryData = {
    currentSavings: totalSavings,
    forecastNominal: Math.round(snapshot.savingsForecastNominal),
    forecastReal: Math.round(snapshot.savingsForecastReal),
    forecastDateLabel,
    hasDeadline
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "var(--paper)"
      }}
    >
      <SavingsHeader d={header} />
      <PotHero d={hero} />
      <AllocationBar d={allocation} />
      <PotTrajectory d={trajectory} />
      <CushionBlock c={snapshot.cushion} />
      <GoalsList goals={snapshot.goals} />

      <div style={{ flex: 1, minHeight: 6 }} />

      <CTARow
        primary={{
          label: "Отложить в котёл",
          shape: "square",
          onClick: () => onAction("transfer")
        }}
        secondary={{
          // No allocation-management dialog yet (lands in step 11).
          // Keep the button visible per hi-fi but disabled — better than
          // a fake action.
          label: "Распределить",
          shape: "circle",
          tone: "blue",
          disabled: true
        }}
      />
    </div>
  );
}
