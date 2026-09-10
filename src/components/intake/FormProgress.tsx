import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepDef } from "@/lib/intake-templates";

export function FormProgress({ steps, current }: { steps: StepDef[]; current: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">
        Step {current + 1} of {steps.length} · {steps[current].label}
      </p>
      <ol className="mt-2 flex items-center gap-1.5">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
          return (
            <li key={s.id} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary text-primary",
                  state === "upcoming" && "border-border text-muted-foreground"
                )}
              >
                {state === "done" ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {i < steps.length - 1 ? (
                <span
                  className={cn("h-0.5 flex-1 rounded-full", i < current ? "bg-primary" : "bg-border")}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
