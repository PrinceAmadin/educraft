"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuClipboardCheck, LuLoaderCircle, LuUserPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn, formatDateTime } from "@/lib/utils";
import type { QaBucket, QaQueueOps as QaQueueData, QaQueueOpsRow, QaReviewerOption } from "@/lib/services/operations/qa-reviews";

type Tab = "all" | QaBucket;

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unassigned", label: "Unassigned" },
  { key: "assigned", label: "Assigned" },
  { key: "reviewing", label: "Reviewing" },
  { key: "overdue", label: "Overdue (>24h)" },
];

function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 && h < 6 ? `${h}h${m.toString().padStart(2, "0")}m` : `${h}h`;
  }
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return h > 0 && d < 3 ? `${d}d ${h}h` : `${d}d`;
}

/**
 * The QA queue with its four views. The COO assigns reviewers (junior
 * reviewers or themself), opens a review, or monitors one in progress.
 */
export function QaQueueOps({ data, currentUserId }: { data: QaQueueData; currentUserId: string }) {
  const [tab, setTab] = React.useState<Tab>("all");
  const rows = tab === "all" ? data.rows : tab === "overdue" ? data.rows.filter((r) => r.overdue) : data.rows.filter((r) => r.bucket === tab);
  const count = (t: Tab) => (t === "all" ? data.rows.length : data.counts[t]);

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Queue views" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const selected = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              <span className={cn("font-mono text-[12px] tabular-nums", t.key === "overdue" && count(t.key) > 0 ? "text-danger" : "text-muted-foreground")}>{count(t.key)}</span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={LuClipboardCheck} title={tab === "all" ? "Nothing in the QA queue" : `Nothing ${tab === "overdue" ? "over 24 hours" : tab}`} description="Projects appear here when a worker submits their completed work." />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="surface space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/qa/${row.projectId}`} className="font-mono text-sm font-medium text-foreground hover:text-primary">
                    {row.projectId}
                  </Link>
                  <Age row={row} />
                </div>
                <p className="text-sm text-foreground">
                  {row.clientName} · {row.serviceName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.workerName ?? "Unassigned worker"} · submitted {formatDateTime(row.submittedAt)}
                  {row.revisionCount > 0 ? ` · revision ${row.revisionCount}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">Reviewer: {row.reviewer ? `${row.reviewer.name}${row.reviewer.type === "WORKER" ? " (junior)" : ""}` : "unassigned"}</p>
                <RowActions row={row} currentUserId={currentUserId} />
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link href={`/admin/qa/${row.projectId}`} className="font-mono text-sm font-medium text-foreground hover:text-primary">
                        {row.projectId}
                      </Link>
                      {row.revisionCount > 0 ? <div className="text-xs text-gold">Revision #{row.revisionCount}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{row.clientName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.serviceName}</TableCell>
                    <TableCell className="text-sm">{row.workerName ?? <span className="text-subtle">—</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(row.submittedAt)}</TableCell>
                    <TableCell className="text-sm">
                      {row.reviewer ? (
                        <>
                          {row.reviewer.id === currentUserId ? "You" : row.reviewer.name}
                          <span className="text-xs text-muted-foreground">{row.reviewer.type === "WORKER" ? " (junior)" : row.reviewer.type ? ` (${row.reviewer.type})` : ""}</span>
                        </>
                      ) : (
                        <span className="text-subtle">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Age row={row} />
                    </TableCell>
                    <TableCell>
                      <RowActions row={row} currentUserId={currentUserId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function Age({ row }: { row: QaQueueOpsRow }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-sm tabular-nums", row.overdue ? "font-medium text-danger" : "text-muted-foreground")}>
      {ageLabel(row.ageHours)}
      {row.overdue ? <LuCircleAlert className="size-3.5" aria-label="Over 24 hours" /> : null}
    </span>
  );
}

function RowActions({ row, currentUserId }: { row: QaQueueOpsRow; currentUserId: string }) {
  const mine = row.reviewer?.id === currentUserId;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {row.bucket !== "reviewing" ? <AssignReviewerDialog projectCode={row.projectId} current={row.reviewer?.name ?? null} /> : null}
      <Button asChild size="sm" variant={row.bucket === "reviewing" && !mine ? "outline" : "default"}>
        <Link href={`/admin/qa/${row.projectId}`}>{row.bucket === "reviewing" ? (mine ? "Continue review" : "Monitor") : "Review now"}</Link>
      </Button>
    </span>
  );
}

function AssignReviewerDialog({ projectCode, current }: { projectCode: string; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reviewers, setReviewers] = React.useState<QaReviewerOption[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/admin/qa/reviewers", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { reviewers?: QaReviewerOption[]; error?: string } | null;
        if (!res.ok || !body?.reviewers) throw new Error(body?.error ?? "Could not load reviewers.");
        if (!cancelled) setReviewers(body.reviewers);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load reviewers."));
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function assign(reviewerId: string) {
    setBusy(reviewerId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/qa/${projectCode}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not assign the reviewer.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign the reviewer.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LuUserPlus className="size-4" aria-hidden />
        {current ? "Reassign" : "Assign"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assign reviewer — <span className="font-mono">{projectCode}</span>
            </DialogTitle>
            <DialogDescription>{current ? `Currently ${current}.` : "Junior QA reviewers are workers the COO has designated."}</DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <ul className="divide-y divide-border/70">
            {reviewers === null && !error ? <li className="py-6 text-center text-sm text-muted-foreground">Loading…</li> : null}
            {reviewers?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="text-sm font-medium text-foreground">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    Junior reviewer · currently reviewing {r.currentReviews} project{r.currentReviews === 1 ? "" : "s"}
                  </span>
                </span>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void assign(r.id)}>
                  {busy === r.id ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                  Assign
                </Button>
              </li>
            ))}
            {reviewers?.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No junior reviewers yet — make one from a worker&apos;s profile.</li> : null}
            <li className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="text-sm font-medium text-foreground">You</span>
                <span className="block text-xs text-muted-foreground">Review directly</span>
              </span>
              <Button size="sm" disabled={busy !== null} onClick={() => void assign("self")}>
                {busy === "self" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Self-assign
              </Button>
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
