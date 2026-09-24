"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuCheck, LuChevronDown, LuCircleAlert, LuDownload, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GroupStatus, PayoutLine, RecipientType } from "@/lib/services/finance/payouts-engine";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/** One recipient's row, as the page prepares it from the engine's groups. */
export interface PayoutGroupView {
  recipientId: string;
  name: string;
  code: string;
  href: string | null;
  /** Small chip after the name: a tier, a role, a rate. */
  chip?: string;
  /** Extra lines under the name: "5 clients · 15% · ₦52,500", "8 overrides · ₦28,000". */
  details: string[];
  bank: string | null;
  total: number;
  paid: number;
  unpaid: number;
  status: GroupStatus;
  paidAt: string | null;
  lines: PayoutLine[];
}

interface SectionTotals {
  owed: number;
  paid: number;
  unpaid: number;
  recipients: number;
  projects: number;
}

/**
 * One section of the payout engine (workers, ambassadors, executives): a
 * total line, one row per recipient that expands to its projects, and — for
 * the founder and CFO — Mark paid per recipient and for everyone unpaid,
 * each behind a confirmation that takes the transfer reference and date.
 */
export function PayoutSection({
  title,
  month,
  recipientType,
  groups,
  totals,
  canMarkPaid,
  emptyLabel,
  exportHref,
  countNoun = "project",
}: {
  title: string;
  month: string;
  recipientType: RecipientType;
  groups: PayoutGroupView[];
  totals: SectionTotals;
  canMarkPaid: boolean;
  emptyLabel: string;
  exportHref?: string;
  countNoun?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [paying, setPaying] = React.useState<{ recipientId: string | null; label: string; amount: number } | null>(null);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section aria-labelledby={`payout-${recipientType}`} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id={`payout-${recipientType}`} className="text-[15px] font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {totals.recipients} recipient{totals.recipients === 1 ? "" : "s"} · {totals.projects} {countNoun}
            {totals.projects === 1 ? "" : "s"} · {formatNaira(totals.paid)} paid / {formatNaira(totals.unpaid)} unpaid
          </p>
        </div>
        <p className="font-mono text-xl font-medium tabular-nums text-foreground">{formatNaira(totals.owed)}</p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {groups.map((g) => {
            const expanded = open.has(g.recipientId);
            return (
              <li key={g.recipientId} className="py-3">
                {/* Phone: the name takes the full width and the money sits under it; wider: side by side. */}
                <div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
                  <button
                    type="button"
                    onClick={() => toggle(g.recipientId)}
                    aria-expanded={expanded}
                    className="flex w-full min-w-0 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-1"
                  >
                    <LuChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{g.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{g.code}</span>
                        {g.chip ? <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted-foreground">{g.chip}</span> : null}
                      </span>
                      {g.details.map((d) => (
                        <span key={d} className="mt-0.5 block text-xs text-muted-foreground">
                          {d}
                        </span>
                      ))}
                      {g.bank ? <span className="mt-0.5 block text-xs text-muted-foreground">{g.bank}</span> : null}
                    </span>
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-3 pl-6 sm:mt-0 sm:shrink-0 sm:justify-end sm:pl-0">
                    <span className="text-right">
                      <span className="block font-mono text-sm font-medium tabular-nums text-foreground">{formatNaira(g.total)}</span>
                      <span className={cn("block text-[11px]", g.status === "PAID" ? "text-success" : g.status === "PARTLY" ? "text-gold" : "text-muted-foreground")}>
                        {g.status === "PAID" ? `Paid${g.paidAt ? ` ${formatDate(g.paidAt)}` : ""}` : g.status === "PARTLY" ? `${formatNaira(g.unpaid)} still unpaid` : "Unpaid"}
                      </span>
                    </span>
                    {canMarkPaid && g.unpaid > 0 ? (
                      <Button size="sm" onClick={() => setPaying({ recipientId: g.recipientId, label: g.name, amount: g.unpaid })}>
                        <LuCheck className="size-4" aria-hidden />
                        Mark paid
                      </Button>
                    ) : null}
                  </div>
                </div>
                {expanded ? (
                  <ul className="mt-2 space-y-1 pl-6">
                    {g.lines.map((l) => (
                      <li key={l.recordId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-[13px]">
                        <span className="min-w-0 text-muted-foreground">
                          <Link href={`/admin/projects/${l.projectCode}?tab=financials`} className="font-mono text-foreground hover:underline">
                            {l.projectCode}
                          </Link>
                          {" · "}
                          {l.serviceName} · {l.clientName}
                          <span className="ml-1 text-subtle">· {l.basis}</span>
                        </span>
                        <span className="font-mono tabular-nums text-foreground">
                          {formatNaira(l.amount)}
                          <span className={cn("ml-2 text-[11px]", l.status === "PAID" ? "text-success" : "text-muted-foreground")}>
                            {l.status === "PAID" ? `paid${l.paidAt ? ` ${formatDate(l.paidAt)}` : ""}` : l.completedAt ? `completed ${formatDate(l.completedAt)}` : "unpaid"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {notice ? (
        <p className={cn("flex items-start gap-2 text-sm", notice.ok ? "text-success" : "text-danger")}>
          {notice.ok ? <LuCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {notice.text}
        </p>
      ) : null}

      {(canMarkPaid && totals.unpaid > 0) || exportHref ? (
        <div className="flex flex-wrap gap-2">
          {canMarkPaid && totals.unpaid > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setPaying({ recipientId: null, label: `everyone unpaid in ${title.toLowerCase()}`, amount: totals.unpaid })}>
              Mark all unpaid as paid ({formatNaira(totals.unpaid)})
            </Button>
          ) : null}
          {exportHref ? (
            <Button size="sm" variant="ghost" asChild>
              <a href={exportHref}>
                <LuDownload className="size-4" aria-hidden />
                Export to CSV
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmPayDialog
        target={paying}
        month={month}
        recipientType={recipientType}
        onClose={() => setPaying(null)}
        onDone={(text) => {
          setNotice({ ok: true, text });
          router.refresh();
        }}
        onError={(text) => setNotice({ ok: false, text })}
      />
    </section>
  );
}

function ConfirmPayDialog({
  target,
  month,
  recipientType,
  onClose,
  onDone,
  onError,
}: {
  target: { recipientId: string | null; label: string; amount: number } | null;
  month: string;
  recipientType: RecipientType;
  onClose: () => void;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState("");

  React.useEffect(() => {
    if (target) {
      setError(null);
      setReference("");
    }
  }, [target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/payouts/mark-all-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, recipientType, recipientId: target.recipientId ?? "", reference: reference.trim(), date }),
      });
      const body = (await res.json().catch(() => null)) as { recipients?: number; totalAmount?: number; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not record the payment.");
      onClose();
      onDone(`Recorded ${formatNaira(body?.totalAmount ?? 0)} to ${body?.recipients ?? 0} recipient${body?.recipients === 1 ? "" : "s"}.`);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not record the payment.";
      setError(text);
      onError(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            {target ? `${formatNaira(target.amount)} to ${target.label}. ` : ""}
            This records the transfer as made: the recipient is told and the amount leaves the payout queue. It cannot be undone here.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Transfer reference" htmlFor="pay-ref">
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference" />
            </Field>
            <Field label="Payment date" htmlFor="pay-date">
              <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger">
              <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
              Confirm paid
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
