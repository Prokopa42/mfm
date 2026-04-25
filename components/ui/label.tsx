import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Label — eyebrow-style label. Slab 9px UPPER, 0.18em letter-spacing,
 * ink-55. Colour can be promoted to ink via `eyebrow--ink` class.
 */
const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn("eyebrow", className)} {...props} />
));
Label.displayName = "Label";

export { Label };
