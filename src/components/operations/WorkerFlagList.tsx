"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCircleCheck, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import type { WorkerProfileOps } from "@/lib/services/operations/workers-ops";

const KIND_LABEL: Record<string, string> = {
  TIER2_REFERENCE: "Tier 2 reference",
  REVIEW: "For review",
  QUALITY: "Quality",
  CONDUCT: "Conduct",
};

/** Flags against the worker, open ones first, each resolvable in place. */
export function WorkerFlagList({ workerId, flags }: { workerId: string; flags: WorkerProfileOps["flags"] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function resolve(flagId: string) {
    setBusy(flagId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/flags/${flagId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not resolve the flag.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve the flag.");
    } finally {
      setBusy(null);
    }
  }

  if (flags.length === 0) return <p className="mt-2 text-sm text-muted-foreground">No flags in the last 30 days.</p>;

  return (
    <div className="mt-2 space-y-2">
      <ul className="divide-y divide-border/70">
        {flags.map((f) => (
          <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-sm">
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", f.resolvedAt ? "bg-elevated text-muted-foreground" : f.kind === "TIER2_REFERENCE" ? "bg-danger/10 text-danger" : "bg-gold/10 text-gold")}>
              {KIND_LABEL[f.kind] ?? f.kind}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{f.reason}</span>
              <span className="block text-[12px] text-muted-foreground">
                {formatDate(f.createdAt)}
                {f.createdByName ? ` · ${f.createdByName}` : ""}
                {f.projectCode ? (
                  <>
                    {" · "}
                    <Link href={`/admin/projects/${f.projectCode}`} className="font-mono hover:text-primary">
                      {f.projectCode}
                    </Link>
                  </>
                ) : null}
                {f.resolvedAt ? ` · resolved ${formatDate(f.resolvedAt)}${f.resolutionNote ? `: ${f.resolutionNote}` : ""}` : ""}
              </span>
            </span>
            {!f.resolvedAt ? (
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void resolve(f.id)}>
                {busy === f.id ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCircleCheck className="size-4" aria-hidden />}
                Resolve
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
