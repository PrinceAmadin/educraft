"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuArrowDown, LuArrowUp, LuCircleAlert, LuLoaderCircle, LuReceipt } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/Field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  MANUAL_PAYMENT_METHODS,
  REVENUE_SOURCE_LABELS,
  REVENUE_TYPE_LABELS,
  type RevenueSort,
  type RevenueSource,
} from "@/lib/finance/revenue-constants";
import type { RevenueRow } from "@/lib/services/finance/revenue";
import { cn, formatDate, formatNaira } from "@/lib/utils";

/**
 * Status wording and colour: the row's status is the fact; the tone says
 * whether finance needs to act. A Pending bank transfer waits on finance; a
 * Pending Paystack row is a checkout the client opened and has not finished.
 */
function StatusPill({ status, source }: { status: string; source: string }) {
  const manualPending = status === "Pending" && source === "MANUAL";
  const tone =
    status === "Confirmed"
      ? "bg-success/12 text-success"
      : manualPending
        ? "bg-gold/15 text-gold"
        : status === "Duplicate"
          ? "bg-danger/12 text-danger"
          : "bg-elevated text-muted-foreground";
  const label =
    status === "Pending" ? (manualPending ? "Awaiting verification" : "Checkout open") : status === "Failed" ? "Checkout not completed" : status;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{label}</span>;
}

function methodLabel(row: RevenueRow): string {
  if (row.method) return row.method;
  return REVENUE_SOURCE_LABELS[row.source as RevenueSource] ?? row.source;
}

function SortHeader({ field, label, className }: { field: RevenueSort; label: string; className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = (searchParams.get("sort") || "date") === field;
  const dir = active ? searchParams.get("dir") || "desc" : "desc";
  const next = new URLSearchParams(searchParams.toString());
  next.set("sort", field);
  next.set("dir", active && dir === "desc" ? "asc" : "desc");
  next.delete("page");
  return (
    <th scope="col" className={cn("py-2 font-medium", className)}>
      <Link
        href={`${pathname}?${next.toString()}`}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      >
        {label}
        {active ? dir === "asc" ? <LuArrowUp className="size-3" aria-hidden /> : <LuArrowDown className="size-3" aria-hidden /> : null}
      </Link>
    </th>
  );
}

/**
 * The Revenue Tracker table. Faint row dividers, no outer container; cards
 * under md. A row awaiting verification carries Confirm / Refuse; both go
 * through the same two endpoints whichever layout is on screen.
 */
export function RevenueTable({ rows, canAct }: { rows: RevenueRow[]; canAct: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState<RevenueRow | null>(null);
  const [refusing, setRefusing] = React.useState<RevenueRow | null>(null);

  if (rows.length === 0) {
    return <EmptyState icon={LuReceipt} title="No payments match" description="Try a wider date range or clear the filters." />;
  }

  const actions = (row: RevenueRow) => {
    if (!canAct || row.status !== "Pending" || row.source !== "MANUAL") return null;
    // The leg went back to Unpaid or was verified on another row: this one is stale, nothing to do.
    if (row.legStatus !== "Paid") return <span className="text-xs text-muted-foreground">Superseded</span>;
    return (
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => setConfirming(row)}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRefusing(row)}>
          Refuse
        </Button>
      </div>
    );
  };

  return (
    <>
      {/* Phone: one card per payment */}
      <ul className="divide-y divide-border/70 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.clientName ?? "—"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.projectCode ? (
                    <Link href={`/admin/projects/${r.projectCode}?tab=financials`} className="font-mono hover:underline">
                      {r.projectCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {r.serviceName ? ` · ${r.serviceName}` : ""}
                </p>
              </div>
              <span className={cn("shrink-0 font-mono text-sm font-medium tabular-nums", r.direction === "OUTFLOW" ? "text-danger" : "text-foreground")}>
                {r.direction === "OUTFLOW" ? "−" : ""}
                {formatNaira(r.amount)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <StatusPill status={r.status} source={r.source} />
              <span>{REVENUE_TYPE_LABELS[r.type]}</span>
              <span aria-hidden>·</span>
              <span>{methodLabel(r)}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(r.date)}</span>
              {r.verifiedBy ? <span>· by {r.verifiedBy}</span> : null}
            </div>
            {r.reference ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">ref {r.reference}</p> : null}
            <div className="mt-2">{actions(r)}</div>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <SortHeader field="date" label="Date" />
              <th scope="col" className="py-2 font-medium">Project</th>
              <th scope="col" className="py-2 font-medium">Client</th>
              <th scope="col" className="py-2 font-medium">Service</th>
              <SortHeader field="amount" label="Amount" className="pr-5 text-right" />
              <th scope="col" className="py-2 font-medium">Type</th>
              <th scope="col" className="py-2 font-medium">Method</th>
              <th scope="col" className="py-2 font-medium">Status</th>
              <th scope="col" className="py-2 font-medium">Verified by</th>
              <th scope="col" className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="py-3 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</td>
                <td className="whitespace-nowrap py-3 pr-3 font-mono text-xs">
                  {r.projectCode ? (
                    <Link href={`/admin/projects/${r.projectCode}?tab=financials`} className="text-foreground hover:underline">
                      {r.projectCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{r.paymentId}</span>
                </td>
                <td className="py-3 pr-3 text-foreground">
                  {r.clientName ?? "—"}
                  {r.ambassadorName ? <span className="mt-0.5 block text-[11px] text-muted-foreground">via {r.ambassadorName}</span> : null}
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{r.serviceName ?? "—"}</td>
                <td className={cn("whitespace-nowrap py-3 pr-5 text-right font-mono font-medium tabular-nums", r.direction === "OUTFLOW" ? "text-danger" : "text-foreground")}>
                  {r.direction === "OUTFLOW" ? "−" : ""}
                  {formatNaira(r.amount)}
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{REVENUE_TYPE_LABELS[r.type]}</td>
                <td className="py-3 pr-3 text-muted-foreground">
                  {methodLabel(r)}
                  {r.reference ? <span className="mt-0.5 block font-mono text-[11px]">ref {r.reference}</span> : null}
                </td>
                <td className="py-3 pr-3">
                  <StatusPill status={r.status} source={r.source} />
                  {r.status === "Confirmed" && r.direction === "INFLOW" && !r.allocated ? (
                    <span className="mt-1 block text-[11px] text-muted-foreground">Not in buckets — run the backfill</span>
                  ) : null}
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{r.verifiedBy ?? "—"}</td>
                <td className="py-3 text-right">{actions(r) ?? <span className="text-xs text-muted-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog row={confirming} onClose={() => setConfirming(null)} onDone={() => router.refresh()} />
      <RefuseDialog row={refusing} onClose={() => setRefusing(null)} onDone={() => router.refresh()} />
    </>
  );
}

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "That action could not be completed.");
  }
}

function ConfirmDialog({ row, onClose, onDone }: { row: RevenueRow | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState("Bank transfer");
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!row) return;
    setMethod(row.method && (MANUAL_PAYMENT_METHODS as readonly string[]).includes(row.method) ? row.method : "Bank transfer");
    setReference(row.reference ?? "");
    setDate(row.date.slice(0, 10));
    setNotes("");
    setError(null);
  }, [row]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/admin/finance/revenue/${row.id}/confirm`, { paymentMethod: method, reference: reference.trim(), date, notes: notes.trim() });
      onClose();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm {row ? REVENUE_TYPE_LABELS[row.type].toLowerCase() : "payment"}</DialogTitle>
          <DialogDescription>
            {row ? `${formatNaira(row.amount)} on ${row.projectCode} from ${row.clientName ?? "the client"}. ` : ""}
            Confirming verifies the leg, moves EduCraft&apos;s retained share into the buckets and advances the project if it was waiting.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Payment method" htmlFor="rc-method">
              <Select id="rc-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {MANUAL_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment date" htmlFor="rc-date">
              <Input id="rc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Reference" htmlFor="rc-ref">
            <Input id="rc-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / receipt reference" />
          </Field>
          <Field label="Notes" htmlFor="rc-notes">
            <Textarea id="rc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
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
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Confirm payment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RefuseDialog({ row, onClose, onDone }: { row: RevenueRow | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (row) {
      setNote("");
      setError(null);
    }
  }, [row]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/admin/finance/revenue/${row.id}/reject`, { note: note.trim() });
      onClose();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refuse this payment?</DialogTitle>
          <DialogDescription>
            {row ? `${formatNaira(row.amount)} on ${row.projectCode}. ` : ""}
            The leg goes back to unpaid and the client and operations are told. Nothing was allocated, so nothing is reversed.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Why" htmlFor="rr-note">
            <Textarea id="rr-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transfer not found on the statement…" />
          </Field>
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
            <Button type="submit" size="sm" variant="destructive" disabled={busy || note.trim().length < 3}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Refuse payment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
