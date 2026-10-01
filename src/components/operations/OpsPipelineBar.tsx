import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PipelineSummary, StageAlert } from "@/lib/services/operations/pipeline";

/** Dot colour per tone (amber alerts and the two red ones — overdue, at the limit). */
const DOT: Record<StageAlert["tone"], string> = {
  normal: "bg-primary",
  amber: "bg-gold",
  red: "bg-danger",
};

const ALERT_TEXT: Record<StageAlert["tone"], string> = {
  normal: "text-muted-foreground",
  amber: "text-gold",
  red: "text-danger",
};

/** Friendlier wording for the terse data labels; anything not here is shown as-is. */
const ALERT_PHRASE: Record<string, string> = {
  "round 3": "at the limit",
  "over 24h": "in QA over 24h",
  "past 7 days": "ready to close",
};
const phrase = (label: string) => ALERT_PHRASE[label] ?? label;

/**
 * The COO's pipeline overview: the eight stages as a calm grid of tiles
 * (two across on phones, up to eight on wide screens — never a sideways
 * scroll). Each tile shows the stage, its count, and a plain pill ("1
 * overdue", "2 unassigned") only when something there needs a look, so busy
 * stages stand out and empty ones stay quiet. Every tile links to the list
 * filtered to that stage; the selected tile links back to the whole list.
 */
export function OpsPipelineBar({ summary, activeStage }: { summary: PipelineSummary; activeStage?: string }) {
  const active = activeStage ? summary.stages.find((s) => s.key === activeStage) : undefined;

  return (
    <section aria-labelledby="ops-pipeline-heading" className="rounded-2xl bg-zone px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ops-pipeline-heading" className="text-[15px] font-semibold text-foreground">
          Pipeline overview
        </h2>
        <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{summary.total} on the board</span>
      </div>

      <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {summary.stages.map((stage) => {
          const live = stage.count > 0;
          const selected = activeStage === stage.key;
          const alerts = stage.alerts.filter((a) => a.count > 0);
          return (
            <li key={stage.key} className="min-w-0">
              <Link
                href={selected ? "/admin/projects" : `/admin/projects?stage=${stage.key}`}
                aria-current={selected ? "true" : undefined}
                aria-label={`${stage.label}: ${stage.count} project${stage.count === 1 ? "" : "s"}${alerts
                  .map((a) => `, ${a.count} ${phrase(a.label)}`)
                  .join("")}`}
                className={cn(
                  "group/stage flex h-full min-h-[5rem] flex-col gap-1 rounded-xl px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  live || selected ? "bg-card shadow-soft" : "hover:bg-card",
                  selected && "ring-2 ring-primary"
                )}
              >
                <span
                  className={cn(
                    "line-clamp-2 text-[12px] font-medium leading-tight transition-colors",
                    live ? "text-foreground" : "text-muted-foreground group-hover/stage:text-foreground"
                  )}
                >
                  {stage.label}
                </span>

                <div className="mt-auto space-y-1">
                  <span className={cn("block font-mono text-2xl font-medium leading-none tabular-nums", live ? "text-foreground" : "text-subtle")}>
                    {stage.count}
                  </span>
                  {alerts.length > 0 ? (
                    <span className="flex flex-col gap-0.5">
                      {alerts.map((a) => (
                        <span key={a.label} className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium leading-tight", ALERT_TEXT[a.tone])}>
                          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[a.tone])} />
                          {a.count} {phrase(a.label)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-[13px] text-muted-foreground">
        {active
          ? `Showing ${active.label} only — tap it again to clear.`
          : "Tap a stage to see just those projects."}
      </p>
    </section>
  );
}
