"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { AnnualPanel } from "@/lib/services/finance/founder-draws";
import { formatDate, formatNaira } from "@/lib/utils";

/** December's profit share: the CFO recommends, the founder approves or declines. */
export function AnnualActions({ panel, isFounder, canAct }: { panel: AnnualPanel; isFounder: boolean; canAct: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function act(action: "recommend" | "approve" | "decline") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/founder-draws/annual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: panel.year, action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That could not be saved.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  const rec = panel.recommendation;
  return (
    <div className="space-y-3">
      {rec ? (
        <p className="text-sm text-foreground">
          {rec.status === "PENDING"
            ? `CFO recommendation ${formatDate(rec.createdAt)}: ${formatNaira(rec.amountEach)} each, pending the founder's approval.`
            : rec.status === "DISTRIBUTED"
              ? `Distributed${rec.decidedAt ? ` ${formatDate(rec.decidedAt)}` : ""}: ${formatNaira(rec.amountEach)} each.`
              : `Declined${rec.decidedAt ? ` ${formatDate(rec.decidedAt)}` : ""}: kept in the buckets.`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {panel.open
            ? "Available now — after the December year-end report."
            : panel.year < new Date().getUTCFullYear()
              ? `Closed: no profit share was recommended for ${panel.year}.`
              : `Available after the December ${panel.year} year-end report.`}{" "}
          Based on the surplus across all buckets beyond the next quarter&apos;s operating reserve.
        </p>
      )}
      {canAct && panel.open && !rec ? (
        <Button size="sm" disabled={busy !== null || panel.share.available <= 0} onClick={() => act("recommend")}>
          {busy === "recommend" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Recommend {formatNaira(panel.share.each)} each
        </Button>
      ) : null}
      {rec?.status === "PENDING" && isFounder ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy !== null} onClick={() => act("approve")}>
            {busy === "approve" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
            Approve and distribute
          </Button>
          <Button variant="ghost" className="text-danger" disabled={busy !== null} onClick={() => act("decline")}>
            {busy === "decline" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuX className="size-4" aria-hidden />}
            Decline
          </Button>
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
