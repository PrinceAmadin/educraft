"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MonthlyDrawPanel } from "@/lib/services/finance/founder-draws";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * The month's two draws with their status, "Mark as distributed" per
 * founder and "Distribute both". A draw the bucket cannot fund is refused
 * by the server; the founder may state a smaller amount each instead.
 */
export function DistributeDraws({ panel, canAct, isFounder }: { panel: MonthlyDrawPanel; canAct: boolean; isFounder: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [partial, setPartial] = React.useState("");

  async function distribute(recipients?: ("CEO" | "CFO")[]) {
    setBusy(recipients?.join("+") ?? "both");
    setError(null);
    try {
      const amountEach = partial.trim() ? Number(partial) : undefined;
      const res = await fetch("/api/admin/finance/founder-draws/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: panel.month, recipients, ...(amountEach ? { amountEach } : {}) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The draw could not be recorded.");
      }
      setPartial("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The draw could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  const anyOutstanding = panel.rows.some((r) => r.outstanding > 0);

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border/70">
        {panel.rows.map((r) => (
          <li key={r.recipient} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {r.recipient} — {r.name}
              </p>
              <p className={cn("mt-0.5 text-xs", r.status === "DISTRIBUTED" ? "text-success" : r.status === "PARTIAL" ? "text-gold" : "text-muted-foreground")}>
                {r.status === "DISTRIBUTED"
                  ? `Distributed${r.distributedAt ? ` ${formatDate(r.distributedAt)}` : ""}`
                  : r.status === "PARTIAL"
                    ? `${formatNaira(r.distributed)} distributed, ${formatNaira(r.outstanding)} still to come`
                    : panel.drawEach === 0
                      ? "No draw at this tier"
                      : "Not paid"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">{formatNaira(r.entitled)}</span>
              {canAct && r.outstanding > 0 ? (
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => distribute([r.recipient])}>
                  {busy === r.recipient ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
                  Mark as distributed
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {canAct && anyOutstanding ? (
        <div className="flex flex-wrap items-end gap-3">
          {isFounder ? (
            <label className="block">
              <span className="mb-1 block meta-label">Partial amount each (optional)</span>
              <Input type="number" inputMode="numeric" min={0} step={1000} value={partial} onChange={(e) => setPartial(e.target.value)} placeholder={String(panel.drawEach)} className="h-10 w-44 text-sm" />
            </label>
          ) : null}
          <Button disabled={busy !== null || !panel.funded && !partial.trim()} onClick={() => distribute()}>
            {busy === "both" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
            Distribute both ({formatNaira(partial.trim() ? Number(partial) * panel.rows.filter((r) => r.outstanding > 0).length : panel.outstandingTotal)})
          </Button>
          {!panel.funded ? (
            <p className="w-full text-[13px] text-danger">
              Founder Distribution holds {formatNaira(panel.bucketBalance)} — {formatNaira(panel.shortfall)} short of this month&apos;s draws.
              {isFounder ? " You can distribute a smaller amount each." : " The founder can distribute a smaller amount."}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
