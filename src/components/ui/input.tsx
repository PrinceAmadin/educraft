import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared field styling — Input, Select and Textarea all read from here so a
 * change to field affordance happens in one place. Light neutral fill, a
 * faint 1px edge, and a teal focus ring. No ring offset: an offset draws a
 * second box around the field, which is exactly what the system avoids.
 */
export const fieldClasses = cn(
  "w-full rounded-lg border border-input-border bg-input text-base text-foreground transition-[border-color,box-shadow,background-color] duration-fast",
  "placeholder:text-subtle",
  "hover:border-border-hover",
  "focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20",
  "aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:ring-danger/20",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // 48px on mobile-first forms per spec; 44px minimum touch target
        "flex h-12 px-3.5 py-2",
        fieldClasses,
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
