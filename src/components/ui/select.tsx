import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Native <select>, styled to match Input. The brand spec calls for native
 * selects on mobile — they give the OS picker, correct touch targets and
 * zero JS — so the whole app uses this rather than a custom listbox.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "flex h-12 w-full appearance-none rounded-lg border border-border bg-input px-3 pr-9 text-base text-foreground transition-colors",
        "focus-visible:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
      aria-hidden
    />
  </div>
));
Select.displayName = "Select";

export { Select };
