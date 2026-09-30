"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BonusMetrics, BonusRow } from "@/lib/services/finance/payouts-engine";
import type { BonusMetricKey, BonusRule } from "@/lib/finance/cashflow-types";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/** How each Operations figure reads, beside the bonus it decides. */
const METRIC_TEXT: Record<BonusMetricKey, (m: BonusMetrics) => string> = {
  activationRate: (m) => (m.activationRate.rate == null ? "no active ambassadors" : `${m.activationRate.rate}% (${m.activationRate.activated} of ${m.activationRate.active} active ambassadors brought a paying client)`),
  qaFirstPassRate: (m) => (m.qaFirstPassRate.rate == null ? "nothing approved this month" : `${m.qaFirstPassRate.rate}% (${m.qaFirstPassRate.firstPass} of ${m.qaFirstPassRate.approved} approved without a revision)`),
  onTimeRate: (m) => (m.onTimeRate.rate == null ? "nothing delivered against a deadline" : `${m.onTimeRate.rate}% (${m.onTimeRate.onTime} of ${m.onTimeRate.delivered} delivered on time)`),
  supervisorRejections: (m) => `${m.supervisorRejections} supervisor correction${m.supervisorRejections === 1 ? "" : "s"} this month`,
};

function metricValue(key: BonusMetricKey, m: BonusMetrics): number | null {
  switch (key) {
    case "activationRate":
      return m.activationRate.rate;
    case "qaFirstPassRate":
      return m.qaFirstPassRate.rate;
    case "onTimeRate":
      return m.onTimeRate.rate;
    case "supervisorRejections":
      return m.supervisorRejections;
  }
}

/** Met, not met, or unknown (no data this month / judged by hand). */
function isMet(rule: BonusRule, m: BonusMetrics): boolean | null {
  if (!rule.metric) return null;
  const value = metricValue(rule.metric.key, m);
  if (value == null) return null;
  return rule.metric.op === ">" ? value > rule.metric.value : value === rule.metric.value;
}

/**
 * Performance bonuses are the CFO's judgment, never automatic: each bonus of
 * the cashflow structure is listed with the Operations figure it is judged on
 * (where there is one) and its amount prefilled, so nobody has to ask
 * Operations for the numbers or Settings for the figure.
 */
export function BonusPanel({ month, metrics, bonuses, bonusRules, canAct }: { month: string; metrics: BonusMetrics; bonuses: BonusRow[]; bonusRules: BonusRule[]; canAct: boolean }) {
  const router = useRouter();
  const entries = bonusRules.filter((r) => r.recipient === "hog" || r.recipient === "coo");
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [paying, setPaying] = React.useState<string | null>(null);

  async function add(rule: BonusRule) {
    const amount = Number(amounts[rule.key] ?? rule.amountNgn);
    if (!amount || amount <= 0) {
      setError("Enter the bonus amount first.");
      return;
    }
    setBusy(rule.key);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/payouts/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, recipientId: rule.recipient === "hog" ? "HOG" : "COO", amount, reason: rule.condition || rule.label }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The bonus could not be added.");
      }
      setAmounts((a) => ({ ...a, [rule.key]: "" }));
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
        Entered by hand after reviewing the month. The figure each bonus is judged on is shown beside it, from Operations data; the amounts come from EduCraft Cashflow.
      </p>

      {entries.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No executive bonuses are set up in the cashflow structure.</p> : null}
      <ul className="mt-4 divide-y divide-border/70">
        {entries.map((rule) => {
          const met = isMet(rule, metrics);
          const who = rule.recipient === "hog" ? "HOG" : "COO";
          return (
            <li key={rule.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-x-6">
              <div className="min-w-0 sm:flex-1">
                <p className="text-sm text-foreground">
                  {who} bonus — {rule.label}
                </p>
                <p className={cn("mt-0.5 text-xs", met === true ? "text-success" : "text-muted-foreground")}>
                  {met === true ? "Met · " : met === false ? "Not met · " : ""}
                  {rule.metric ? METRIC_TEXT[rule.metric.key](metrics) : "Judged by hand"}
                  {" · "}
                  {formatNaira(rule.amountNgn)} {rule.cadence}
                </p>
              </div>
              {canAct ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    aria-label={`${rule.label} amount`}
                    placeholder={String(rule.amountNgn)}
                    value={amounts[rule.key] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [rule.key]: e.target.value }))}
                    className="h-10 min-w-0 flex-1 text-sm sm:w-32 sm:flex-none"
                  />
                  <Button size="sm" variant="outline" disabled={busy === rule.key} onClick={() => add(rule)}>
                    {busy === rule.key ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
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
