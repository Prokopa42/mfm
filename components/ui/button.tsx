"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "tap-highlight inline-flex h-10 items-center justify-center whitespace-nowrap border-2 border-[var(--ink)] px-4 py-2 text-sm font-black uppercase transition active:translate-x-[1px] active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] text-[var(--paper)] shadow-blockSm hover:bg-[var(--ink-2)]",
        secondary: "border-[var(--yellow-line)] bg-[var(--paper-3)] text-[var(--ink)] shadow-blockSm hover:bg-[var(--yellow-soft)]",
        blue: "border-[var(--blue-line)] bg-[var(--paper-3)] text-[var(--blue)] shadow-blockSm hover:bg-[var(--blue-soft)]",
        outline: "bg-transparent text-[var(--ink)] hover:bg-[var(--paper-2)]",
        danger: "border-[var(--red-line)] bg-[var(--paper-3)] text-[var(--red)] shadow-blockSm hover:bg-[var(--red-soft)]",
        critical: "bg-[var(--red)] text-[var(--paper)] shadow-blockSm hover:brightness-95",
        ghost: "border-transparent bg-transparent text-[var(--ink)] hover:bg-[var(--paper-2)]"
      },
      size: {
        default: "h-10",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "h-10 w-10 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
