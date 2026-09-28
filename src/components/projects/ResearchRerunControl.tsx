"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuBookOpen, LuLoaderCircle, LuRotateCcw, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { RESEARCH_LOCKED_TOOLTIP } from "@/lib/generation/orchestrator-rules";

const CONFIRM = "The research is run again from scratch: the references found so far are replaced by what the new search keeps. It spends credits.";

/**
 * Phase D9: the project's research on the admin Report tab, with "Re-run
 * research" for the founder and the COO. Once any chapter exists the button
 * stays on screen, greyed out: a re-run would delete the references the
 * chapters were written from. Phones have no hover, so the sentence of the
 * tooltip is also written under the button.
 */
export function ResearchRerunControl({
  endpoint,
  references,
  research,
  generationStarted,
}: {
  /** /api/admin/projects/<code>/research/rerun */
  endpoint: string;
  references: number;
  research: "PASSED" | "RUNNING" | "FAILED" | "NONE";
  generationStarted: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [started, setStarted] = React.useState(false);
  const running = research === "RUNNING" || started;
  const locked = generationStarted;
  const hintId = React.useId();

  // While a run is going, look again every 10 seconds so the count and the button come back by themselves.
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [running, router]);
  React.useEffect(() => {
    if (research !== "RUNNING") setStarted(false);
  }, [research, references]);

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "That didn't work. Try again.");
        return;
      }
      setAsking(false);
      setStarted(true);
      router.refresh();
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const summary =
    research === "NONE"
      ? "No research has been run for this project."
      : running
        ? "The research is running."
        : research === "FAILED"
          ? "The last research run needs a review."
          : null;

  return (
    <section className="space-y-3 rounded-2xl bg-zone p-4 sm:p-5" aria-labelledby="research-heading" data-research-control data-locked={locked ? "true" : "false"}>
      <div className="space-y-1.5">
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <LuBookOpen className="size-4" aria-hidden />
          Research
        </p>
        <h3 id="research-heading" className="text-[15px] font-semibold text-foreground">
          <span className="font-mono tabular-nums">{references}</span> verified reference{references === 1 ? "" : "s"}
        </h3>
        {summary ? <p className="text-sm text-muted-foreground">{summary}</p> : null}
      </div>

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {asking && !locked ? (
        <div className="space-y-3" role="group" aria-label="Confirm">
          <p className="max-w-prose text-sm text-foreground">{CONFIRM}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => void rerun()} disabled={busy} className="h-12 w-full sm:h-10 sm:w-auto" data-research-confirm>
              {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuRotateCcw aria-hidden />}
              Re-run research
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)} disabled={busy} className="h-12 w-full sm:h-10 sm:w-auto">
              Not now
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* The span carries the tooltip: a disabled button takes no pointer events of its own. */}
          <span className="inline-block w-full sm:w-auto" title={locked ? RESEARCH_LOCKED_TOOLTIP : undefined}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAsking(true)}
              disabled={locked || running}
              aria-disabled={locked || running}
              aria-describedby={locked ? hintId : undefined}
              className="h-12 w-full sm:h-10 sm:w-auto"
              data-research-rerun
            >
              {running && !locked ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuRotateCcw aria-hidden />}
              Re-run research
            </Button>
          </span>
          {locked ? (
            <p id={hintId} className="text-xs text-muted-foreground" data-research-locked-hint>
              {RESEARCH_LOCKED_TOOLTIP}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
