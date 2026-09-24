import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A tappable checkbox row: the control and its sentence share one zone-filled
 * target, tall enough for a thumb. Used for the terms box and for multi-select
 * answers — no borders, no new visual language.
 */
export const CheckboxRow = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { children: React.ReactNode }
>(function CheckboxRow({ className, children, ...props }, ref) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-zone p-4 transition-colors hover:bg-zone/70",
        className
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary"
        {...props}
      />
      <span className="text-sm text-foreground">{children}</span>
    </label>
  );
});
