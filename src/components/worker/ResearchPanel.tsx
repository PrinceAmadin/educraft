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
  LuSend,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";
import { PHASES, estimateEta, formatEta } from "@/lib/research-eta";

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

interface RerunState {
  rerunsUsed: number;
  freeRerunsLeft: number;
  needsApproval: boolean;
  request: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
    reason: string;
    reviewNote: string | null;
    approvedUntil: string | null;
    createdAt: string;
  } | null;
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
  lastError: string | null;
  lockedUntil: string | null;
  lastStepAt: string | null;
  createdAt: string;
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

const MIN_REASON = 15;

/**
 * "Run research again", rationed. The first re-run on a project is free; after
 * that the worker sends a reason and a manager approves one run. This only
 * mirrors the rule: the server enforces it, and a refused re-run deletes nothing.
 */
function RerunControl({
  projectCode,
  rerun,
  onChanged,
  onStarted,
}: {
  projectCode: string;
  rerun: RerunState | null;
  onChanged: () => Promise<unknown>;
  onStarted: () => Promise<unknown>;
}) {
  const [dialog, setDialog] = React.useState<"confirm" | "request" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!rerun) return null;
  const req = rerun.request;

  const mode: "free" | "pending" | "approved" | "request" =
    !rerun.needsApproval ? "free" : req?.status === "PENDING" ? "pending" : req?.status === "APPROVED" ? "approved" : "request";

  async function post(path: string, body?: unknown) {
    const res = await fetch(`/api/worker/projects/${projectCode}/research/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error ?? "Something went wrong"), { code: data?.code });
    return data;
  }

  async function runNow() {
    setBusy(true);
    setError(null);
    try {
      await post("rerun");
      setDialog(null);
      await onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // The allowance changed under us (e.g. someone else used it) — show the real state.
      if ((err as { code?: string }).code === "APPROVAL_REQUIRED") await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    setBusy(true);
    setError(null);
    try {
      await post("rerun-request", { reason });
      setDialog(null);
      setReason("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const label =
    mode === "pending" ? "Waiting for approval" : mode === "request" ? (req?.status === "REJECTED" ? "Request again" : "Request a re-run") : "Run research again";

  return (
    <div className="min-w-0 space-y-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={mode === "pending"}
        onClick={() => {
          setError(null);
          setDialog(mode === "request" ? "request" : "confirm");
        }}
      >
        {mode === "request" ? <LuSend className="size-4" aria-hidden /> : <LuRotateCcw className="size-4" aria-hidden />}
        {label}
      </Button>

      {mode === "pending" && req ? (
        <p className="text-xs text-muted-foreground">
          Sent {formatDateTime(req.createdAt)}. You&apos;ll get a notification when a manager decides.
        </p>
      ) : null}
      {mode === "approved" && req?.approvedUntil ? (
        <p className="text-xs text-muted-foreground">
          Approved. Use it before {formatDateTime(req.approvedUntil)}, after that you&apos;ll need to ask again.
        </p>
      ) : null}
      {mode === "request" && req?.status === "REJECTED" ? (
        <p className="text-xs text-muted-foreground">
          A manager declined your last request: <span className="text-foreground">{req.reviewNote}</span>
        </p>
      ) : null}
      {mode === "request" && req?.status === "EXPIRED" ? (
        <p className="text-xs text-muted-foreground">Your approval ran out before it was used. You can ask again.</p>
      ) : null}
      {mode === "request" && (!req || req.status === "EXPIRED") ? (
        <p className="text-xs text-muted-foreground">
          This project&apos;s free re-run is used up, so another one needs a manager&apos;s approval.
        </p>
      ) : null}

      <Dialog open={dialog === "confirm"} onOpenChange={(v) => !busy && setDialog(v ? "confirm" : null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Run research again?</DialogTitle>
            <DialogDescription>
              This clears the current references and the files saved to Drive, and starts a fresh search.{" "}
              {mode === "free"
                ? "This is your free re-run for this project. Any after it will need a manager's approval."
                : "This uses your approved re-run."}
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={runNow}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuRotateCcw className="size-4" aria-hidden />}
              Start over
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "request"} onOpenChange={(v) => !busy && setDialog(v ? "request" : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ask for another re-run</DialogTitle>
            <DialogDescription>
              Each run costs AI credits, so a manager approves extra ones. Say what was wrong with the current
              results. Nothing is deleted until you run it.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Most of the papers are about the wrong industry, the topic was changed by the supervisor."
            aria-label="Why you need another run"
          />
          <p className="text-xs text-muted-foreground">
            {reason.trim().length < MIN_REASON
              ? `At least ${MIN_REASON} characters (${reason.trim().length} so far).`
              : "A manager will see this."}
          </p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || reason.trim().length < MIN_REASON} onClick={sendRequest}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuSend className="size-4" aria-hidden />}
              Send request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** How long a running job can go without finishing a step before the panel restarts the background run. */
const STALE_AFTER_MS = 150_000;
const POLL_MS = 3000;

export function ResearchPanel({ projectCode }: { projectCode: string }) {
  const [job, setJob] = React.useState<ResearchJobData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showRefs, setShowRefs] = React.useState(false);
  const [rerun, setRerun] = React.useState<RerunState | null>(null);
  const lastNudgeRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const data = await fetchJson(`/api/worker/projects/${projectCode}/research`);
    setJob(data.job ?? null);
    setRerun(data.rerun ?? null);
    return data.job as ResearchJobData | null;
  }, [projectCode]);

  React.useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const isTerminal = job?.status === "PASSED" || job?.status === "FAILED_NEEDS_REVIEW";
  const inProgress = Boolean(job) && !isTerminal;

  // The job runs on the server. This page only watches it, so there's
  // nothing to keep open — polling just keeps the numbers fresh while it is.
  React.useEffect(() => {
    if (!inProgress) return;
    const id = window.setInterval(() => {
      load().catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [inProgress, load]);

  const resume = React.useCallback(async () => {
    setError(null);
    try {
      await fetchJson(`/api/worker/projects/${projectCode}/research/resume`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume");
    }
  }, [projectCode, load]);

  // If the background run has gone quiet (a step kept failing, or a link in
  // the chain was lost), restart it — at most once a minute. The lease on the
  // server makes this harmless when the job is in fact still running.
  React.useEffect(() => {
    if (!job || !inProgress || job.lastError) return;
    const leased = job.lockedUntil ? new Date(job.lockedUntil).getTime() > Date.now() : false;
    const quietFor = Date.now() - new Date(job.lastStepAt ?? job.createdAt).getTime();
    if (!leased && quietFor > STALE_AFTER_MS && Date.now() - lastNudgeRef.current > 60_000) {
      lastNudgeRef.current = Date.now();
      void resume();
    }
  }, [job, inProgress, resume]);

  const stalled = Boolean(job?.lastError);
  const running = inProgress && !stalled;

  const eta = job ? estimateEta(job) : null;
  const remainingLabel = eta ? formatEta(eta.remainingSeconds) : null;

  // The countdown also shows on the browser tab, so it's visible from other tabs.
  React.useEffect(() => {
    if (!running || !remainingLabel) return;
    const original = document.title;
    document.title = `Researching · ${remainingLabel} left`;
    return () => {
      document.title = original;
    };
  }, [running, remainingLabel]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await fetchJson(`/api/worker/projects/${projectCode}/research/start`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStarting(false);
    }
  }

  const onRerunStarted = React.useCallback(async () => {
    setShowRefs(false);
    await load();
  }, [load]);

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
    <RerunControl projectCode={projectCode} rerun={rerun} onChanged={load} onStarted={onRerunStarted} />
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
          <Button size="sm" className="mt-3" disabled={starting} onClick={start}>
            {starting ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuBookOpen className="size-4" aria-hidden />}
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
          {stalled ? (
            <div className="mt-3 space-y-2">
              <p className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {job.lastError}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={resume}>
                  Resume
                </Button>
                {startOverButton}
              </div>
            </div>
          ) : (
            <>
              <p className="mt-3 rounded-xl bg-zone p-3 text-xs text-muted-foreground">
                This runs on our servers, so you <strong className="text-foreground">can close this page</strong>{" "}
                or lock your phone and come back later. It usually takes around 5 minutes, and you&apos;ll get a
                notification when it&apos;s done.
                {job.replacementRound === 0
                  ? " If too few papers pass the relevance check, a second search round adds a couple of minutes."
                  : ""}
              </p>
              <div className="mt-3">{startOverButton}</div>
            </>
          )}
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

    </section>
  );
}
