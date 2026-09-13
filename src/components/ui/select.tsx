import * as React from "react";
import { LuChevronDown } from "react-icons/lu";
import { fieldClasses } from "@/components/ui/input";
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
      className={cn("flex h-12 appearance-none px-3.5 pr-9", fieldClasses, className)}
      {...props}
    >
      {children}
    </select>
    <LuChevronDown
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
      aria-hidden
    />
  </div>
));
Select.displayName = "Select";

export { Select };
