import { LuCheck } from "react-icons/lu";
import { cn } from "@/lib/utils";
import type { StepDef } from "@/lib/intake-templates";

/**
 * Multi-step progress. Step markers are fills, not outlined circles: done is
 * solid teal with a tick, current is a teal tint, upcoming is a quiet zone.
 */
export function FormProgress({ steps, current }: { steps: StepDef[]; current: number }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-muted-foreground">
        Step <span className="font-mono tabular-nums">{current + 1}</span> of{" "}
        <span className="font-mono tabular-nums">{steps.length}</span> · {steps[current].label}
      </p>
      <ol className="mt-2.5 flex items-center gap-1.5" aria-label="Form progress">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
          return (
            <li key={s.id} className="flex flex-1 items-center gap-1.5" aria-current={state === "current" ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "current" && "bg-primary/15 text-primary",
                  state === "upcoming" && "bg-zone text-muted-foreground"
                )}
              >
                {state === "done" ? <LuCheck className="size-3.5" aria-hidden /> : i + 1}
                <span className="sr-only"> {s.label}</span>
              </span>
              {i < steps.length - 1 ? (
                <span className={cn("h-0.5 flex-1 rounded-full", i < current ? "bg-primary" : "bg-border")} aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
