import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea — multiline counterpart of Input. Hairline-only, paper bg,
 * mono 11px, vertical resize.
 */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, ...props }, ref) => {
    return (
      <textarea
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
          minHeight: 80,
          resize: "vertical",
          ...style
        }}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
