import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PipelineSummary, StageAlert } from "@/lib/services/operations/pipeline";

const RAIL: Record<StageAlert["tone"], string> = {
  normal: "bg-primary",
  amber: "bg-gold",
  red: "bg-danger",
};

const ALERT_TEXT: Record<StageAlert["tone"], string> = {
  normal: "text-muted-foreground",
  amber: "text-gold",
  red: "text-danger",
};

/**
 * The COO's pipeline overview: eight stages on one rail, a count under
 * each, and what needs a look ("overdue 1", "unassigned 2") beneath the
 * count. Every stage is a link that filters the table below to that stage;
 * the selected stage links back to the whole list. Scrolls sideways inside
 * itself on phones.
 */
export function OpsPipelineBar({ summary, activeStage }: { summary: PipelineSummary; activeStage?: string }) {
  return (
    <section aria-labelledby="ops-pipeline-heading" className="rounded-2xl bg-zone px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ops-pipeline-heading" className="text-[15px] font-semibold text-foreground">
          Pipeline overview
        </h2>
        <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{summary.total} on the board</span>
      </div>

      <div className="no-scrollbar -mx-4 mt-5 overflow-x-auto px-4 max-lg:mask-fade-x sm:-mx-6 sm:px-6">
        <ol className="flex min-w-[44rem] lg:min-w-0">
          {summary.stages.map((stage) => {
            const live = stage.count > 0;
            const selected = activeStage === stage.key;
            const alerts = stage.alerts.filter((a) => a.count > 0);
            return (
              <li key={stage.key} className="min-w-0 flex-1">
                <Link
                  href={selected ? "/admin/projects" : `/admin/projects?stage=${stage.key}`}
                  aria-current={selected ? "true" : undefined}
                  aria-label={`${stage.label}: ${stage.count} project${stage.count === 1 ? "" : "s"}${alerts.map((a) => `, ${a.count} ${a.label}`).join("")}`}
                  className={cn(
                    "group/stage flex flex-col rounded-lg px-1.5 pb-1 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-card shadow-soft"
                  )}
                >
                  <span className={cn("truncate text-[12px] font-medium transition-colors", live ? "text-foreground" : "text-muted-foreground group-hover/stage:text-foreground")}>
                    {stage.short}
                  </span>
                  <span className={cn("mt-1 font-mono text-lg font-medium leading-none tabular-nums", live ? "text-foreground" : "text-subtle")}>{stage.count}</span>
                  <span className="mt-1.5 flex min-h-[1rem] flex-wrap gap-x-2 text-[11px] leading-tight">
                    {alerts.map((a) => (
                      <span key={a.label} className={cn("font-mono tabular-nums", ALERT_TEXT[a.tone])}>
                        {a.label} {a.count}
                      </span>
                    ))}
                  </span>
                </Link>
                <span aria-hidden className="relative mt-2 block h-[3px] bg-border">
                  {live ? <span className={cn("absolute inset-y-0 left-0 block w-full", RAIL[stage.tone])} /> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-4 bg-primary" /> on track
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-4 bg-gold" /> sitting too long or near a deadline
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-4 bg-danger" /> overdue or at the correction limit
        </span>
      </p>
    </section>
  );
}
