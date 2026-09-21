"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { LuCheck } from "react-icons/lu";
import { baseOptionLabel } from "@/lib/service-groups";
import { cn, formatNaira } from "@/lib/utils";
import type { IntakeSubmitInput } from "@/lib/validations/intake";

export interface ServiceVariantProp {
  id: string;
  name: string;
  priceAddon: number;
}

/**
 * The package choice for a service that has one (e.g. a final year report with
 * or without data analysis). Each option shows its own total, so the price the
 * student sees here is the price they pay.
 */
export function VariantField({ basePrice, variants }: { basePrice: number; variants: ServiceVariantProp[] }) {
  const { watch, setValue } = useFormContext<IntakeSubmitInput>();
  const chosen = watch("serviceVariantId") || "";
  const options = [
    { id: "", name: baseOptionLabel(variants), total: basePrice },
    ...variants.map((v) => ({ id: v.id, name: v.name, total: basePrice + v.priceAddon })),
  ];

  return (
    <fieldset className="space-y-3">
      <legend className="text-base font-semibold tracking-tight text-foreground">Choose your option</legend>
      <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
        {options.map((o) => {
          const on = chosen === o.id;
          return (
            <button
              key={o.id || "base"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setValue("serviceVariantId", o.id, { shouldDirty: true })}
              className={cn(
                "flex min-h-14 items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors",
                on ? "bg-primary/10 ring-2 ring-primary" : "bg-zone ring-1 ring-inset ring-input-border hover:bg-elevated"
              )}
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full",
                    on ? "bg-primary text-primary-foreground" : "bg-background ring-1 ring-inset ring-input-border"
                  )}
                >
                  {on ? <LuCheck className="size-3" /> : null}
                </span>
                <span className="text-[15px] font-medium text-foreground">{o.name}</span>
              </span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">{formatNaira(o.total)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
