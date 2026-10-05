"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuChevronDown, LuLoaderCircle, LuRotateCcw } from "react-icons/lu";
import type { VersionSummary } from "@/lib/services/cashflow";
import { useConfirm } from "@/components/ui/confirm";
import { cn, formatDate } from "@/lib/utils";

/** Every published version, newest first: who, when, why, how many projects run under it, and what changed. */
export function VersionHistory({ history, canRepublish = false }: { history: VersionSummary[]; canRepublish?: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [error, setError] = React.useState<{ n: number; message: string } | null>(null);

  async function republish(n: number) {
    if (
      !(await confirm({
        title: `Republish version ${n} as the new active version?`,
        description: "It becomes the next version number; the history is kept.",
        confirmLabel: "Republish",
      }))
    )
      return;
    setBusy(n);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cashflow/versions/${n}/republish`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not republish this version.");
      router.refresh();
    } catch (e) {
      setError({ n, message: e instanceof Error ? e.message : "Could not republish this version." });
    } finally {
      setBusy(null);
    }
  }

  if (history.length === 0) return null;
  return (
    <section aria-labelledby="cashflow-history" className="space-y-3">
      <h2 id="cashflow-history" className="text-base font-semibold tracking-tight text-foreground">
        Version history
      </h2>
      <ul className="divide-y divide-border/70">
        {history.map((v) => {
          const expanded = open === v.versionNumber;
          return (
            <li key={v.id} className="py-3">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : v.versionNumber)}
                aria-expanded={expanded}
                className="flex w-full items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LuChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">Version {v.versionNumber}</span>
                    {v.effectiveTo == null ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Active</span> : null}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(v.effectiveFrom)}
                      {v.effectiveTo ? ` – ${formatDate(v.effectiveTo)}` : " – now"} · {v.createdByName} · {v.projects} project{v.projects === 1 ? "" : "s"}
                    </span>
                  </span>
                  {v.changeReason ? <span className="mt-0.5 block text-[13px] text-muted-foreground">{v.changeReason}</span> : null}
                </span>
              </button>
              {expanded ? (
                <div className="pl-6">
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {v.diff.length === 0 ? (
                      <li className="text-muted-foreground">{v.versionNumber === 1 ? "The first version: the manual's numbers." : "No recorded differences."}</li>
                    ) : (
                      v.diff.map((d, i) => (
                        <li key={`${d.label}-${i}`} className="text-foreground">
                          <span className="font-medium">{d.label}</span>
                          <span className="text-muted-foreground">{d.from == null ? ` — added: ${d.to}` : d.to == null ? ` — removed (was ${d.from})` : `: ${d.from} → ${d.to}`}</span>
                        </li>
                      ))
                    )}
                  </ul>
                  {canRepublish && v.effectiveTo != null ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => republish(v.versionNumber)}
                        disabled={busy === v.versionNumber}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-input px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-elevated disabled:opacity-60"
                      >
                        {busy === v.versionNumber ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuRotateCcw className="size-3.5" aria-hidden />}
                        Republish as a new version
                      </button>
                      {error?.n === v.versionNumber ? <p className="mt-1 text-xs text-danger">{error.message}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
