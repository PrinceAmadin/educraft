"use client";

/**
 * Phase D10: the four new panels below the existing AI usage page.
 *
 * - MonthlySummaryCard: this month's total, daily burn, projected month-end,
 *   days remaining and the threshold with a progress bar.
 * - AlertThresholdForm: sets the founder's monthly threshold (SUPER_ADMIN only).
 * - PerSubsystemBreakdown: ₦ and tokens grouped by the six known subsystems
 *   (plus D10's preliminary_pages, plus "other" for anything unclassified).
 * - PerProjectCostTable: one row per project with a Claude call this month.
 */

import * as React from "react";
import { LuArrowRight, LuBell, LuCheck, LuTriangleAlert, LuX } from "react-icons/lu";
import Link from "next/link";
import type { KnownSubsystem, MonthlySummary, PerProjectCost, SubsystemCost } from "@/lib/services/ai-usage";
import { cn, formatNaira } from "@/lib/utils";

const num = (n: number) => new Intl.NumberFormat("en-NG").format(n);

const SUBSYSTEM_LABEL: Record<KnownSubsystem, string> = {
  research_pipeline: "Research pipeline",
  source_stage: "Objectives & sources (D3b)",
  chapter_generation: "Chapter generation (D2)",
  quality_gate: "Quality gate (D8)",
  data_pause: "Data pauses (D3c)",
  secondary_data: "Secondary data fetcher (D5)",
  preliminary_pages: "Preliminary pages (D10)",
  other: "Other",
};

export function MonthlySummaryCard({ summary }: { summary: MonthlySummary }) {
  const threshold = summary.thresholdNaira ?? 0;
  const percent = threshold > 0 ? Math.min(100, Math.round((summary.monthlyTotal / threshold) * 100)) : null;
  const overThreshold = threshold > 0 && summary.monthlyTotal >= threshold;
  const barTone = percent === null ? "bg-primary" : overThreshold ? "bg-danger" : percent >= 80 ? "bg-gold" : "bg-primary";
  return (
    <section className="rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="monthly-heading" data-monthly-summary>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="monthly-heading" className="text-[15px] font-semibold text-foreground">
          This month
        </h2>
        <span className="text-xs text-muted-foreground">
          {summary.daysElapsed} of {summary.daysInMonth} days &middot; {summary.daysRemaining} left
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <StatBlock label="Month to date" value={formatNaira(summary.monthlyTotal)} big />
        <StatBlock label="Daily burn" value={`${formatNaira(summary.dailyBurn)} / day`} />
        <StatBlock label="Projected month-end" value={formatNaira(summary.projectedMonthEnd)} />
        <StatBlock label="Threshold" value={threshold > 0 ? formatNaira(threshold) : "not set"} detail={overThreshold ? "Alert sent this month" : undefined} />
      </dl>
      {percent !== null ? (
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zone">
            <div className={cn("h-full transition-all", barTone)} style={{ width: `${percent}%` }} data-monthly-bar />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {overThreshold ? (
              <span className="inline-flex items-center gap-1 text-danger">
                <LuTriangleAlert className="size-3.5" aria-hidden /> {percent}% of the threshold used
              </span>
            ) : (
              <>{percent}% of the threshold used</>
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function AlertThresholdForm({ initial, canEdit }: { initial: number | null; canEdit: boolean }) {
  const [value, setValue] = React.useState<string>(initial ? String(initial) : "");
  const [busy, setBusy] = React.useState(false);
  const [state, setState] = React.useState<null | { kind: "ok"; message: string } | { kind: "error"; message: string }>(null);

  const submit = async (thresholdNaira: number | null) => {
    setBusy(true);
    setState(null);
    try {
      const res = await fetch("/api/admin/token-usage/set-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholdNaira }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; thresholdNaira?: number | null };
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? `The threshold did not save (HTTP ${res.status}).` });
        return;
      }
      setState({ kind: "ok", message: body.thresholdNaira ? `Threshold set to ${formatNaira(body.thresholdNaira)}.` : "Threshold cleared." });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "The threshold did not save." });
    } finally {
      setBusy(false);
    }
  };

  const parsed = value.trim() === "" ? null : Number(value.replace(/[^\d]/g, ""));
  const invalid = value.trim() !== "" && (!Number.isFinite(parsed) || (parsed ?? 0) <= 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canEdit || busy || invalid) return;
        void submit(parsed ?? null);
      }}
      aria-labelledby="threshold-heading"
      className="rounded-2xl bg-card p-5 shadow-soft"
      data-threshold-form
    >
      <div className="flex items-center gap-2">
        <LuBell className="size-4 text-primary" aria-hidden />
        <h2 id="threshold-heading" className="text-[15px] font-semibold text-foreground">
          Monthly threshold
        </h2>
      </div>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        One email lands in the founder&apos;s alert inbox the first time month-to-date Claude spend crosses this figure. The next
        one only fires next month, or after the threshold changes.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="meta-label">Threshold (₦)</span>
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canEdit || busy}
            placeholder="e.g. 25000"
            aria-invalid={invalid || undefined}
            className="mt-1 h-11 w-full rounded-lg border-input-border bg-input px-3 font-mono tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={!canEdit || busy || invalid}
          className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {initial !== null ? (
          <button
            type="button"
            onClick={() => {
              if (!canEdit || busy) return;
              setValue("");
              void submit(null);
            }}
            disabled={!canEdit || busy}
            className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-lg bg-zone px-4 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            <LuX className="size-4" aria-hidden />
            Clear
          </button>
        ) : null}
      </div>
      {!canEdit ? <p className="mt-3 text-xs text-muted-foreground">Only the founder can set the threshold.</p> : null}
      {state ? (
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
            state.kind === "ok" ? "bg-primary/10 text-primary" : "bg-danger/10 text-danger",
          )}
          role="status"
        >
          {state.kind === "ok" ? <LuCheck className="size-3.5" aria-hidden /> : <LuTriangleAlert className="size-3.5" aria-hidden />}
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function PerSubsystemBreakdown({ rows }: { rows: SubsystemCost[] }) {
  const total = rows.reduce((s, r) => s + r.costNaira, 0);
  return (
    <section aria-labelledby="subsystem-heading" data-subsystem-breakdown>
      <h2 id="subsystem-heading" className="text-[15px] font-semibold text-foreground">
        Cost by subsystem
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">This month, grouped by the pipeline stage that spent it.</p>
      <div className="mt-4 divide-y divide-border/70">
        {rows.map((r) => (
          <div key={r.subsystem} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{SUBSYSTEM_LABEL[r.subsystem]}</p>
              <p className="text-xs text-muted-foreground">
                {num(r.tokens)} tokens &middot; {r.calls} call{r.calls === 1 ? "" : "s"}
              </p>
            </div>
            <span className="font-mono text-sm tabular-nums text-foreground">{formatNaira(r.costNaira)}</span>
            <span className="w-14 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {total > 0 ? `${Math.round((r.costNaira / total) * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PerProjectCostTable({ rows }: { rows: PerProjectCost[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? rows : rows.slice(0, 20);
  return (
    <section aria-labelledby="project-costs-heading" data-project-cost-table>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="project-costs-heading" className="text-[15px] font-semibold text-foreground">
          Cost by project
        </h2>
        <span className="text-xs text-muted-foreground">This month &middot; {rows.length} project{rows.length === 1 ? "" : "s"}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">
          No Claude calls tied to a project this month.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden">
          {/* Header row hidden on phones — each row's own label lines carry it. */}
          <div className="hidden grid-cols-[minmax(0,1.4fr)_60px_88px_88px_100px_88px] gap-3 border-b border-border/70 pb-2 text-xs uppercase tracking-wide text-muted-foreground md:grid">
            <span>Project</span>
            <span className="text-right">Mode</span>
            <span className="text-right">Input</span>
            <span className="text-right">Output</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Delivered</span>
          </div>
          <ul className="divide-y divide-border/70">
            {visible.map((r) => (
              <li key={r.code} className="grid grid-cols-2 gap-2 py-3 md:grid-cols-[minmax(0,1.4fr)_60px_88px_88px_100px_88px] md:items-baseline">
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <Link href={`/admin/projects/${r.code}?tab=report`} className="truncate text-sm font-medium text-foreground hover:text-primary">
                    <span className="font-mono">{r.code}</span>
                    {r.title ? <span className="ml-2 truncate text-muted-foreground">{r.title}</span> : null}
                  </Link>
                </div>
                <span className="font-mono text-xs tabular-nums text-muted-foreground md:text-right">{r.mode ? `M${r.mode}` : "—"}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground md:text-right">{num(r.inputTokens)}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground md:text-right">{num(r.outputTokens)}</span>
                <span className="font-mono text-sm tabular-nums text-foreground md:text-right">{formatNaira(r.costNaira)}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground md:text-right">
                  {r.completedAt ? new Date(r.completedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : "—"}
                </span>
              </li>
            ))}
          </ul>
          {rows.length > 20 ? (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
            >
              {showAll ? "Show top 20" : `See all ${rows.length}`}
              <LuArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function StatBlock({ label, value, detail, big }: { label: string; value: string; detail?: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono font-medium tabular-nums text-foreground", big ? "text-2xl" : "text-lg")}>{value}</dd>
      {detail ? <dd className="mt-0.5 text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}
