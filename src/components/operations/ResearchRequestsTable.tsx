"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuBookCheck, LuCheck, LuCircleAlert, LuCircleCheck, LuCircleDot, LuCircleX, LuExternalLink, LuLoaderCircle, LuX } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatEta } from "@/lib/research-eta";
import { cn, formatDateTime, formatNaira, timeAgo } from "@/lib/utils";
import type { ResearchProgress, ResearchRequestRow, ResearchRequestStatus } from "@/lib/services/operations/research-requests";

type Tab = "all" | "pending" | "running" | "complete" | "denied";

const TABS: { key: Tab; label: string; statuses: ResearchRequestStatus[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "pending", label: "Pending approval", statuses: ["PENDING", "APPROVED"] },
  { key: "running", label: "Running", statuses: ["RUNNING"] },
  { key: "complete", label: "Complete", statuses: ["COMPLETE", "FAILED"] },
  { key: "denied", label: "Denied", statuses: ["DENIED"] },
];

const STATUS_BADGE: Record<ResearchRequestStatus, { label: string; variant: "warning" | "success" | "danger" | "neutral" | "info" }> = {
  PENDING: { label: "Pending approval", variant: "warning" },
  APPROVED: { label: "Approved — waiting for the worker", variant: "info" },
  DENIED: { label: "Denied", variant: "danger" },
  RUNNING: { label: "Running", variant: "info" },
  COMPLETE: { label: "Complete", variant: "success" },
  FAILED: { label: "Needs review", variant: "danger" },
};

const cost = (n: number | null) => (n == null ? "—" : formatNaira(n, { decimals: true }));

function Cost({ row }: { row: ResearchRequestRow }) {
  if (row.actualCostNaira != null && (row.status === "COMPLETE" || row.status === "FAILED")) return <span className="font-mono text-sm tabular-nums text-foreground">{cost(row.actualCostNaira)} actual</span>;
  if (row.costEstimate) {
    return (
      <span className="font-mono text-sm tabular-nums text-muted-foreground" title={`Average of ${row.costEstimate.basis} finished run${row.costEstimate.basis === 1 ? "" : "s"} (${row.costEstimate.scope})`}>
        {formatNaira(row.costEstimate.low)}–{formatNaira(row.costEstimate.high)}
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">No estimate yet</span>;
}

/** Research runs and approvals: pending first, with cost, outcome and a live progress view. */
export function ResearchRequestsTable({ requests }: { requests: ResearchRequestRow[] }) {
  const [tab, setTab] = React.useState<Tab>("all");
  const def = TABS.find((t) => t.key === tab)!;
  const rows = tab === "all" ? requests : requests.filter((r) => def.statuses.includes(r.status));
  const count = (t: (typeof TABS)[number]) => (t.key === "all" ? requests.length : requests.filter((r) => t.statuses.includes(r.status)).length);

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Request views" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              t.key === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <span className={cn("font-mono text-[12px] tabular-nums", t.key === "pending" && count(t) > 0 ? "text-gold" : "text-muted-foreground")}>{count(t)}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={LuBookCheck} title="Nothing here" description="Research runs appear as workers start them; requests appear when a re-run needs approval." />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="surface space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/projects/${r.projectCode}`} className="font-mono text-sm font-medium text-foreground hover:text-primary">
                    {r.projectCode}
                  </Link>
                  <Badge variant={STATUS_BADGE[r.status].variant}>{r.expired ? "Approval expired" : STATUS_BADGE[r.status].label}</Badge>
                </div>
                <p className="text-sm text-foreground">
                  {r.clientName} · {r.department || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.papersRequested} papers · {r.workerName ?? "—"} · {timeAgo(r.requestedAt)}
                </p>
                {r.reason ? <blockquote className="rounded-xl bg-zone p-3 text-[13px] text-foreground">{r.reason}</blockquote> : null}
                <p className="text-xs">
                  <Cost row={r} />
                  {r.totalReferences != null ? <span className="ml-2 text-muted-foreground">· {r.totalReferences} refs</span> : null}
                </p>
                <RowActions row={r} />
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Papers</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Pipeline status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/projects/${r.projectCode}`} className="font-mono text-sm font-medium text-foreground hover:text-primary">
                        {r.projectCode}
                      </Link>
                      {r.reason ? <div className="mt-0.5 max-w-[28ch] truncate text-xs text-muted-foreground" title={r.reason}>&ldquo;{r.reason}&rdquo;</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{r.clientName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.department || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{r.papersRequested}</TableCell>
                    <TableCell className="text-sm">{r.workerName ?? <span className="text-subtle">—</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" title={formatDateTime(r.requestedAt)}>
                      {timeAgo(r.requestedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status].variant}>{r.expired ? "Approval expired" : STATUS_BADGE[r.status].label}</Badge>
                      {r.status === "COMPLETE" && r.totalReferences != null ? <div className="mt-0.5 text-xs text-muted-foreground">{r.totalReferences} refs · {r.openAccessCount ?? 0} PDFs</div> : null}
                      {r.status === "DENIED" && r.denialReason ? <div className="mt-0.5 max-w-[24ch] truncate text-xs text-muted-foreground" title={r.denialReason}>{r.denialReason}</div> : null}
                    </TableCell>
                    <TableCell>
                      <Cost row={r} />
                    </TableCell>
                    <TableCell>
                      <RowActions row={r} />
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

function RowActions({ row }: { row: ResearchRequestRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "deny" | null>(null);
  const [denying, setDenying] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function decide(action: "approve" | "deny") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/research-requests/${row.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "deny" ? { reason } : {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save your decision.");
      }
      setDenying(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.canReview ? (
        <>
          <Button size="sm" disabled={busy !== null} onClick={() => void decide("approve")}>
            {busy === "approve" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setDenying(true)}>
            <LuX className="size-4" aria-hidden />
            Deny
          </Button>
        </>
      ) : null}
      {row.status === "RUNNING" || row.status === "COMPLETE" || row.status === "FAILED" ? <ProgressDialog row={row} /> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}

      <Dialog open={denying} onOpenChange={(v) => busy === null && setDenying(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny this re-run?</DialogTitle>
            <DialogDescription>{row.workerName ?? "The worker"} sees your reason, so say what to try instead.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The results are fine, the topic just needs a broader phrase." aria-label="Reason for denying" />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setDenying(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy !== null || reason.trim().length < 3} onClick={() => void decide("deny")}>
              {busy === "deny" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Deny
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STEP_ICON = {
  done: { icon: LuCircleCheck, cls: "text-success" },
  running: { icon: LuLoaderCircle, cls: "text-primary animate-spin" },
  waiting: { icon: LuCircleDot, cls: "text-border" },
  failed: { icon: LuCircleX, cls: "text-danger" },
} as const;

function ProgressDialog({ row }: { row: ResearchRequestRow }) {
  const [open, setOpen] = React.useState(false);
  const [progress, setProgress] = React.useState<ResearchProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/research-requests/${row.id}/progress`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as (ResearchProgress & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error ?? "Could not load progress.");
        if (cancelled) return;
        setProgress(body);
        setError(null);
        if (!body.done && !body.failed) timer = setTimeout(load, 5000);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load progress.");
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, row.id]);

  const finished = row.status === "COMPLETE" || row.status === "FAILED";

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {finished ? "View results" : "View progress"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Research pipeline — <span className="font-mono">{row.projectCode}</span>
            </DialogTitle>
            <DialogDescription>
              {row.papersRequested} papers requested · {row.department || "no department"}
              {progress?.etaSeconds != null && !progress.done && !progress.failed ? ` · ${formatEta(progress.etaSeconds)} left` : ""}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          {!progress && !error ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : null}
          {progress ? (
            <ol className="space-y-2.5">
              {progress.steps.map((s, i) => {
                const meta = STEP_ICON[s.state];
                const Icon = meta.icon;
                return (
                  <li key={s.key} className="flex items-start gap-2.5 text-sm">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", meta.cls)} aria-hidden />
                    <span className="min-w-0">
                      <span className={cn("font-medium", s.state === "waiting" ? "text-subtle" : "text-foreground")}>
                        Step {i + 1}: {s.label}
                      </span>
                      <span className="block text-[13px] text-muted-foreground">{s.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {progress ? (
            <p className="text-[13px] text-muted-foreground">
              Claude cost so far: <span className="font-mono tabular-nums text-foreground">{cost(progress.actualCostNaira)}</span>
              {progress.replacementRound > 0 ? ` · replacement round ${progress.replacementRound}` : ""}
            </p>
          ) : null}
          {progress?.driveFolderLink ? (
            <a href={progress.driveFolderLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Open the Drive folder <LuExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
