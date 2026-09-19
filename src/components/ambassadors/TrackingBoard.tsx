"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LuCheck,
  LuCircleAlert,
  LuLoaderCircle,
  LuSearch,
  LuTrophy,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { CommissionPreview, CommissionRatePicker } from "@/components/ambassadors/CommissionPickers";
import {
  EmailToggle,
  describeAllocation,
  postAllocation,
  type AllocationOutcome,
} from "@/components/projects/AmbassadorAllocation";
import type { AllocatableAmbassador } from "@/lib/services/ambassador-commission";
import type { OpenJob, RecentCommission, TrackingRow } from "@/lib/services/ambassador-tracking";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * True when the old Redis count could not be read for someone who has an old
 * link. Showing 0 would be wrong (they may have hundreds), so the cells say so.
 */
function oldCountMissing(row: TrackingRow): boolean {
  return row.legacyClicks === null && Boolean(row.legacySlotId);
}

function clicksLabel(row: TrackingRow): string {
  return oldCountMissing(row) ? "—" : String(row.clicks);
}

/** Conversion is only meaningful once a link has been clicked. Jobs per click, old and new clicks together. */
function conversion(row: TrackingRow): string {
  if (!row.clicks || oldCountMissing(row)) return "—";
  return `${Math.round((row.jobs / row.clicks) * 1000) / 10}%`;
}

export function TrackingBoard({
  rows,
  openJobs,
  recent,
  ambassadors,
}: {
  rows: TrackingRow[];
  openJobs: OpenJob[];
  recent: RecentCommission[];
  ambassadors: AllocatableAmbassador[];
}) {
  const [query, setQuery] = React.useState("");
  const [logFor, setLogFor] = React.useState<AllocatableAmbassador | null>(null);
  const [outcome, setOutcome] = React.useState<AllocationOutcome | null>(null);

  const allocatable = React.useMemo(() => new Map(ambassadors.map((a) => [a.id, a])), [ambassadors]);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? rows.filter((r) =>
        [r.name, r.code, r.university ?? "", r.legacySlotId ?? ""].some((v) => v.toLowerCase().includes(needle))
      )
    : rows;

  function openLog(row: TrackingRow) {
    const a = allocatable.get(row.id);
    if (a) {
      setOutcome(null);
      setLogFor(a);
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="leaderboard-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="leaderboard-heading" className="text-[15px] font-semibold text-foreground">
              Leaderboard
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Ranked by commission logged. Clicks include the old panel counts plus everything tracked since. Conversion is jobs per click.
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <LuSearch
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ambassadors"
              className="pl-10"
              aria-label="Search ambassadors"
            />
          </label>
        </div>

        {outcome ? (
          <p
            role="status"
            className={cn(
              "flex items-start gap-2 rounded-xl bg-zone px-4 py-3 text-sm",
              outcome.tone === "success" ? "text-success" : "text-gold"
            )}
          >
            {outcome.tone === "success" ? (
              <LuCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            {outcome.text}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon={LuTrophy}
            title="No ambassadors yet"
            description="Approved applications and ambassadors you add show up here."
          />
        ) : visible.length === 0 ? (
          <p className="rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">
            No ambassador matches &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <>
            {/* Phones: a divided list */}
            <ol className="divide-y divide-border/80 md:hidden">
              {visible.map((row) => {
                const rank = rows.indexOf(row) + 1;
                const canLog = allocatable.has(row.id);
                return (
                  <li key={row.id} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/admin/ambassadors/${row.id}`} className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          <span className="mr-1.5 font-mono text-xs text-subtle">{rank}.</span>
                          {row.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{row.code}</span>
                          {row.university ? ` · ${row.university}` : ""}
                          {row.email ? "" : " · no email"}
                        </span>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={!canLog}
                        onClick={() => openLog(row)}
                      >
                        Log job
                      </Button>
                    </div>
                    <dl className="mt-2.5 grid grid-cols-5 gap-2 text-xs">
                      <Metric label="Clicks" value={clicksLabel(row)} />
                      <Metric label="7 days" value={String(row.weekClicks)} />
                      <Metric label="Jobs" value={String(row.jobs)} />
                      <Metric label="Conv." value={conversion(row)} />
                      <Metric label="Earned" value={formatNaira(row.commissionLogged)} />
                    </dl>
                    <Link
                      href={`/admin/ambassadors/${row.id}?view=analytics`}
                      className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                    >
                      Link analytics
                    </Link>
                  </li>
                );
              })}
            </ol>

            {/* Desktop: the table is the content */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Ambassador</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">7 days</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const canLog = allocatable.has(row.id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs text-subtle">{rows.indexOf(row) + 1}</TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/ambassadors/${row.id}`}
                            className="text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                          >
                            {row.name}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">
                            {row.code}
                            {row.legacySlotId ? ` · slot ${row.legacySlotId}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.university ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {clicksLabel(row)}
                          {row.trackedClicks > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              {oldCountMissing(row) ? `${row.trackedClicks} tracked` : `${row.uniqueClicks} unique`}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{row.weekClicks}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{row.jobs}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{conversion(row)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatNaira(row.commissionLogged)}
                          {row.commissionPaid > 0 ? (
                            <div className="text-xs text-muted-foreground">{formatNaira(row.commissionPaid)} paid</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.email ? (
                            <span className="text-success">On file</span>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="space-x-2 whitespace-nowrap text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/admin/ambassadors/${row.id}?view=analytics`}>Analytics</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canLog}
                            title={canLog ? undefined : `${row.status} ambassadors can't be allocated jobs`}
                            onClick={() => openLog(row)}
                          >
                            Log job
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="text-[15px] font-semibold text-foreground">
          Recent commissions
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-2xl bg-zone px-4 py-6 text-sm text-muted-foreground">
            Nothing logged yet. Use Log job above, or pick an ambassador when you create a project.
          </p>
        ) : (
          <ul className="divide-y divide-border/80">
            {recent.map((c) => (
              <li key={c.projectDbId}>
                <Link
                  href={`/admin/projects/${c.projectCode}?tab=financials`}
                  className="flex min-h-12 items-center justify-between gap-3 py-3 transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none sm:px-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      <span className="font-mono">{c.projectCode}</span> · {c.ambassadorName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(c.allocatedAt)} ·{" "}
                      {c.notifiedAt ? `emailed ${formatDate(c.notifiedAt)}` : "not emailed yet"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                    {formatNaira(c.commission)}
                    <span className="block text-xs text-muted-foreground">{c.rate}%</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LogJobDialog
        ambassador={logFor}
        openJobs={openJobs}
        onClose={() => setLogFor(null)}
        onLogged={(o) => setOutcome(o)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-subtle">{label}</dt>
      <dd className="truncate font-mono tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

// ── Log job ──────────────────────────────────────────────────────────────

/**
 * The original panel's "Log Order", tied to a real job: pick the job, the
 * rate (their tier rate by default, or any rate), and whether to email them.
 */
function LogJobDialog({
  ambassador,
  openJobs,
  onClose,
  onLogged,
}: {
  ambassador: AllocatableAmbassador | null;
  openJobs: OpenJob[];
  onClose: () => void;
  onLogged: (outcome: AllocationOutcome) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [rate, setRate] = React.useState(10);
  const [notify, setNotify] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!ambassador) return;
    setQuery("");
    setJobId(null);
    setRate(ambassador.tierRate);
    setNotify(Boolean(ambassador.email));
    setError(null);
  }, [ambassador]);

  const job = openJobs.find((j) => j.id === jobId) ?? null;
  const needle = query.trim().toLowerCase();
  const jobs = needle
    ? openJobs.filter((j) =>
        [j.code, j.title, j.client, j.service].some((v) => v.toLowerCase().includes(needle))
      )
    : openJobs;

  async function confirm() {
    if (!ambassador || !job) return;
    setBusy(true);
    setError(null);
    try {
      const body = await postAllocation(job.code, { ambassadorId: ambassador.id, rate, notify });
      onLogged(describeAllocation(body));
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log this job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={ambassador !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Log a job for {ambassador?.name}</DialogTitle>
          <DialogDescription>
            Their commission comes off the job, is logged under Expenses, and they&apos;re emailed
            about it.
          </DialogDescription>
        </DialogHeader>

        {ambassador ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="meta-label">Job</p>
              {openJobs.length === 0 ? (
                <p className="rounded-xl bg-zone px-4 py-5 text-sm text-muted-foreground">
                  Every open job already has an ambassador. Create the project first, then log it
                  here — or pick the ambassador on the new-project form.
                </p>
              ) : (
                <>
                  <label className="relative block">
                    <LuSearch
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search job ID, title or client"
                      className="pl-10"
                      aria-label="Search jobs"
                    />
                  </label>
                  <div role="listbox" aria-label="Open jobs" className="max-h-56 overflow-y-auto overflow-x-hidden rounded-xl bg-zone p-1">
                    {jobs.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">No job matches.</p>
                    ) : (
                      jobs.map((j) => {
                        const active = j.id === jobId;
                        return (
                          <button
                            key={j.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => setJobId(j.id)}
                            className={cn(
                              "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                              active ? "bg-card shadow-soft" : "hover:bg-card/60"
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground">
                                <span className="font-mono">{j.code}</span> · {j.title}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {j.client} · {j.service}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                              {formatNaira(j.price)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {job ? (
              <>
                <CommissionRatePicker value={rate} onChange={setRate} id="log-rate" />
                <CommissionPreview
                  price={job.price}
                  workerPayout={job.workerPayout}
                  rate={rate}
                  parent={ambassador.parent}
                />
                <EmailToggle
                  ambassador={ambassador}
                  checked={notify}
                  onChange={setNotify}
                  downpaymentVerified={job.downpaymentVerified}
                />
              </>
            ) : null}

            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={!job || busy} onClick={confirm}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                Log job
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
