import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input — hairline-only field. No frame, no rounded, no shadow.
 * Bottom border 0.5px ink-80; mono 11px text. Matches the spirit of
 * row-level inputs in hifi-* (no actual text inputs in those mocks,
 * pattern derived from StepControl/SegControl visual weight).
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "mono w-full px-1 py-2 text-[11px] outline-none placeholder:text-[var(--ink-35)] disabled:opacity-50",
          className
        )}
        style={{
          background: "transparent",
          color: "var(--ink)",
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          borderBottom: "0.5px solid var(--ink-80)",
          borderRadius: 0,
          ...style
        }}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
