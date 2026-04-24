import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  tone?: "ink" | "blue" | "red" | "yellow";
}

const toneClass = {
  ink: "bg-[var(--ink)]",
  blue: "bg-[var(--blue-line)]",
  red: "bg-[var(--red-line)]",
  yellow: "bg-[var(--yellow-line)]"
};

function Progress({ className, value, tone = "ink", ...props }: ProgressProps) {
  return (
    <div
      className={cn("h-3 w-full overflow-hidden border-2 border-[var(--ink)] bg-[var(--paper-2)]", className)}
      {...props}
    >
      <div
        className={cn("h-full transition-all", toneClass[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export { Progress };
