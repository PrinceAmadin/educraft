"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LuCircleAlert,
  LuCircleCheck,
  LuCircleDot,
  LuCircleMinus,
  LuLoaderCircle,
  LuRefreshCw,
  LuRotateCcw,
  LuShieldCheck,
  LuTriangleAlert,
  LuUndo2,
  LuWrench,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { QualityRunResponse } from "@/lib/quality-gate";
import type { QualityItem } from "@/lib/quality/types";
import { cn, formatDateTime } from "@/lib/utils";

const LAYERS: { key: "formattingScore" | "structuralScore" | "referenceScore" | "voiceScore"; label: string; total: number }[] = [
  { key: "formattingScore", label: "Formatting", total: 71 },
  { key: "structuralScore", label: "Structure", total: 16 },
  { key: "referenceScore", label: "References", total: 1 },
  { key: "voiceScore", label: "Voice", total: 1 },
];

const SEVERITY: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: "Critical", className: "bg-danger/10 text-danger" },
  MAJOR: { label: "Major", className: "bg-gold/15 text-gold" },
  MINOR: { label: "Minor", className: "bg-elevated text-muted-foreground" },
};

const WHEN = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });

/**
 * Phase D8: the quality gate on the Report tab (worker and admin). The score
 * out of 89 against the pass mark of 85, the four layers, what failed (by
 * chapter, with the quote and the fix), the notes for the COO, the recall
 * button for 30 minutes after the report goes to QA on its own, and, for the
 * founder and the COO, re-generating a chapter with its failures in its brief.
 * Chapter review: a chapter the specialist has reviewed is never re-generated;
 * its failures go back to the specialist as correction notes instead.
 */
export function QualityGatePanel({
  endpoint,
  canRegenerate,
  chapterReview = null,
  changesBase,
}: {
  endpoint: string;
  canRegenerate: boolean;
  /** Per chapter: its review item, and whether the specialist has uploaded their own version. */
  chapterReview?: Record<number, { deliverableId: string; reviewed: boolean }> | null;
  /** /api/admin/projects/<code>/deliverables: where correction notes are posted. */
  changesBase?: string;
}) {
  const router = useRouter();
  const [report, setReport] = React.useState<QualityRunResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"run" | "recall" | `regen:${number}` | `return:${number}` | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [confirmChapter, setConfirmChapter] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not load the quality check.");
      setReport(body as QualityRunResponse);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function post(path: string, key: NonNullable<typeof busy>, body?: unknown) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${endpoint}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "That didn't work. Try again.");
        return null;
      }
      return json;
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    const json = await post("run", "run");
    if (!json) return;
    setReport(json as QualityRunResponse);
    if ((json as QualityRunResponse).autoSubmitError) setError(`The report passed but could not be sent to QA: ${(json as QualityRunResponse).autoSubmitError}`);
    router.refresh();
  }

  async function recall() {
    const json = await post("recall", "recall");
    if (!json) {
      void load();
      return;
    }
    setNotice("Recalled. The report is back in progress and out of the QA queue.");
    await load();
    router.refresh();
  }

  async function regenerate(chapter: number) {
    setConfirmChapter(null);
    const json = await post("regenerate", `regen:${chapter}`, { chapter });
    if (!json) return;
    setNotice(`Chapter ${chapter} is being re-generated with its ${json.failuresSent?.length ?? 0} failure${json.failuresSent?.length === 1 ? "" : "s"} in its brief. Its progress shows above; run the check again when it has finished.${json.warning ? ` ${json.warning}` : ""}`);
    router.refresh();
  }

  /** Chapter review: the chapter's failures go to the specialist as the COO's correction notes. */
  async function returnToSpecialist(chapter: number) {
    const item = chapterReview?.[chapter];
    if (!item || !changesBase || !report) return;
    setConfirmChapter(null);
    setBusy(`return:${chapter}`);
    setError(null);
    setNotice(null);
    try {
      const note = failureNotes(report.failuresJson, chapter);
      const res = await fetch(`${changesBase}/${item.deliverableId}/changes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "That didn't work. Try again.");
        return;
      }
      setNotice(`Chapter ${chapter} went back to the specialist with its failures as your correction notes. The check runs again once you approve their corrected version.`);
      router.refresh();
    } catch {
      setError("Could not reach EduCraft. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const ran = Boolean(report?.ranAt);

  return (
    <section className="space-y-5 rounded-2xl bg-zone p-4 sm:p-6" aria-labelledby="quality-heading" data-quality-panel>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <p className="eyebrow flex items-center gap-2 text-primary">
            <LuShieldCheck className="size-4" aria-hidden />
            Quality check
          </p>
          <h2 id="quality-heading" className="text-lg font-semibold tracking-tight text-foreground">
            {!ran ? "Not checked yet" : report!.passed ? "Passed the quality check" : "Did not pass yet"}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            89 checks before QA: formatting, structure, references and voice. {report?.passMark ?? 85} or more with no critical failure sends the report to QA on its own.
          </p>
        </div>
        <Button type="button" onClick={() => void run()} disabled={busy !== null} variant={ran ? "outline" : "default"} className="h-12 w-full shrink-0 sm:h-10 sm:w-auto">
          {busy === "run" ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuRefreshCw aria-hidden />}
          {busy === "run" ? "Checking…" : ran ? "Run the check again" : "Run quality check"}
        </Button>
      </div>

      {busy === "run" ? <p className="text-xs text-muted-foreground">This takes up to a minute: every chapter is read.</p> : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="flex items-start gap-2 text-sm text-foreground" role="status">
          <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-10 w-2/3 rounded-lg" />
        </div>
      ) : loadError ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-danger" role="alert">
          <LuCircleAlert className="size-4" aria-hidden />
          {loadError}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : ran && report ? (
        <>
          <ScoreBlock report={report} busy={busy} onRecall={() => void recall()} />
          <Failures
            items={report.failuresJson}
            canRegenerate={canRegenerate && (report.status === "IN_PROGRESS" || report.status === "REVISION_NEEDED")}
            reviewed={(n) => Boolean(chapterReview?.[n]?.reviewed && changesBase)}
            busy={busy}
            confirmChapter={confirmChapter}
            onAsk={setConfirmChapter}
            onRegenerate={(n) => void regenerate(n)}
            onReturn={(n) => void returnToSpecialist(n)}
          />
          <Warnings items={report.warnings} notes={report.notes} />
          <AllChecks checks={report.checks} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Run the check once every chapter is written. It reads the assembled report the same way QA will.</p>
      )}
    </section>
  );
}

function ScoreBlock({ report, busy, onRecall }: { report: QualityRunResponse; busy: string | null; onRecall: () => void }) {
  const critical = report.criticalFailures > 0;
  const short = Math.max(0, report.passMark - report.qualityScore);
  return (
    <div className="surface space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <p className="font-mono text-4xl font-semibold tabular-nums text-foreground" data-quality-score={report.qualityScore}>
          {report.qualityScore}
          <span className="text-lg text-muted-foreground"> / {report.totalChecks}</span>
        </p>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", report.passed ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {report.passed ? "Passed" : critical ? "Critical failure" : `Needs ${report.passMark}`}
        </span>
        <p className="w-full text-sm text-muted-foreground sm:w-auto">
          {report.percent}% of checks passed
          {!report.passed ? (critical ? ` · a critical failure blocks QA whatever the count` : ` · ${short} more to pass`) : ""}
        </p>
      </div>

      <div className="relative h-2 rounded-full bg-elevated" role="img" aria-label={`${report.qualityScore} of ${report.totalChecks} checks passed; the pass mark is ${report.passMark}`}>
        <div className={cn("h-2 rounded-full", report.passed ? "bg-success" : "bg-gold")} style={{ width: `${(report.qualityScore / report.totalChecks) * 100}%` }} />
        <span className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60" style={{ left: `${(report.passMark / report.totalChecks) * 100}%` }} aria-hidden />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {LAYERS.map((l) => (
          <div key={l.key} className="space-y-0.5">
            <dt className="meta-label">{l.label}</dt>
            <dd className={cn("font-mono text-sm tabular-nums", report[l.key] < l.total ? "text-gold" : "text-foreground")}>
              {report[l.key]} / {l.total}
            </dd>
          </div>
        ))}
      </dl>

      <RecallLine report={report} busy={busy} onRecall={onRecall} />

      <p className="text-xs text-muted-foreground">
        Checked {formatDateTime(report.ranAt!)}
        {report.ranBy ? ` by ${report.ranBy}` : ""}
        {report.costNaira != null ? <span className="font-mono tabular-nums"> · ₦{report.costNaira.toFixed(2)}</span> : null}
      </p>
    </div>
  );
}

function RecallLine({ report, busy, onRecall }: { report: QualityRunResponse; busy: string | null; onRecall: () => void }) {
  const [now, setNow] = React.useState(() => Date.now());
  const open = report.recall === "OPEN" && report.recallWindowExpiresAt;
  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);
  // An earlier auto-submission says nothing once QA has sent the report back and a later run did not submit it.
  if (!report.autoSubmittedAt || !(report.autoSubmitted || report.status === "SUBMITTED" || report.status === "IN_QA_REVIEW")) return null;
  const left = report.recallWindowExpiresAt ? Math.max(0, new Date(report.recallWindowExpiresAt).getTime() - now) : 0;
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const text =
    report.recall === "OPEN" && left > 0
      ? `Sent to QA at ${WHEN(report.autoSubmittedAt)}. You can recall it until ${WHEN(report.recallWindowExpiresAt!)}.`
      : report.recall === "ALREADY_RECALLED"
        ? `Sent to QA at ${WHEN(report.autoSubmittedAt)} and recalled.`
        : report.recall === "REVIEW_STARTED"
          ? `Sent to QA at ${WHEN(report.autoSubmittedAt)}. A reviewer has started, so it can no longer be recalled.`
          : report.recall === "NOT_IN_QUEUE"
            ? `Sent to QA at ${WHEN(report.autoSubmittedAt)}. It has since left the QA queue.`
            : `Sent to QA at ${WHEN(report.autoSubmittedAt)}. The 30-minute recall window has closed.`;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-zone p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          {text}
          {report.recall === "OPEN" && left > 0 ? (
            <span className="ml-1 font-mono tabular-nums text-muted-foreground" data-recall-left>
              {mm}:{String(ss).padStart(2, "0")} left
            </span>
          ) : null}
        </span>
      </p>
      {report.recall === "OPEN" && left > 0 ? (
        <Button type="button" variant="outline" onClick={onRecall} disabled={busy !== null} className="h-12 w-full sm:h-10 sm:w-auto">
          {busy === "recall" ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuUndo2 aria-hidden />}
          Recall from QA
        </Button>
      ) : null}
    </div>
  );
}

/** A chapter's failures as correction notes for the specialist (at most 4,000 characters). */
function failureNotes(items: QualityItem[], chapter: number): string {
  const lines = items
    .filter((f) => (f.chapter ?? f.locations.find((l) => l.chapter)?.chapter ?? null) === chapter)
    .map((f) => {
      const quote = f.locations.find((l) => l.chapter === chapter && l.quote)?.quote;
      return `- ${f.message}${quote ? ` Example: "${quote}"` : ""}${f.fix ? ` Fix: ${f.fix}` : ""}`;
    });
  const text = `The quality check found these in Chapter ${chapter}:\n${lines.join("\n")}`;
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

function Failures({
  items,
  canRegenerate,
  reviewed,
  busy,
  confirmChapter,
  onAsk,
  onRegenerate,
  onReturn,
}: {
  items: QualityItem[];
  canRegenerate: boolean;
  /** Chapter review: the specialist has reviewed this chapter, so it goes back to them instead. */
  reviewed: (chapter: number) => boolean;
  busy: string | null;
  confirmChapter: number | null;
  onAsk: (n: number | null) => void;
  onRegenerate: (n: number) => void;
  onReturn: (n: number) => void;
}) {
  if (!items.length) return null;
  const groups = new Map<number | null, QualityItem[]>();
  for (const f of items) {
    const ch = f.chapter ?? f.locations.find((l) => l.chapter)?.chapter ?? null;
    groups.set(ch, [...(groups.get(ch) ?? []), f]);
  }
  const ordered = [...groups.entries()].sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99));
  return (
    <div className="space-y-4">
      <h3 className="text-[15px] font-semibold text-foreground">What failed ({items.length})</h3>
      {ordered.map(([chapter, list]) => (
        <div key={chapter ?? "report"} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="meta-label">{chapter ? `Chapter ${chapter}` : "Whole report"}</p>
            {chapter && canRegenerate ? (
              confirmChapter === chapter ? null : (
                <Button type="button" size="sm" variant="outline" onClick={() => onAsk(chapter)} disabled={busy !== null}>
                  {reviewed(chapter) ? <LuUndo2 aria-hidden /> : <LuRotateCcw aria-hidden />}
                  {reviewed(chapter) ? `Return Chapter ${chapter} to the specialist` : `Re-generate Chapter ${chapter}`}
                </Button>
              )
            ) : null}
          </div>
          {chapter && confirmChapter === chapter ? (
            <div className="space-y-3 rounded-xl bg-card p-3 shadow-soft" role="group" aria-label={`Confirm ${reviewed(chapter) ? "returning" : "re-generating"} Chapter ${chapter}`}>
              <p className="text-sm text-foreground">
                {reviewed(chapter)
                  ? `The specialist has reviewed Chapter ${chapter}, so it is not written again. These failures go to them as your correction notes; the approved version stays in use until you approve their correction.`
                  : `This rewrites Chapter ${chapter} from scratch with these failures in its brief, and replaces the current text. It spends Claude credits (about ₦100–700 for a chapter).`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => (reviewed(chapter) ? onReturn(chapter) : onRegenerate(chapter))} disabled={busy !== null}>
                  {busy === `regen:${chapter}` || busy === `return:${chapter}` ? (
                    <LuLoaderCircle className="animate-spin" aria-hidden />
                  ) : reviewed(chapter) ? (
                    <LuUndo2 aria-hidden />
                  ) : (
                    <LuRotateCcw aria-hidden />
                  )}
                  {reviewed(chapter) ? `Return Chapter ${chapter}` : `Re-generate Chapter ${chapter}`}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => onAsk(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          <ul className="divide-y divide-border/60">
            {list.map((f, i) => (
              <li key={`${f.id}-${i}`} className="space-y-1.5 py-3" data-failure={f.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", SEVERITY[f.severity]?.className)}>{SEVERITY[f.severity]?.label ?? f.severity}</span>
                  <span className="font-mono text-xs text-muted-foreground">{f.id}</span>
                </div>
                <p className="text-sm text-foreground">{f.message}</p>
                {f.locations
                  .filter((l) => l.quote)
                  .slice(0, 2)
                  .map((l, k) => (
                    <p key={k} className="rounded-lg bg-zone px-3 py-2 text-sm italic text-muted-foreground">
                      {l.paragraph ? <span className="mr-1 font-mono not-italic">¶{l.paragraph}</span> : null}“{l.quote}”
                    </p>
                  ))}
                {f.fix ? (
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <LuWrench className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {f.fix}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Warnings({ items, notes }: { items: QualityItem[]; notes: string[] }) {
  if (!items.length && !notes.length) return null;
  return (
    <details className="group space-y-2">
      <summary className="cursor-pointer list-none text-[15px] font-semibold text-foreground">
        Notes for the COO ({items.length + notes.length}) <span className="text-sm font-normal text-muted-foreground group-open:hidden">· show</span>
      </summary>
      <ul className="mt-2 divide-y divide-border/60">
        {items.map((w, i) => (
          <li key={`${w.id}-${i}`} className="space-y-1 py-2.5">
            <p className="text-sm text-foreground">
              <span className="mr-2 font-mono text-xs text-muted-foreground">{w.id}</span>
              {w.chapter ? <span className="mr-1 text-muted-foreground">Chapter {w.chapter}:</span> : null}
              {w.message}
            </p>
            {w.locations.find((l) => l.quote)?.quote ? <p className="text-xs italic text-muted-foreground">“{w.locations.find((l) => l.quote)!.quote}”</p> : null}
          </li>
        ))}
        {notes.map((n, i) => (
          <li key={`note-${i}`} className="py-2.5 text-sm text-muted-foreground">
            {n}
          </li>
        ))}
      </ul>
    </details>
  );
}

function AllChecks({ checks }: { checks: QualityRunResponse["checks"] }) {
  if (!checks.length) return null;
  const icon = (s: string) =>
    s === "PASS" ? (
      <LuCircleCheck className="size-4 text-success" aria-label="Passed" />
    ) : s === "WARN" ? (
      <LuCircleDot className="size-4 text-gold" aria-label="Passed with a note" />
    ) : s === "NA" ? (
      <LuCircleMinus className="size-4 text-muted-foreground" aria-label="Not applicable" />
    ) : (
      <LuCircleAlert className="size-4 text-danger" aria-label="Failed" />
    );
  const layers: [string, string][] = [
    ["formatting", "Formatting (Layer 1)"],
    ["structural", "Structure (Layer 3)"],
    ["reference", "References (Layer 2b)"],
    ["voice", "Voice (Layer 2a)"],
  ];
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[15px] font-semibold text-foreground">
        All {checks.length} checks <span className="text-sm font-normal text-muted-foreground group-open:hidden">· show</span>
      </summary>
      <div className="mt-3 space-y-4">
        {layers.map(([layer, label]) => (
          <div key={layer} className="space-y-1">
            <p className="meta-label">{label}</p>
            <ul className="divide-y divide-border/60">
              {checks
                .filter((c) => c.layer === layer)
                .map((c) => (
                  <li key={c.id} className="flex items-start gap-3 py-2">
                    <span className="mt-0.5 shrink-0">{icon(c.status)}</span>
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{c.id}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="text-foreground">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">{c.summary}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
