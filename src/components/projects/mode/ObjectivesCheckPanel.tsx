"use client";

import { LuLoaderCircle, LuRefreshCw, LuScale, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { checkState, isWeakRow, type StoredObjectivesCheck } from "@/lib/generation/objectives-check-rules";
import { cn, formatDateTime, formatNaira } from "@/lib/utils";
import { ScoreRing } from "./ScoreRing";

const MODEL_LABEL: Record<string, string> = { "claude-opus-5-5": "Claude Opus 5.5" };

/**
 * The independent check of the aim and objectives on the COO's card (founder,
 * 30 Sept 2026): three teal rings for the set, then the aim and each
 * objective with its three scores and the judge's one-line reason. A row with
 * any score under 60 gets a gold note and the judge's suggestion. Low scores
 * warn; they never block approval.
 */
export function ObjectivesCheckPanel({
  check,
  running,
  currentKey,
  aim,
  objectives,
  canCheck,
  busy,
  onCheck,
}: {
  check: StoredObjectivesCheck | null;
  running: boolean;
  /** The key of what is on the card now: a stored check with another key is stale. */
  currentKey: string;
  aim: string;
  objectives: string[];
  canCheck: boolean;
  busy: boolean;
  onCheck: () => void;
}) {
  const state = checkState(check, running ? new Date(Date.now() + 60_000) : null, currentKey);
  const button = canCheck ? (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCheck}>
      <LuRefreshCw aria-hidden />
      {check ? "Check again" : "Check the aim and objectives"}
    </Button>
  ) : null;

  return (
    <section className="space-y-4 rounded-2xl bg-zone p-4 sm:p-5" aria-labelledby="objectives-check-heading">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <h3 id="objectives-check-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LuScale className="size-4 text-primary" aria-hidden />
            Independent check
          </h3>
          <p className="text-xs text-muted-foreground">
            {check?.status === "done"
              ? `${MODEL_LABEL[check.model ?? ""] ?? check.model ?? "Claude"} · ${formatDateTime(check.checkedAt)} · ${formatNaira(check.costNaira)}`
              : "A separate model scores how related, strong and achievable they are for this topic. It never sees how they were drafted."}
          </p>
        </div>
        {state !== "running" ? button : null}
      </div>

      {state === "running" ? (
        <p className="flex items-center gap-2 text-sm text-foreground" role="status" aria-live="polite">
          <LuLoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          Checking the aim and objectives independently… about half a minute.
        </p>
      ) : null}

      {state === "failed" ? (
        <p className="flex items-start gap-2 text-sm text-foreground" role="alert">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
          <span>The check did not finish{check?.error ? `: ${check.error}` : "."} Press Check again.</span>
        </p>
      ) : null}

      {state === "none" ? <p className="text-sm text-muted-foreground">Not checked yet.</p> : null}

      {check?.status === "done" && check.overall && state !== "running" ? (
        <div className={cn("space-y-4", state === "stale" && "opacity-70")}>
          {state === "stale" ? (
            <p className="flex items-start gap-2 text-sm text-foreground">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
              <span>Edited since this check: these scores are for the earlier version. Press Check again.</span>
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2 sm:gap-6">
            <ScoreRing label="Related" value={check.overall.related} dimmed={state === "stale"} />
            <ScoreRing label="Strong" value={check.overall.strong} dimmed={state === "stale"} />
            <ScoreRing label="Achievable" value={check.overall.achievable} dimmed={state === "stale"} />
          </div>
          <p className="text-sm text-foreground">{check.overall.summary}</p>
          <ol className="space-y-3">
            {check.rows.map((row) => {
              const text = row.index === 0 ? aim : objectives[row.index - 1];
              const weak = isWeakRow(row);
              return (
                <li key={row.index} className={cn("space-y-1 rounded-xl p-3", weak ? "bg-gold/10" : "bg-card")}>
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{row.index === 0 ? "Aim" : `Objective ${row.index}`}</span>
                    {text ? <span className="text-muted-foreground"> · {text.length > 110 ? `${text.slice(0, 109).trimEnd()}…` : text}</span> : null}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-foreground">
                    Related {row.related} · Strong {row.strong} · Achievable {row.achievable}
                  </p>
                  {row.reason ? <p className="text-xs text-muted-foreground">{row.reason}</p> : null}
                  {weak && row.suggestion ? (
                    <p className="flex items-start gap-1.5 text-xs text-foreground">
                      <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
                      <span>
                        <span className="font-medium">Suggestion:</span> {row.suggestion}
                      </span>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
