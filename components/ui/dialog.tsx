"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * Dialog — paper card with 1px ink frame; no shadow, no rounded.
 * Header / Body / Footer are explicit slots so callers can compose
 * the hi-fi pattern (eyebrow header → mono body → CTARow footer).
 * Close button is an inline X glyph (no lucide-react dep).
 */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, style, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50", className)}
    style={{ background: "rgba(20,18,13,0.18)", ...style }}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 outline-none",
        className
      )}
      style={{
        background: "var(--paper)",
        border: "1px solid var(--ink)",
        ...style
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="tap-highlight absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center"
        style={{
          background: "transparent",
          border: "0.5px solid var(--ink-80)",
          cursor: "pointer"
        }}
      >
        <svg width="9" height="9" style={{ display: "block" }}>
          <line x1="1" y1="1" x2="8" y2="8" stroke="var(--ink)" strokeWidth="1" />
          <line x1="8" y1="1" x2="1" y2="8" stroke="var(--ink)" strokeWidth="1" />
        </svg>
        <span className="sr-only">Закрыть</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-2 pr-9", className)}
    style={{
      padding: "12px 18px 10px",
      borderBottom: "0.5px solid var(--hair)",
      ...style
    }}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogBody = ({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-3", className)}
    style={{ padding: "14px 18px", ...style }}
    {...props}
  />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, style, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("slab uppercase", className)}
    style={{ fontSize: 11, letterSpacing: "0.14em", ...style }}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, style, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mono", className)}
    style={{ fontSize: 10, lineHeight: 1.5, color: "var(--ink-55)", ...style }}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogTrigger
};
