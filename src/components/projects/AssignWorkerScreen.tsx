"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LuCheck as Check,
  LuCircleAlert as CircleAlert,
  LuLoaderCircle as Loader2,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkerRecommendation } from "@/lib/services/workers";

function pct(v: number | null) {
  return v == null ? "—" : `${v}%`;
}

export function AssignWorkerScreen({
  projectCode,
  recommendations,
}: {
  projectCode: string;
  recommendations: WorkerRecommendation[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

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
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not assign this worker.");
      }
      router.push(`/admin/projects/${projectCode}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this worker.");
      setPendingId(null);
    }
  }

  if (recommendations.length === 0) {
    return (
      <p className="rounded-2xl bg-zone p-5 text-sm text-muted-foreground">
        No active workers to recommend. Add a worker first, or bring one off break.
      </p>
    );
  }

  const matches = recommendations.filter((r) => r.specialtyMatch);
  const visible = showAll ? recommendations : matches.length > 0 ? matches : recommendations.slice(0, 5);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {visible.map((w) => (
          <li
            key={w.id}
            className="surface p-4 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:p-5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{w.fullName}</span>
                <span className="font-mono text-xs text-muted-foreground">{w.workerId}</span>
                {w.specialtyMatch ? (
                  <span className="inline-flex items-center gap-1 rounded-full border-transparent bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Check className="size-3" aria-hidden />
                    Specialty match
                  </span>
                ) : null}
                {w.status === "On Break" ? (
                  <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">
                    On break
                  </span>
                ) : null}
              </div>

              {w.specialties.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {w.specialties.join(", ")}
                  {w.skills.length > 0 ? ` · ${w.skills.slice(0, 4).join(", ")}` : ""}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-mono tabular-nums",
                    w.atCapacity ? "text-danger" : "text-success"
                  )}
                >
                  Load {w.activeProjects}/{w.maxConcurrentProjects}
                  {w.atCapacity ? " · at capacity" : ""}
                </span>
                <span className="text-muted-foreground">
                  Rating {w.rating != null ? `${w.rating.toFixed(1)}/5` : "—"}
                </span>
                <span className="text-muted-foreground">On-time {pct(w.onTimeRate)}</span>
                <span className="text-muted-foreground">Revisions {pct(w.revisionRate)}</span>
                {w.avgDeliveryDays != null ? (
                  <span className="text-muted-foreground">Avg {w.avgDeliveryDays}d</span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 shrink-0 sm:mt-0">
              <Button
                size="sm"
                variant={w.atCapacity ? "outline" : "default"}
                disabled={pendingId !== null}
                onClick={() => assign(w.id)}
              >
                {pendingId === w.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {w.atCapacity ? "Assign anyway" : "Assign"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {!showAll && visible.length < recommendations.length ? (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show all {recommendations.length} workers
        </Button>
      ) : null}
    </div>
  );
}
