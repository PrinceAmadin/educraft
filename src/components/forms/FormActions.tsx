import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The submit row at the end of a dashboard form.
 *
 * On phones it sticks above the fixed bottom navigation (56px + safe area) so
 * the primary action is always in reach, lifted by a soft upward shadow rather
 * than a rule. From md up it is an ordinary row at the end of the form.
 */
export function FormActions({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-20 -mx-4 flex items-center justify-end gap-3 bg-background/95 px-4 py-3 shadow-[0_-12px_24px_-18px_rgb(15_23_42/0.25)] backdrop-blur",
        "md:static md:mx-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none",
        className
      )}
    >
      {children}
    </div>
  );
}
