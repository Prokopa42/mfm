import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border-2 border-[var(--ink)] px-2.5 py-1 text-xs font-black uppercase",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] text-[var(--paper)]",
        yellow: "border-[var(--yellow-line)] bg-[var(--paper-3)] text-[var(--ink)]",
        blue: "border-[var(--blue-line)] bg-[var(--paper-3)] text-[var(--blue)]",
        red: "border-[var(--red-line)] bg-[var(--paper-3)] text-[var(--red)]",
        outline: "bg-transparent text-[var(--ink)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
