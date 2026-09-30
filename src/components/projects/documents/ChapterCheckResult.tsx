"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { CHAPTER_REVIEW_TEXT } from "@/lib/chapter-review";
import type { CheckView } from "@/lib/quality/chapter-gate";
import { cn } from "@/lib/utils";

/**
 * Chapter gate: one chapter check's result (the AI text's, or an upload's), for the COO's card and the
 * specialist's panel. While a check runs the page refreshes itself every 10 seconds. Staff may press
 * Check now / Check again; the specialist only reads.
 */
export function ChapterCheckResult({
  check,
  checking,
  label,
  audience,
  checkUrl,
  checkBody,
}: {
  check: CheckView | null;
  /** A check is running (or about to): the result is not in yet. */
  checking: boolean;
  /** "Quality check of the AI draft", "Quality check of this version". */
  label: string;
  audience: "staff" | "specialist";
  /** Staff: where Check now / Check again posts (null = no button). */
  checkUrl?: string | null;
  checkBody?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showWarnings, setShowWarnings] = React.useState(false);
  const t = CHAPTER_REVIEW_TEXT.check;

  React.useEffect(() => {
    if (!checking) return;
    const id = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [checking, router]);

  async function run(force: boolean) {
    if (!checkUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(checkUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...checkBody, force }) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "That didn't go through. Try again.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const status = checking ? "RUNNING" : (check?.status ?? "NONE");
  const tone =
    status === "PASSED" ? "text-success" : status === "FAILED" ? "text-danger" : status === "ERROR" ? "text-gold" : "text-muted-foreground";
  const Icon = status === "PASSED" ? LuCircleCheck : status === "FAILED" ? LuTriangleAlert : status === "ERROR" ? LuCircleAlert : LuLoaderCircle;

  return (
    <div className="space-y-2" data-chapter-check={status}>
      <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium", tone)}>
        <Icon className={cn("size-4 shrink-0", status === "RUNNING" && "animate-spin")} aria-hidden />
        <span>
          {label}: {t.chip[status as keyof typeof t.chip]}
          {check && status !== "RUNNING" && check.applicable != null ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · <span className="font-mono">{check.passedCount ?? 0}</span> of <span className="font-mono">{check.applicable}</span> checks
            </span>
          ) : null}
          {audience === "staff" && check?.costNaira != null && status !== "RUNNING" ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · <span className="font-mono">₦{check.costNaira.toFixed(2)}</span>
            </span>
          ) : null}
        </span>
      </p>

      {status === "ERROR" && check?.error ? <p className="text-[13px] text-muted-foreground">{check.error.slice(0, 240)}</p> : null}

      {status === "FAILED" && check?.failures.length ? (
        <ul className="space-y-1.5 text-[13px] text-foreground">
          {check.failures.map((f, i) => (
            <li key={`${f.id}-${i}`} className="flex gap-2">
              <span className="font-mono text-xs text-danger">{f.id}</span>
              <span className="min-w-0">
                {f.message}
                {f.quote ? <span className="text-muted-foreground"> (&ldquo;{f.quote.slice(0, 140)}&rdquo;)</span> : null}
                {f.fix ? <span className="block text-muted-foreground">{f.fix}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {check && check.warnings.length && status !== "RUNNING" ? (
        <div>
          <button type="button" className="text-[13px] font-medium text-muted-foreground underline-offset-2 hover:underline" aria-expanded={showWarnings} onClick={() => setShowWarnings((v) => !v)}>
            {showWarnings ? "Hide" : "Show"} {check.warnings.length} point{check.warnings.length === 1 ? "" : "s"} to look at
          </button>
          {showWarnings ? (
            <ul className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
              {check.warnings.map((w, i) => (
                <li key={`${w.id}-${i}`}>
                  <span className="font-mono text-xs">{w.id}</span> {w.message}
                  {w.fix ? ` ${w.fix}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {audience === "staff" && checkUrl && !checking ? (
        <div className="flex flex-wrap items-center gap-2">
          {status === "NONE" || status === "ERROR" || status === "FAILED" ? (
            <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={busy} onClick={() => void run(status !== "NONE")}>
              {busy ? <LuLoaderCircle className="animate-spin" aria-hidden /> : <LuRefreshCw aria-hidden />}
              {status === "NONE" ? "Check now" : "Check again"}
            </Button>
          ) : null}
          {status === "FAILED" ? <span className="text-xs text-muted-foreground">Check again runs the AI reviews afresh (about ₦50).</span> : null}
        </div>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
