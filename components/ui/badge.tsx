import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Badge — eyebrow chip from hifi-app PageHead navigation chips.
 * Two visual states: active (ink-on-paper) and inactive (hairline outline).
 * No `variant` color system — color is signal-only and lives elsewhere.
 */
interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

function Badge({ className, active = false, style, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "slab inline-flex items-center px-[9px] py-[5px] text-[9px] uppercase tracking-[0.14em]",
        className
      )}
      style={{
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink-55)",
        border: active ? "1px solid var(--ink)" : "0.5px solid var(--ink-35)",
        ...style
      }}
      {...props}
    />
  );
}

export { Badge };
