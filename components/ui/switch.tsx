"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Switch — controlled toggle. Direct port of `Toggle` in
 * design/final/МФМ/hifi-settings.jsx (28×14 outer, 10×10 thumb,
 * ink-on / paper-thumb on, transparent-bg / ink-thumb off).
 *
 * API kept Radix-style (`checked` / `onCheckedChange`) so the existing
 * settings-screen consumption keeps type-checking until step 7.
 * Drops the @radix-ui/react-switch dependency in favour of a plain
 * native button — no portals or focus traps needed.
 */
interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { checked, onCheckedChange, disabled = false, className, "aria-label": ariaLabel },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn("relative", className)}
        style={{
          width: 28,
          height: 14,
          padding: 0,
          background: checked ? "var(--ink)" : "transparent",
          border: "0.5px solid var(--ink-80)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 1.5,
            left: checked ? 14 : 1.5,
            width: 10,
            height: 10,
            background: checked ? "var(--paper)" : "var(--ink)",
            transition: "left .1s"
          }}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
