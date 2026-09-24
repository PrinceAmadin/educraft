"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCheck, LuChevronDown, LuCircleAlert, LuLoaderCircle, LuSend } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CooPayoutView } from "@/lib/services/finance/payouts-engine";
import { cn, formatDate, formatDateTime, formatNaira } from "@/lib/utils";

/**
 * The COO's corner of the payout engine: how many projects completed, the
 * worker payouts the engine calculated, and one act — submit the list to
 * the CFO. Nothing here marks money paid, and ambassador and executive
 * commissions never reach this screen.
 */
export function CooPayoutPanel({ data }: { data: CooPayoutView }) {
  const router = useRouter();
  const [showList, setShowList] = React.useState(false);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/finance/payouts/coo-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: data.month, note: note.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { workerTotal?: number; workerCount?: number; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "The list could not be submitted.");
      setDone(`Submitted ${formatNaira(body?.workerTotal ?? 0)} across ${body?.workerCount ?? 0} worker${body?.workerCount === 1 ? "" : "s"} to the CFO.`);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-zone p-5 sm:p-7">
        <p className="meta-label">{data.monthLabel}</p>
        <p className="mt-2 text-lg text-foreground">
          This month you completed <span className="font-mono font-medium tabular-nums">{data.projectCount}</span> project{data.projectCount === 1 ? "" : "s"}.
        </p>
        <p className="mt-1 text-lg text-foreground">
          Worker payouts calculated: <span className="font-mono font-medium tabular-nums">{formatNaira(data.workerTotal)}</span> across {data.workerCount} worker
          {data.workerCount === 1 ? "" : "s"}.
        </p>
        {data.submission ? (
          <p className={cn("mt-3 text-[13px]", data.stale ? "text-gold" : "text-muted-foreground")}>
            {data.stale
              ? `Submitted ${formatDateTime(data.submission.submittedAt)} at ${formatNaira(data.submission.workerTotal)} — the figures have changed since, so submit again.`
              : `Submitted ${formatDateTime(data.submission.submittedAt)} (${formatNaira(data.submission.workerTotal)} across ${data.submission.workerCount} worker${data.submission.workerCount === 1 ? "" : "s"}).${data.submission.revisions > 0 ? ` ${data.submission.revisions} earlier version${data.submission.revisions === 1 ? "" : "s"} kept.` : ""}`}
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">Not submitted yet.</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowList((v) => !v)} aria-expanded={showList}>
            {showList ? "Hide worker payout list" : "Review worker payout list"}
          </Button>
        </div>
      </section>

      {showList ? (
        <section aria-label="Worker payouts" className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">Worker payouts — {data.monthLabel}</h2>
          {data.workers.length === 0 ? (
            <p className="rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">No worker payouts this month yet: none of the month&apos;s projects has reached Completed.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {data.workers.map((w) => {
                const expanded = open.has(w.recipientId);
                return (
                  <li key={w.recipientId} className="py-3">
                    <button type="button" onClick={() => toggle(w.recipientId)} aria-expanded={expanded} className="flex w-full items-start justify-between gap-4 text-left">
                      <span className="flex min-w-0 items-start gap-2">
                        <LuChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {w.name} <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{w.code}</span>
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {w.projectCount} project{w.projectCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-sm font-medium tabular-nums text-foreground">{formatNaira(w.total)}</span>
                        <span className={cn("block text-[11px]", w.status === "PAID" ? "text-success" : "text-muted-foreground")}>
                          {w.status === "PAID" ? `Paid${w.paidAt ? ` ${formatDate(w.paidAt)}` : ""}` : w.status === "PARTLY" ? "Partly paid" : "Unpaid"}
                        </span>
                      </span>
                    </button>
                    {expanded ? (
                      <ul className="mt-2 space-y-1 pl-6 text-[13px]">
                        {w.lines.map((l) => (
                          <li key={l.recordId} className="flex flex-wrap items-center justify-between gap-x-4 text-muted-foreground">
                            <span>
                              <Link href={`/admin/projects/${l.projectCode}`} className="font-mono text-foreground hover:underline">
                                {l.projectCode}
                              </Link>
                              {" · "}
                              {l.serviceName} · {l.clientName}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">{formatNaira(l.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="submit-heading" className="space-y-3">
        <h2 id="submit-heading" className="text-[15px] font-semibold text-foreground">
          Submit to the CFO for processing
        </h2>
        <Textarea aria-label="Note to the CFO" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the CFO should know (optional)" />
        {error ? (
          <p className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <LuCheck className="size-4 shrink-0" aria-hidden />
            {done}
          </p>
        ) : null}
        <Button disabled={busy || data.workerCount === 0} onClick={submit}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuSend className="size-4" aria-hidden />}
          {data.submission ? "Submit again" : "Submit to CFO for processing"}
        </Button>
      </section>
    </div>
  );
}
