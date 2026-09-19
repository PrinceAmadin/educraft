"use client";

import * as React from "react";
import {
  LuBookOpen,
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuDownload,
  LuFileText,
  LuFolderOpen,
  LuLoaderCircle,
  LuRotateCcw,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PHASES, estimateEta, formatEta, phaseForStatus, type PhaseKey } from "@/lib/research-eta";

interface ReferenceRow {
  id: string;
  status: string;
  classification: string | null;
  title: string | null;
  proposedTitle: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  access: "OPEN_ACCESS" | "PAYWALLED" | null;
  pdfUrl: string | null;
  driveFileId: string | null;
  citedByCount: number | null;
  round: number;
}

interface ResearchJobData {
  id: string;
  status: string;
  targetCount: number;
  replacementRound: number;
  searchQueries: string[];
  searchCursor: number;
  corePercent: number | null;
  closelyRelatedPercent: number | null;
  driveFolderLink: string | null;
  paywalledDocLink: string | null;
  errorMessage: string | null;
  references: ReferenceRow[];
}

const STATUS_LABEL: Record<string, string> = {
  FINDING_CANDIDATES: "Searching academic databases…",
  VERIFYING_DOIS: "Checking which papers have free PDFs…",
  RESOLVING_PDFS: "Checking which papers have free PDFs…",
  IMPORTING_ZOTERO: "Checking which papers have free PDFs…",
  CLASSIFYING: "Checking relevance to the topic…",
  REPLACING: "Finding replacements for off-topic papers…",
  UPLOADING_DRIVE: "Saving PDFs and the paywalled-references list to Drive…",
};

const CLASSIFICATION_VARIANT: Record<string, "success" | "info" | "warning" | "danger"> = {
  CORE: "success",
  CLOSELY_RELATED: "info",
  TANGENTIAL: "warning",
  IRRELEVANT: "danger",
};

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong");
  return data;
}

function hasDrivePdf(r: ReferenceRow) {
  return Boolean(r.driveFileId) && r.driveFileId !== "SKIPPED";
}

function ReferenceItem({ r }: { r: ReferenceRow }) {
  const withPdf = r.access === "OPEN_ACCESS";
  return (
    <li className="min-w-0 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-1 break-words text-foreground">{r.title ?? r.proposedTitle}</span>
        <span className="flex shrink-0 flex-wrap gap-1.5">
          {r.classification ? (
            <Badge variant={CLASSIFICATION_VARIANT[r.classification] ?? "neutral"}>
              {r.classification.replace("_", " ")}
            </Badge>
          ) : null}
          <Badge variant={withPdf ? "default" : "neutral"}>{withPdf ? "PDF" : "Paywalled"}</Badge>
        </span>
      </div>
      <p className="mt-0.5 break-words text-xs text-muted-foreground">
        {[r.authors, r.year, r.journal, r.citedByCount ? `${r.citedByCount} citations` : null].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {r.doi ? (
          <a
            href={`https://doi.org/${r.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-xs text-primary hover:underline"
          >
            doi.org/{r.doi}
          </a>
        ) : null}
        {withPdf && r.pdfUrl ? (
          <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
            Open PDF
          </a>
        ) : null}
      </div>
    </li>
  );
}

function ResetDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Run research again?</DialogTitle>
          <DialogDescription>
            This clears the current references and the files saved to Drive, and starts a fresh search for
            this project.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuRotateCcw className="size-4" aria-hidden />}
            Start over
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ResearchPanel({ projectCode }: { projectCode: string }) {
  const [job, setJob] = React.useState<ResearchJobData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showRefs, setShowRefs] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const stopRef = React.useRef(false);
  // Latest job status, and how long a step of each phase has actually taken
  // on this connection — the time estimate learns from these.
  const statusRef = React.useRef<string | null>(null);
  const [observed, setObserved] = React.useState<Partial<Record<PhaseKey, number>>>({});

  const load = React.useCallback(async () => {
    const data = await fetchJson(`/api/worker/projects/${projectCode}/research`);
    statusRef.current = data.job?.status ?? null;
    setJob(data.job ?? null);
    return data.job as ResearchJobData | null;
  }, [projectCode]);

  React.useEffect(() => {
    stopRef.current = false;
    load().finally(() => setLoading(false));
    return () => {
      stopRef.current = true;
    };
  }, [load]);

  const run = React.useCallback(
    async (fresh = false) => {
      setRunning(true);
      setError(null);
      try {
        if (!job || fresh) {
          await fetchJson(`/api/worker/projects/${projectCode}/research/start`, { method: "POST" });
        }
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (stopRef.current) return;
          const phase = statusRef.current ? phaseForStatus(statusRef.current) : null;
          const startedAt = Date.now();
          const result = await fetchJson(`/api/worker/projects/${projectCode}/research/step`, {
            method: "POST",
          });
          if (phase) {
            const took = (Date.now() - startedAt) / 1000;
            setObserved((prev) => ({ ...prev, [phase]: prev[phase] == null ? took : prev[phase]! * 0.6 + took * 0.4 }));
          }
          await load();
          if (result.done) break;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setRunning(false);
      }
    },
    [job, projectCode, load]
  );

  // While the job runs: keep a phone's screen awake (a sleeping phone pauses
  // the page and the job with it) and warn before the page is closed.
  React.useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    const acquire = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch {
        /* not supported or denied — the job still runs */
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void lock?.release().catch(() => {});
    };
  }, [running]);

  const eta = job ? estimateEta(job, observed) : null;
  const remainingLabel = eta ? formatEta(eta.remainingSeconds) : null;

  // The browser tab shows the countdown, so it's visible from other tabs.
  React.useEffect(() => {
    if (!running || !remainingLabel) return;
    const original = document.title;
    document.title = `Researching · ${remainingLabel} left`;
    return () => {
      document.title = original;
    };
  }, [running, remainingLabel]);

  async function resetAndRun() {
    setResetting(true);
    setError(null);
    try {
      await fetchJson(`/api/worker/projects/${projectCode}/research/reset`, { method: "POST" });
      setResetOpen(false);
      setShowRefs(false);
      await load();
      void run(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset research");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <section className="surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Research</h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
      </section>
    );
  }

  const refs = job?.references ?? [];
  const isTerminal = job?.status === "PASSED" || job?.status === "FAILED_NEEDS_REVIEW";
  const kept = refs
    .filter((r) => r.status === "KEPT")
    .sort(
      (a, b) =>
        Number(b.classification === "CORE") - Number(a.classification === "CORE") ||
        (b.citedByCount ?? 0) - (a.citedByCount ?? 0)
    );
  const keptWithPdf = kept.filter((r) => r.access === "OPEN_ACCESS");
  const keptPaywalled = kept.filter((r) => r.access !== "OPEN_ACCESS");
  const coreCount = kept.filter((r) => r.classification === "CORE").length;
  const drivePdfCount = kept.filter(hasDrivePdf).length;
  const found = refs.filter((r) => r.doi && r.status !== "DOI_REJECTED");
  const openAccess = found.filter((r) => r.access === "OPEN_ACCESS").length;
  const paywalled = found.filter((r) => r.access === "PAYWALLED").length;
  const usedOldRules = refs.some((r) => r.status === "NO_OA_PDF");

  const startOverButton = (
    <Button size="sm" variant="outline" disabled={running || resetting} onClick={() => setResetOpen(true)}>
      <LuRotateCcw className="size-4" aria-hidden />
      Run research again
    </Button>
  );

  return (
    <section className="surface min-w-0 p-4">
      <h2 className="text-sm font-semibold text-foreground">Step 1 — Research</h2>

      {!job ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Finds real academic references for this project&apos;s topic by searching academic databases —
            every paper is a published record with a DOI, so nothing fabricated reaches the reference list.
            Papers with a free PDF are saved to Drive; paywalled ones are kept as references with a DOI link
            the student can open through their university library.
          </p>
          <Button size="sm" className="mt-3" disabled={running} onClick={() => run()}>
            {running ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuBookOpen className="size-4" aria-hidden />}
            Get Research Papers
          </Button>
        </>
      ) : job.status === "FAILED_NEEDS_REVIEW" ? (
        <div className="mt-2 space-y-3">
          <p className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {job.errorMessage ?? "Reference relevance couldn't be resolved automatically."}
          </p>
          <p className="text-sm text-muted-foreground">
            An admin has been notified to review this manually — {kept.length} reference
            {kept.length === 1 ? "" : "s"} kept so far.
          </p>
          {startOverButton}
        </div>
      ) : !isTerminal ? (
        <div className="mt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-medium text-foreground">
              {eta ? `Step ${eta.phaseNumber} of ${PHASES.length} · ` : ""}
              {STATUS_LABEL[job.status] ?? "Working…"}
              {job.replacementRound > 0 ? ` (search round ${job.replacementRound + 1})` : ""}
            </p>
            {remainingLabel ? (
              <p className="font-mono text-sm tabular-nums text-foreground">
                {running ? `${remainingLabel} left` : `${remainingLabel} to go`}
              </p>
            ) : null}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className={cn("h-full rounded-full bg-primary transition-all duration-500", running && "animate-pulse")}
              style={{
                width: eta
                  ? `${Math.max(4, Math.min(98, Math.round((1 - eta.remainingSeconds / eta.totalSeconds) * 100)))}%`
                  : "8%",
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {refs.length > 0
              ? `${refs.length} paper${refs.length === 1 ? "" : "s"} found (${openAccess} with PDF, ${paywalled} paywalled) · ${kept.length} kept so far`
              : "Getting started…"}
          </p>
          <p className="mt-3 rounded-xl bg-zone p-3 text-xs text-muted-foreground">
            {running ? (
              <>
                Usually takes around 8 minutes in total. You can switch to another tab or app while it works,
                and the time left shows on this browser tab. <strong className="text-foreground">Keep this
                page open</strong> — closing it or locking the phone pauses the search until you press Resume.
                {job.replacementRound === 0
                  ? " If too few papers pass the relevance check, a second search round adds about 3 minutes."
                  : ""}
              </>
            ) : (
              <>Paused. Press Resume and it carries on from exactly where it stopped, nothing is lost.</>
            )}
          </p>
          {!running ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => run()}>
                Resume
              </Button>
              {startOverButton}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-foreground">
            Research complete. <strong>{kept.length}</strong> verified reference{kept.length === 1 ? "" : "s"}:{" "}
            {keptWithPdf.length} with PDFs, {keptPaywalled.length} reference-only (paywalled).{" "}
            <strong>{coreCount}</strong> CORE · {job.corePercent ?? 0}% CORE, {job.closelyRelatedPercent ?? 0}%
            CLOSELY_RELATED.
          </p>

          {usedOldRules ? (
            <p className="flex items-start gap-2 rounded-xl bg-zone p-3 text-sm text-foreground">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
              This run used the old open-access-only rules, which dropped every paywalled paper. Run research
              again to include them.
            </p>
          ) : job.errorMessage ? (
            <p className="flex items-start gap-2 rounded-xl bg-zone p-3 text-sm text-foreground">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
              {job.errorMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowRefs((v) => !v)}>
              {showRefs ? <LuChevronUp className="size-4" aria-hidden /> : <LuChevronDown className="size-4" aria-hidden />}
              View references
            </Button>
            {job.driveFolderLink ? (
              <Button size="sm" variant="outline" asChild>
                <a href={job.driveFolderLink} target="_blank" rel="noopener noreferrer">
                  <LuFolderOpen className="size-4" aria-hidden />
                  PDFs in Drive ({drivePdfCount})
                </a>
              </Button>
            ) : null}
            {job.paywalledDocLink ? (
              <Button size="sm" variant="outline" asChild>
                <a href={job.paywalledDocLink} target="_blank" rel="noopener noreferrer">
                  <LuFileText className="size-4" aria-hidden />
                  Paywalled references
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/worker/projects/${projectCode}/research/bib`} download>
                <LuDownload className="size-4" aria-hidden />
                Download .bib
              </a>
            </Button>
            {startOverButton}
            <Button size="sm" disabled title="Coming soon — report generation is a later build phase">
              Proceed to Write Report
            </Button>
          </div>

          {showRefs ? (
            <div className="space-y-4 border-t border-border pt-3">
              <div>
                <p className="meta-label">With PDF ({keptWithPdf.length})</p>
                {keptWithPdf.length > 0 ? (
                  <ul className="divide-y divide-border/70">
                    {keptWithPdf.map((r) => (
                      <ReferenceItem key={r.id} r={r} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">None.</p>
                )}
              </div>
              <div>
                <p className="meta-label">Reference only — paywalled ({keptPaywalled.length})</p>
                {keptPaywalled.length > 0 ? (
                  <ul className="divide-y divide-border/70">
                    {keptPaywalled.map((r) => (
                      <ReferenceItem key={r.id} r={r} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">None.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} onConfirm={resetAndRun} pending={resetting} />
    </section>
  );
}
