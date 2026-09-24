"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuSearch, LuUserPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RecommendedWorkers } from "@/lib/services/operations/workers-ops";

/**
 * Assign a worker without leaving the list: the recommendation panel in a
 * dialog. Workers whose specialty matches the department come first, then
 * the lightest load, then rating; anyone over six active projects shows as
 * Busy — flagged, never blocked. The COO makes the call.
 */
export function QuickAssignDialog({
  projectCode,
  reassign = false,
  size = "sm",
  className,
}: {
  projectCode: string;
  reassign?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<RecommendedWorkers | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/workers/recommended?projectId=${encodeURIComponent(projectCode)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (RecommendedWorkers & { error?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.error ?? "Could not load workers.");
        if (!cancelled) setData(body);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load workers."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, projectCode]);

  async function assign(workerId: string) {
    setPendingId(workerId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectCode}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not assign this worker.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this worker.");
    } finally {
      setPendingId(null);
    }
  }

  const q = search.trim().toLowerCase();
  const all = data?.workers ?? [];
  const filtered = q ? all.filter((w) => w.fullName.toLowerCase().includes(q) || w.specialties.some((s) => s.toLowerCase().includes(q))) : all;
  const matches = filtered.filter((w) => w.departmentMatch);
  const visible = q || showAll ? filtered : matches.length > 0 ? matches : filtered.slice(0, 5);

  return (
    <>
      <Button type="button" size={size} variant={reassign ? "outline" : "default"} className={className} onClick={() => setOpen(true)}>
        <LuUserPlus className="size-4" aria-hidden />
        {reassign ? "Reassign" : "Assign"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Assign worker — <span className="font-mono">{projectCode}</span>
            </DialogTitle>
            <DialogDescription>
              {data ? `${data.project.department || "No department"} · ${data.project.serviceName}` : "Recommended workers for this project"}
              {data?.project.currentWorker ? ` · currently ${data.project.currentWorker.fullName}` : ""}
            </DialogDescription>
          </DialogHeader>

          <label className="relative block">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all workers…" className="pl-9" aria-label="Search workers" />
          </label>

          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="max-h-[55vh] overflow-y-auto pr-1">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading workers…</p>
            ) : visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No active workers to recommend.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {visible.map((w) => (
                  <li key={w.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{w.fullName}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            w.busy ? "bg-gold/15 text-gold" : w.status === "On Break" ? "bg-elevated text-muted-foreground" : "bg-success/15 text-success"
                          )}
                        >
                          {w.busy ? "Busy" : w.status}
                        </span>
                        {w.departmentMatch ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                            <LuCheck className="size-3" aria-hidden />
                            Department match
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{w.specialties.join(", ") || "No specialties recorded"}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                        <span className={cn("font-mono tabular-nums", w.atCapacity ? "text-danger" : "text-foreground")}>
                          Load {w.activeProjects}/{w.maxConcurrentProjects}
                          {w.busy ? " · over threshold" : ""}
                        </span>
                        <span className="text-muted-foreground">Rating {w.rating != null ? `${w.rating.toFixed(1)}/5` : "—"}</span>
                        <span className="text-muted-foreground">On-time {w.onTimeRate != null ? `${w.onTimeRate}%` : "—"}</span>
                      </p>
                    </div>
                    <Button size="sm" variant={w.busy || w.atCapacity ? "outline" : "default"} disabled={pendingId !== null} onClick={() => assign(w.id)}>
                      {pendingId === w.id ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                      {w.atCapacity ? "Assign anyway" : "Assign"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {!showAll && !q && visible.length < all.length ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Show all {all.length} workers
              </Button>
            ) : (
              <span />
            )}
            <Link href={`/admin/projects/${projectCode}/assign`} className="text-[13px] text-muted-foreground underline-offset-4 hover:underline">
              Open the full assignment screen
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
