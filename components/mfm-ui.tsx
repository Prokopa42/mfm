import { AlertTriangle, Circle, Square } from "lucide-react";
import { stateLabel, stateText } from "@/lib/calculations";
import type { InterfaceState, MandatoryPayment } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";

export function Panel({
  children,
  className,
  tone = "plain"
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "yellow" | "blue" | "red" | "ink";
}) {
  const toneClass = {
    plain: "bg-[var(--paper-3)] text-[var(--ink)]",
    yellow: "border-l-[6px] border-l-[var(--yellow-line)] bg-[var(--paper-3)] text-[var(--ink)]",
    blue: "border-l-[6px] border-l-[var(--blue-line)] bg-[var(--paper-3)] text-[var(--ink)]",
    red: "border-l-[6px] border-l-[var(--red-line)] bg-[var(--paper-3)] text-[var(--ink)]",
    ink: "bg-[var(--ink)] text-[var(--paper)]"
  };

  return <section className={cn("border-2 border-[var(--ink)]", toneClass[tone], className)}>{children}</section>;
}

export function SectionTitle({
  title,
  eyebrow,
  className
}: {
  title: string;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={cn("border-b-2 border-[var(--ink)] pb-3", className)}>
      {eyebrow ? <div className="text-xs font-black uppercase text-[var(--muted-ink)]">{eyebrow}</div> : null}
      <h1 className="slab mt-1 text-2xl uppercase leading-none">{title}</h1>
    </div>
  );
}

export function MoneyNumber({
  value,
  size = "lg",
  tone = "ink",
  strike = false,
  className
}: {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "ink" | "blue" | "red" | "muted" | "paper";
  strike?: boolean;
  className?: string;
}) {
  const sizeClass = {
    sm: "text-xl",
    md: "text-3xl",
    lg: "text-5xl",
    xl: "text-7xl"
  };
  const toneClass = {
    ink: "text-[var(--ink)]",
    blue: "text-[var(--blue)]",
    red: "text-[var(--red)]",
    muted: "text-[var(--muted-ink)]",
    paper: "text-[var(--paper)]"
  };

  return (
    <span className={cn("slab relative inline-block leading-none", sizeClass[size], toneClass[tone], className)}>
      {formatMoney(value)} <span className="text-[0.45em]">₽</span>
      {strike ? <span className="absolute left-0 right-0 top-1/2 h-1 bg-[var(--red)]" /> : null}
    </span>
  );
}

export function StateBanner({
  state,
  nextMandatoryPayment,
  className
}: {
  state: InterfaceState;
  nextMandatoryPayment?: MandatoryPayment;
  className?: string;
}) {
  if (state === "normal") return null;

  const critical = state === "cash-risk";
  const tone = state === "payday-arrived" ? "blue" : state === "cash-risk" || state === "savings-off-track" ? "red" : "yellow";
  const iconColor = critical ? "text-[var(--paper)]" : tone === "blue" ? "text-[var(--blue)]" : tone === "red" ? "text-[var(--red)]" : "text-[var(--yellow-line)]";

  return (
    <Panel tone={tone} className={cn("flex items-start gap-3 p-3", critical && "border-l-0 bg-[var(--red)] text-[var(--paper)]", className)}>
      <StateGlyph state={state} className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
      <div>
        <div className="slab text-xs uppercase">{stateLabel(state)}</div>
        <div className="mt-1 text-sm leading-snug">{stateText(state, nextMandatoryPayment)}</div>
      </div>
    </Panel>
  );
}

export function StateGlyph({ state, className }: { state: InterfaceState; className?: string }) {
  if (state === "cash-risk" || state === "savings-off-track") {
    return <AlertTriangle className={className} aria-hidden="true" />;
  }
  if (state === "payday-arrived") {
    return <Circle className={className} aria-hidden="true" />;
  }
  return <Square className={className} aria-hidden="true" />;
}

export function Metric({
  label,
  value,
  tone = "ink",
  info
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ink" | "blue" | "red" | "muted";
  info?: string;
}) {
  const toneClass = {
    ink: "text-[var(--ink)]",
    blue: "text-[var(--blue)]",
    red: "text-[var(--red)]",
    muted: "text-[var(--muted-ink)]"
  };

  return (
    <div className="min-w-0 border-r-2 border-[var(--ink)] p-3 last:border-r-0">
      <div className="flex items-center gap-1 text-xs font-black uppercase text-[var(--muted-ink)]">
        <span>{label}</span>
        {info ? <InfoHint text={info} /> : null}
      </div>
      <div className={cn("slab mt-1 truncate text-base uppercase", toneClass[tone])}>{value}</div>
    </div>
  );
}

export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("group relative inline-flex align-middle", className)}>
      <span
        tabIndex={0}
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center border-2 border-[var(--ink)] text-[10px] font-black leading-none text-[var(--ink)]"
      >
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-56 -translate-x-1/2 border-2 border-[var(--ink)] bg-[var(--paper-3)] p-2 text-left text-xs font-normal normal-case leading-snug text-[var(--ink)] shadow-blockSm group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 border-dashed border-[var(--thin)] p-4 text-sm text-[var(--muted-ink)]">
      {children}
    </div>
  );
}
