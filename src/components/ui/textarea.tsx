import * as React from "react";
import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Multi-line field — same fill, edge and focus ring as Input. */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn("block min-h-[96px] px-3.5 py-3 leading-relaxed", fieldClasses, className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
