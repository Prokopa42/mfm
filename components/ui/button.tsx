"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Button — standalone hi-fi action.
 * Two variants: primary (ink/paper) and secondary (paper/blue).
 * Inside CTARow the buttons are rendered inline by the row itself
 * (different border treatment), so this atom is for dialogs and
 * occasional standalone CTAs.
 */
type Variant = "primary" | "secondary";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", style, disabled, ...props }, ref) => {
    const variantStyle: React.CSSProperties =
      variant === "primary"
        ? {
            background: disabled ? "var(--ink-18)" : "var(--ink)",
            color: disabled ? "var(--ink-35)" : "var(--paper)"
          }
        : {
            background: "var(--paper)",
            color: disabled ? "var(--ink-35)" : "var(--blue)"
          };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "tap-highlight slab inline-flex cursor-pointer items-center justify-center gap-2 px-3 py-3 text-[11px] uppercase tracking-[0.08em] disabled:cursor-default",
          className
        )}
        style={{
          border: "1px solid var(--ink)",
          fontFamily: "inherit",
          ...variantStyle,
          ...style
        }}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
