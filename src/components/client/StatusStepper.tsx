import { LuCheck } from "react-icons/lu";
import { cn } from "@/lib/utils";
import type { ClientStep } from "@/lib/client-progress";

/** One rail: done steps filled, the current one ringed, the rest quiet. */
export function StatusStepper({ steps }: { steps: ClientStep[] }) {
  return (
    <ol aria-label="Project steps">
      {steps.map((step, i) => {
        const done = step.state === "done";
        const current = step.state === "current";
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="flex gap-3.5" aria-current={current ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  current && "bg-primary/12 text-primary ring-2 ring-primary",
                  !done && !current && "bg-zone text-muted-foreground"
                )}
              >
                {done ? <LuCheck className="size-4" aria-hidden /> : i + 1}
              </span>
              {!last ? (
                <span className={cn("w-0.5 flex-1 rounded-full", done ? "bg-primary" : "bg-zone")} style={{ minHeight: 22 }} aria-hidden />
              ) : null}
            </div>
            <div className={cn("min-w-0", last ? "pb-0" : "pb-5")}>
              <p
                className={cn(
                  "pt-1 text-[15px] leading-snug",
                  current ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
                <span className="sr-only">{done ? " (done)" : current ? " (now)" : ""}</span>
              </p>
              {step.detail ? (
                <p className={cn("mt-0.5 text-[13px]", current ? "text-gold" : "text-muted-foreground")}>{step.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
