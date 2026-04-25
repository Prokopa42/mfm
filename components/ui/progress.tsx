import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Progress — 3px hairline track + ink (or accent) fill.
 * Matches CushionBlock / GoalRow progress in hifi-savings.jsx:
 *   {flex:1, height:3, background:'var(--thin)',
 *    border:'0.5px solid var(--hair)', position:'relative'}
 *   inner: {position:'absolute', left:0, top:-0.5, bottom:-0.5,
 *           width:`${pct}%`, background:'var(--ink)|status-color'}
 */
interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  tone?: "ink" | "blue" | "red";
}

const TONE: Record<NonNullable<ProgressProps["tone"]>, string> = {
  ink: "var(--ink)",
  blue: "var(--blue)",
  red: "var(--red)"
};

function Progress({ className, value, tone = "ink", style, ...props }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("relative w-full", className)}
      style={{
        height: 3,
        background: "var(--thin)",
        border: "0.5px solid var(--hair)",
        ...style
      }}
      {...props}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: -0.5,
          bottom: -0.5,
          width: `${pct}%`,
          background: TONE[tone]
        }}
      />
    </div>
  );
}

export { Progress };
