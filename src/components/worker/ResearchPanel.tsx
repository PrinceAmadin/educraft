"use client";

import * as React from "react";
import {
  LuBookOpen,
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuExternalLink,
  LuFolderOpen,
  LuLoaderCircle,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
}

interface ResearchJobData {
  id: string;
  status: string;
  targetCount: number;
  replacementRound: number;
  corePercent: number | null;
  closelyRelatedPercent: number | null;
  driveFolderLink: string | null;
  errorMessage: string | null;
  references: ReferenceRow[];
}

const STATUS_LABEL: Record<string, string> = {
  FINDING_CANDIDATES: "Finding candidate papers…",
  VERIFYING_DOIS: "Verifying DOIs against CrossRef…",
  RESOLVING_PDFS: "Checking for open-access PDFs…",
  IMPORTING_ZOTERO: "Importing into Zotero…",
  CLASSIFYING: "Checking relevance to the topic…",
  REPLACING: "Swapping out flagged references…",
  UPLOADING_DRIVE: "Uploading PDFs to Google Drive…",
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

export function ResearchPanel({ projectCode }: { projectCode: string }) {
  const [job, setJob] = React.useState<ResearchJobData | null>(null);
  const [zoteroUrl, setZoteroUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showRefs, setShowRefs] = React.useState(false);
  const stopRef = React.useRef(false);

  const load = React.useCallback(async () => {
    const data = await fetchJson(`/api/worker/projects/${projectCode}/research`);
    setJob(data.job ?? null);
    setZoteroUrl(data.zoteroCollectionUrl ?? null);
    return data.job as ResearchJobData | null;
  }, [projectCode]);

  React.useEffect(() => {
    stopRef.current = false;
    load().finally(() => setLoading(false));
    return () => {
      stopRef.current = true;
    };
  }, [load]);

  const run = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      if (!job) {
        await fetchJson(`/api/worker/projects/${projectCode}/research/start`, { method: "POST" });
      }
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (stopRef.current) return;
        const result = await fetchJson(`/api/worker/projects/${projectCode}/research/step`, {
          method: "POST",
        });
        await load();
        if (result.done) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  }, [job, projectCode, load]);

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

  const isTerminal = job?.status === "PASSED" || job?.status === "FAILED_NEEDS_REVIEW";
  const kept = job?.references.filter((r) => r.status === "KEPT") ?? [];
  const seen = job?.references.length ?? 0;
  const settled = job?.references.filter((r) => r.status !== "CANDIDATE").length ?? 0;

  return (
    <section className="surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Step 1 — Research</h2>

      {!job ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Finds real, verified academic references for this project&apos;s topic — every DOI is checked
            against CrossRef and every PDF against Unpaywall before anything is imported, so nothing
            fabricated ever reaches the reference list.
          </p>
          <Button size="sm" className="mt-3" disabled={running} onClick={run}>
            {running ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuBookOpen className="size-4" aria-hidden />}
            Get Research Papers
          </Button>
        </>
      ) : job.status === "FAILED_NEEDS_REVIEW" ? (
        <div className="mt-2">
          <p className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {job.errorMessage ?? "Reference relevance couldn't be resolved automatically."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            An admin has been notified to review this manually — {kept.length} reference
            {kept.length === 1 ? "" : "s"} kept so far.
          </p>
        </div>
      ) : !isTerminal ? (
        <div className="mt-2">
          <p className="text-sm text-foreground">
            {STATUS_LABEL[job.status] ?? "Working…"}
            {job.replacementRound > 0 ? ` (replacement round ${job.replacementRound})` : ""}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className={cn("h-full rounded-full bg-primary transition-all", running && "animate-pulse")}
              style={{ width: seen > 0 ? `${Math.min(100, Math.round((settled / Math.max(seen, job.targetCount)) * 100))}%` : "8%" }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {seen > 0
              ? `${seen} candidate${seen === 1 ? "" : "s"} looked at so far, ${kept.length} kept.`
              : "Getting started…"}
          </p>
          {!running ? (
            <Button size="sm" variant="outline" className="mt-3" onClick={run}>
              Resume
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-foreground">
            Research complete. <strong>{kept.length}</strong> verified reference{kept.length === 1 ? "" : "s"}{" "}
            found. {job.corePercent ?? 0}% CORE, {job.closelyRelatedPercent ?? 0}% CLOSELY_RELATED.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowRefs((v) => !v)}>
              {showRefs ? <LuChevronUp className="size-4" aria-hidden /> : <LuChevronDown className="size-4" aria-hidden />}
              View references
            </Button>
            {job.driveFolderLink ? (
              <Button size="sm" variant="outline" asChild>
                <a href={job.driveFolderLink} target="_blank" rel="noopener noreferrer">
                  <LuFolderOpen className="size-4" aria-hidden />
                  Open in Drive
                </a>
              </Button>
            ) : null}
            {zoteroUrl ? (
              <Button size="sm" variant="outline" asChild>
                <a href={zoteroUrl} target="_blank" rel="noopener noreferrer">
                  <LuExternalLink className="size-4" aria-hidden />
                  Open in Zotero
                </a>
              </Button>
            ) : null}
            <Button size="sm" disabled title="Coming soon — report generation is a later build phase">
              Proceed to Write Report
            </Button>
          </div>

          {showRefs ? (
            <ul className="mt-4 space-y-2 border-t border-border pt-3">
              {kept.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-foreground">{r.title ?? r.proposedTitle}</span>
                    {r.classification ? (
                      <Badge variant={CLASSIFICATION_VARIANT[r.classification] ?? "neutral"}>
                        {r.classification.replace("_", " ")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[r.authors, r.year, r.journal].filter(Boolean).join(" · ")}
                  </p>
                  {r.doi ? (
                    <a
                      href={`https://doi.org/${r.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      doi.org/{r.doi}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
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
