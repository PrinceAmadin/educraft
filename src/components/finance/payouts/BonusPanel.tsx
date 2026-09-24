"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BonusMetrics, BonusRow } from "@/lib/services/finance/payouts-engine";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/** The four bonuses the spec names, each judged by the CFO against the month's metric. */
const ENTRIES: { key: string; recipientId: "HOG" | "COO"; label: string; reason: string; metric: (m: BonusMetrics) => string; met: (m: BonusMetrics) => boolean | null }[] = [
  {
    key: "hog-activation",
    recipientId: "HOG",
    label: "HOG bonus — activation rate above 30%",
    reason: "Ambassador activation rate above 30%",
    metric: (m) => (m.activationRate.rate == null ? "no active ambassadors" : `${m.activationRate.rate}% (${m.activationRate.activated} of ${m.activationRate.active} active ambassadors brought a paying client)`),
    met: (m) => (m.activationRate.rate == null ? null : m.activationRate.rate > 30),
  },
  {
    key: "coo-qa",
    recipientId: "COO",
    label: "COO bonus — QA first-pass rate above 85%",
    reason: "QA first-pass rate above 85%",
    metric: (m) => (m.qaFirstPassRate.rate == null ? "nothing approved this month" : `${m.qaFirstPassRate.rate}% (${m.qaFirstPassRate.firstPass} of ${m.qaFirstPassRate.approved} approved without a revision)`),
    met: (m) => (m.qaFirstPassRate.rate == null ? null : m.qaFirstPassRate.rate > 85),
  },
  {
    key: "coo-ontime",
    recipientId: "COO",
    label: "COO bonus — on-time delivery above 97%",
    reason: "On-time delivery rate above 97%",
    metric: (m) => (m.onTimeRate.rate == null ? "nothing delivered against a deadline" : `${m.onTimeRate.rate}% (${m.onTimeRate.onTime} of ${m.onTimeRate.delivered} delivered on time)`),
    met: (m) => (m.onTimeRate.rate == null ? null : m.onTimeRate.rate > 97),
  },
  {
    key: "coo-supervisor",
    recipientId: "COO",
    label: "COO bonus — zero supervisor rejections",
    reason: "Zero supervisor rejections",
    metric: (m) => `${m.supervisorRejections} supervisor correction${m.supervisorRejections === 1 ? "" : "s"} this month`,
    met: (m) => m.supervisorRejections === 0,
  },
];

/**
 * Performance bonuses are the CFO's judgment, never automatic: the metric
 * each one is judged on sits beside its entry so nobody has to ask
 * Operations for the numbers.
 */
export function BonusPanel({ month, metrics, bonuses, canAct }: { month: string; metrics: BonusMetrics; bonuses: BonusRow[]; canAct: boolean }) {
  const router = useRouter();
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [paying, setPaying] = React.useState<string | null>(null);

  async function add(entry: (typeof ENTRIES)[number]) {
    const amount = Number(amounts[entry.key] ?? "");
    if (!amount || amount <= 0) {
      setError("Enter the bonus amount first.");
      return;
    }
    setBusy(entry.key);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/payouts/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, recipientId: entry.recipientId, amount, reason: entry.reason }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The bonus could not be added.");
      }
      setAmounts((a) => ({ ...a, [entry.key]: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The bonus could not be added.");
    } finally {
      setBusy(null);
    }
  }

  async function pay(id: string) {
    setPaying(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${id}/mark-paid`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The bonus could not be marked paid.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The bonus could not be marked paid.");
    } finally {
      setPaying(null);
    }
  }

  return (
    <section aria-labelledby="bonus-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
      <h2 id="bonus-heading" className="text-[15px] font-semibold text-foreground">
        Performance bonuses
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Entered by hand after reviewing the month. The figure each bonus is judged on is shown beside it, from Operations data.
      </p>

      <ul className="mt-4 divide-y divide-border/70">
        {ENTRIES.map((entry) => {
          const met = entry.met(metrics);
          return (
            <li key={entry.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-x-6">
              <div className="min-w-0 sm:flex-1">
                <p className="text-sm text-foreground">{entry.label}</p>
                <p className={cn("mt-0.5 text-xs", met === true ? "text-success" : met === false ? "text-muted-foreground" : "text-muted-foreground")}>
                  {met === true ? "Met · " : met === false ? "Not met · " : ""}
                  {entry.metric(metrics)}
                </p>
              </div>
              {canAct ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    aria-label={`${entry.label} amount`}
                    placeholder="₦"
                    value={amounts[entry.key] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [entry.key]: e.target.value }))}
                    className="h-10 min-w-0 flex-1 text-sm sm:w-32 sm:flex-none"
                  />
                  <Button size="sm" variant="outline" disabled={busy === entry.key} onClick={() => add(entry)}>
                    {busy === entry.key ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                    Add bonus
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {bonuses.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-muted-foreground">Bonuses this month</h3>
          <ul className="mt-2 divide-y divide-border/70">
            {bonuses.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <span className="min-w-0 text-foreground">
                  {b.recipientName} <span className="text-muted-foreground">({b.recipientId})</span> · {b.reason}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-foreground">{formatNaira(b.amount)}</span>
                  {b.status === "PAID" ? (
                    <span className="text-[11px] text-success">Paid{b.paidAt ? ` ${formatDate(b.paidAt)}` : ""}</span>
                  ) : canAct ? (
                    <Button size="sm" disabled={paying === b.id} onClick={() => pay(b.id)}>
                      {paying === b.id ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
                      Mark paid
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Unpaid</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </section>
  );
}
