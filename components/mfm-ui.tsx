"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   Hi-fi primitives — direct port of design/final/МФМ/hifi-primitives.jsx
   plus settings primitives from hifi-settings.jsx.
   No business logic here. Composites (BalanceStrip, PaceRow, CycleAxis,
   FooterStrips, AllocationBar, etc.) live in their respective screens.
   ───────────────────────────────────────────────────────────── */

// ─── Glyph — 5 Bauhaus shapes ───────────────────────────────
export type GlyphShape = "square" | "circle" | "triangle" | "bar" | "halfcircle";

interface GlyphProps {
  shape: GlyphShape;
  fill?: string;
  stroke?: string | null;
  size?: number;
  sw?: number;
  className?: string;
}

export function Glyph({
  shape,
  fill = "var(--ink)",
  stroke = null,
  size = 10,
  sw = 1.2,
  className
}: GlyphProps) {
  const s = size;
  const sp = stroke
    ? ({ fill: "none", stroke, strokeWidth: sw } as const)
    : ({ fill } as const);
  if (shape === "square") {
    return (
      <svg width={s} height={s} className={className} style={{ display: "block" }}>
        <rect x="0.5" y="0.5" width={s - 1} height={s - 1} {...sp} />
      </svg>
    );
  }
  if (shape === "circle") {
    return (
      <svg width={s} height={s} className={className} style={{ display: "block" }}>
        <circle cx={s / 2} cy={s / 2} r={s / 2 - 0.5} {...sp} />
      </svg>
    );
  }
  if (shape === "triangle") {
    return (
      <svg width={s} height={s} className={className} style={{ display: "block" }}>
        <polygon points={`${s / 2},0.5 ${s - 0.5},${s - 0.5} 0.5,${s - 0.5}`} {...sp} />
      </svg>
    );
  }
  if (shape === "bar") {
    return (
      <svg width={s} height={s / 3} className={className} style={{ display: "block" }}>
        <rect x="0" y="0" width={s} height={s / 3} fill={fill} />
      </svg>
    );
  }
  if (shape === "halfcircle") {
    return (
      <svg width={s} height={s / 2} className={className} style={{ display: "block" }}>
        <path d={`M 0.5 ${s / 2} A ${s / 2 - 0.5} ${s / 2 - 0.5} 0 0 1 ${s - 0.5} ${s / 2}`} {...sp} />
      </svg>
    );
  }
  return null;
}

// ─── HeroNumber — 64/0.88 slab tnum + currency ──────────────
interface HeroNumberProps {
  value: string;
  size?: string | number;
  xSize?: string | number;
  color?: string;
  className?: string;
}

export function HeroNumber({
  value,
  size = "var(--t-hero)",
  xSize = "var(--t-hero-x)",
  color = "var(--ink)",
  className
}: HeroNumberProps) {
  return (
    <div className={cn("inline-flex items-baseline", className)} style={{ gap: 6, lineHeight: 1 }}>
      <span className="slab tnum" style={{ fontSize: size, color, lineHeight: 0.88 }}>
        {value}
      </span>
      <span className="slab" style={{ fontSize: xSize, color, lineHeight: 1 }}>
        ₽
      </span>
    </div>
  );
}

// ─── InlineNumber — small slab + mono ₽ ────────────────────
interface InlineNumberProps {
  value: string;
  color?: string;
  size?: string | number;
  currency?: boolean;
  currencyColor?: string;
  className?: string;
}

export function InlineNumber({
  value,
  color = "var(--ink)",
  size = "var(--t-num-m)",
  currency = true,
  currencyColor = "var(--ink-55)",
  className
}: InlineNumberProps) {
  return (
    <span className={cn("inline-flex items-baseline", className)} style={{ gap: 3 }}>
      <span className="slab tnum" style={{ fontSize: size, color }}>
        {value}
      </span>
      {currency && (
        <span className="mono" style={{ fontSize: 9, color: currencyColor }}>
          ₽
        </span>
      )}
    </span>
  );
}

// ─── Hair — 0.5px section divider ──────────────────────────
interface HairProps {
  color?: string;
  m?: string;
  className?: string;
}

export function Hair({ color = "var(--hair)", m = "0 var(--pad-x)", className }: HairProps) {
  return <div className={className} style={{ height: 0.5, background: color, margin: m }} />;
}

// ─── Banner — 4 kinds; 0.5px ink-80 frame + 2px accent left ─
type BannerKind = "warning" | "info" | "notice" | "success";

interface BannerProps {
  kind: BannerKind;
  title: string;
  note?: string;
  className?: string;
}

const BANNER_ACCENT: Record<BannerKind, string> = {
  warning: "var(--red)",
  info: "var(--blue)",
  notice: "var(--yellow)",
  success: "var(--ink)"
};

const BANNER_GLYPH: Record<BannerKind, GlyphShape> = {
  warning: "triangle",
  info: "circle",
  notice: "bar",
  success: "square"
};

export function Banner({ kind, title, note, className }: BannerProps) {
  return (
    <div
      className={className}
      style={{
        margin: "10px var(--pad-x) 4px",
        display: "grid",
        gridTemplateColumns: "2px auto 1fr",
        alignItems: "stretch",
        border: "0.5px solid var(--ink-80)"
      }}
    >
      <div style={{ background: BANNER_ACCENT[kind] }} />
      <div style={{ padding: "0 8px", display: "flex", alignItems: "center" }}>
        <Glyph shape={BANNER_GLYPH[kind]} fill="var(--ink)" size={8} />
      </div>
      <div
        style={{
          padding: "6px 10px 6px 0",
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap"
        }}
      >
        <span
          className="slab"
          style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {title}
        </span>
        {note && (
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            · {note}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── TabBar — 5 tabs, 2px ink active marker ────────────────
export interface TabItem {
  id: string;
  label: string;
  shape: GlyphShape;
}

interface TabBarProps {
  items: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function TabBar({ items, activeId, onSelect, className }: TabBarProps) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        borderTop: "0.5px solid var(--ink)",
        background: "var(--paper)"
      }}
    >
      {items.map((it) => {
        const active = it.id === activeId;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            className="tap-highlight"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "9px 0 7px",
              position: "relative",
              opacity: active ? 1 : 0.5,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            {active && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 18,
                  height: 2,
                  background: "var(--ink)"
                }}
              />
            )}
            <div style={{ height: 11, display: "flex", alignItems: "center" }}>
              <Glyph
                shape={it.shape}
                fill={active ? "var(--ink)" : "none"}
                stroke={active ? null : "var(--ink-80)"}
                size={10}
                sw={1}
              />
            </div>
            <span
              className="slab"
              style={{
                fontSize: 7.5,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: active ? "var(--ink)" : "var(--ink-55)"
              }}
            >
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── CTARow — 2-column primary/secondary screen footer ─────
interface CTAButton {
  label: string;
  shape: GlyphShape;
  onClick?: () => void;
  disabled?: boolean;
}

interface CTARowProps {
  primary: CTAButton;
  secondary?: CTAButton & { tone?: "blue" | "ink" };
  className?: string;
}

export function CTARow({ primary, secondary, className }: CTARowProps) {
  const secondaryTone = secondary?.tone ?? "blue";
  const secondaryColor = secondaryTone === "blue" ? "var(--blue)" : "var(--ink)";
  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: secondary ? "1fr 1fr" : "1fr",
        borderTop: "0.5px solid var(--ink)"
      }}
    >
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        className="tap-highlight"
        style={{
          padding: "12px 14px",
          background: primary.disabled ? "var(--ink-18)" : "var(--ink)",
          color: primary.disabled ? "var(--ink-35)" : "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          border: "none",
          cursor: primary.disabled ? "default" : "pointer",
          fontFamily: "inherit"
        }}
      >
        <Glyph
          shape={primary.shape}
          fill={primary.disabled ? "var(--ink-35)" : "var(--paper)"}
          size={8}
        />
        <span
          className="slab"
          style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          {primary.label}
        </span>
      </button>
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          disabled={secondary.disabled}
          className="tap-highlight"
          style={{
            padding: "12px 14px",
            background: "var(--paper)",
            color: secondary.disabled ? "var(--ink-35)" : secondaryColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            border: "none",
            borderLeft: "0.5px solid var(--ink)",
            cursor: secondary.disabled ? "default" : "pointer",
            fontFamily: "inherit"
          }}
        >
          <Glyph
            shape={secondary.shape}
            fill="none"
            stroke={secondary.disabled ? "var(--ink-35)" : secondaryColor}
            size={8}
            sw={1.2}
          />
          <span
            className="slab"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {secondary.label}
          </span>
        </button>
      )}
    </div>
  );
}

// ─── Settings primitives (from hifi-settings.jsx) ──────────

interface GroupProps {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}

export function Group({ title, note, children, className }: GroupProps) {
  return (
    <div
      className={className}
      style={{ padding: "14px var(--pad-x) 4px", borderTop: "0.5px solid var(--hair)" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8
        }}
      >
        <span className="eyebrow eyebrow--ink">{title}</span>
        {note && (
          <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)" }}>
            {note}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

interface RowProps {
  label: string;
  value?: React.ReactNode;
  dirty?: boolean;
  hint?: string;
  children?: React.ReactNode;
}

export function Row({ label, value, dirty, hint, children }: RowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        padding: "9px 0",
        borderTop: "0.5px solid var(--hair)",
        columnGap: 14
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {dirty && (
          <div style={{ width: 3, height: 3, background: "var(--red)", flexShrink: 0 }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "-0.005em" }}>
            {label}
          </span>
          {hint && (
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-55)", marginTop: 2 }}>
              {hint}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {children ?? (
          <span className="slab tnum" style={{ fontSize: 11, color: "var(--ink)" }}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

interface StepControlProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}

export function StepControl({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = ""
}: StepControlProps) {
  const stepBtnStyle: React.CSSProperties = {
    padding: "3px 8px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit"
  };
  return (
    <div style={{ display: "flex", alignItems: "center", border: "0.5px solid var(--ink-80)" }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        style={{ ...stepBtnStyle, borderRight: "0.5px solid var(--ink-80)" }}
      >
        <span className="slab" style={{ fontSize: 11 }}>−</span>
      </button>
      <span
        className="slab tnum"
        style={{ fontSize: 11, padding: "3px 10px", minWidth: 46, textAlign: "center" }}
      >
        {value}{suffix}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        style={{ ...stepBtnStyle, borderLeft: "0.5px solid var(--ink-80)" }}
      >
        <span className="slab" style={{ fontSize: 11 }}>+</span>
      </button>
    </div>
  );
}

interface SegOption<T extends string> {
  id: T;
  label: string;
}

interface SegControlProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
}

export function SegControl<T extends string>({ value, onChange, options }: SegControlProps<T>) {
  return (
    <div style={{ display: "flex", border: "0.5px solid var(--ink-80)" }}>
      {options.map((o, i) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: "4px 9px",
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink-55)",
              border: "none",
              borderLeft: i === 0 ? "none" : "0.5px solid var(--ink-80)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            <span
              className="slab"
              style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface SettingsCTAProps {
  dirty: boolean;
  onApply: () => void;
  onDiscard: () => void;
}

/**
 * SettingsCTA — Discard on LEFT (paper), Apply on RIGHT (ink).
 * Reversed vs CTARow on purpose — matches hifi-settings.jsx exactly:
 * the destructive commit (Apply) gets the heavier ink slot on the right.
 */
export function SettingsCTA({ dirty, onApply, onDiscard }: SettingsCTAProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        borderTop: "0.5px solid var(--ink)"
      }}
    >
      <button
        type="button"
        onClick={onDiscard}
        disabled={!dirty}
        className="tap-highlight"
        style={{
          padding: "12px 14px",
          background: "var(--paper)",
          color: dirty ? "var(--ink)" : "var(--ink-35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          border: "none",
          cursor: dirty ? "pointer" : "default",
          fontFamily: "inherit"
        }}
      >
        <Glyph shape="circle" fill="none" stroke={dirty ? "var(--ink)" : "var(--ink-35)"} size={8} sw={1.2} />
        <span
          className="slab"
          style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          Отменить
        </span>
      </button>
      <button
        type="button"
        onClick={onApply}
        disabled={!dirty}
        className="tap-highlight"
        style={{
          padding: "12px 14px",
          background: dirty ? "var(--ink)" : "var(--ink-18)",
          color: dirty ? "var(--paper)" : "var(--ink-35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          border: "none",
          borderLeft: "0.5px solid var(--ink)",
          cursor: dirty ? "pointer" : "default",
          fontFamily: "inherit"
        }}
      >
        <Glyph shape="square" fill={dirty ? "var(--paper)" : "var(--ink-35)"} size={8} />
        <span
          className="slab"
          style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          Применить
        </span>
      </button>
    </div>
  );
}
