"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/utils";

/** The CFO's act: turn the semester analysis into a recommendation the founder approves on Founder draws. */
export function RecommendBonusButton({ month, each, disabledReason }: { month: string; each: number; disabledReason: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/buckets/recommend-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The recommendation could not be saved.");
      }
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The recommendation could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (disabledReason) return <p className="text-[13px] text-muted-foreground">{disabledReason}</p>;

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-foreground">Recommend {formatNaira(each)} each to the founder?</span>
          <Button size="sm" disabled={busy} onClick={submit}>
            {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            Yes, recommend
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => setConfirming(true)}>
          Recommend semester bonus
        </Button>
      )}
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
