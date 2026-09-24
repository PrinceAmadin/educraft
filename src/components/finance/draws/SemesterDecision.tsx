"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import type { RecommendationView } from "@/lib/services/finance/founder-draws";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * The semester bonus as the founder sees it: the CFO's recommendation, the
 * calculation behind it, and Approve and distribute / Decline. The CFO sees
 * the same card with the decision left to the founder.
 */
export function SemesterDecision({
  month,
  semesterLabel,
  recommendation,
  isFounder,
  canRecommend,
  available,
}: {
  month: string;
  semesterLabel: string;
  recommendation: RecommendationView | null;
  isFounder: boolean;
  canRecommend: boolean;
  /** What the analysis says could be released now (each). */
  available: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showCalc, setShowCalc] = React.useState(false);

  async function decide(decision: "approve" | "decline") {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/founder-draws/semester-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, decision }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The decision could not be saved.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The decision could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  const rec = recommendation;
  return (
    <div className="space-y-3">
      {rec ? (
        <p className={cn("text-sm", rec.status === "PENDING" ? "text-foreground" : "text-muted-foreground")}>
          {rec.status === "PENDING"
            ? `CFO recommendation ${formatDate(rec.createdAt)}: ${formatNaira(rec.amountEach)} each (${formatNaira(rec.total)} in all), pending the founder's approval.`
            : rec.status === "DISTRIBUTED"
              ? `Distributed${rec.decidedAt ? ` ${formatDate(rec.decidedAt)}` : ""}: ${formatNaira(rec.amountEach)} each.`
              : `Declined${rec.decidedAt ? ` ${formatDate(rec.decidedAt)}` : ""}: ${formatNaira(rec.amountEach)} each stayed in the buckets.`}
          {rec.note ? <span className="block text-[13px] text-muted-foreground">“{rec.note}”</span> : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No recommendation for {semesterLabel} yet.
          {available > 0
            ? ` The analysis would release ${formatNaira(available)} each.`
            : " Nothing to release at the moment."}
          {canRecommend ? (
            <>
              {" "}
              The CFO recommends it from the{" "}
              <Link href={`/admin/finance/buckets?month=${month}`} className="text-primary hover:underline">
                Bucket manager
              </Link>
              .
            </>
          ) : null}
        </p>
      )}

      {rec?.snapshot ? (
        <div>
          <button type="button" className="text-[13px] font-medium text-primary hover:underline" onClick={() => setShowCalc((v) => !v)} aria-expanded={showCalc}>
            {showCalc ? "Hide calculation" : "View calculation"}
          </button>
          {showCalc ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
              <dt className="text-muted-foreground">Required minimum reserve</dt>
              <dd className="font-mono tabular-nums text-foreground">{formatNaira(rec.snapshot.requiredMinimum)}</dd>
              <dt className="text-muted-foreground">Operations surplus above it</dt>
              <dd className="font-mono tabular-nums text-foreground">{formatNaira(rec.snapshot.operationsSurplus)}</dd>
              <dt className="text-muted-foreground">Released from Operations (half)</dt>
              <dd className="font-mono tabular-nums text-foreground">{formatNaira(rec.snapshot.operationsRelease)}</dd>
              <dt className="text-muted-foreground">From Founder Distribution</dt>
              <dd className="font-mono tabular-nums text-foreground">{formatNaira(rec.snapshot.founderAvailable)}</dd>
            </dl>
          ) : null}
        </div>
      ) : null}

      {rec?.status === "PENDING" && isFounder ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy !== null} onClick={() => decide("approve")}>
            {busy === "approve" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
            Approve and distribute
          </Button>
          <Button variant="ghost" className="text-danger" disabled={busy !== null} onClick={() => decide("decline")}>
            {busy === "decline" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuX className="size-4" aria-hidden />}
            Decline — retain in buckets
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
