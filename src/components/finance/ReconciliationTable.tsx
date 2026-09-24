"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuRefreshCw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn, formatDateTime, formatNaira } from "@/lib/utils";
import { isReconciled, type ReconciliationRow } from "@/lib/paystack-reconciliation";

export function ReconciliationTable({ rows }: { rows: ReconciliationRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, { ok: boolean; message: string }>>({});

  async function sync(reference: string) {
    setPending(reference);
    try {
      const res = await fetch("/api/admin/finance/paystack-reconciliation/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      setResults((prev) => ({
        ...prev,
        [reference]: { ok: res.ok, message: body?.message ?? body?.error ?? "Something went wrong." },
      }));
      if (res.ok) router.refresh();
    } catch {
      setResults((prev) => ({ ...prev, [reference]: { ok: false, message: "Network error." } }));
    } finally {
      setPending(null);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={LuCheck}
        title="Nothing to reconcile"
        description="No successful Paystack transactions in this window yet."
        className="py-10"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const inSync = isReconciled(r.ourStatus);
        const result = results[r.reference];
        return (
          <li key={r.reference} className="surface p-4 sm:flex sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {r.projectCode ? (
                  <Link
                    href={`/admin/projects/${r.projectCode}`}
                    className="text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                  >
                    {r.projectCode}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-foreground">Unknown project</span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    inSync ? "bg-success/12 text-success" : "bg-danger/12 text-danger"
                  )}
                >
                  {r.ourStatus}
                </span>
                {r.channel ? (
                  <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted-foreground">
                    {r.channel}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{r.reference}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.paidAt ? formatDateTime(r.paidAt) : "No paid-at date from Paystack"}
              </p>
              {result ? (
                <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs", result.ok ? "text-success" : "text-danger")}>
                  {result.ok ? (
                    <LuCheck className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <LuCircleAlert className="size-3.5 shrink-0" aria-hidden />
                  )}
                  {result.message}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex shrink-0 items-center gap-3 sm:mt-0">
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {formatNaira(r.amount)}
              </span>
              {inSync ? null : (
                <Button size="sm" disabled={pending !== null} onClick={() => sync(r.reference)}>
                  {pending === r.reference ? (
                    <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <LuRefreshCw className="size-4" aria-hidden />
                  )}
                  Sync
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
