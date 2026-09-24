"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuRepeat, LuTrash2, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BUCKET_META } from "@/lib/finance/commission-config";
import type { ExpenseRow } from "@/lib/services/expenses";
import { cn, formatDate, formatNaira } from "@/lib/utils";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "PENDING_APPROVAL"
      ? "bg-gold/15 text-gold"
      : status === "DECLINED"
        ? "bg-danger/12 text-danger"
        : status === "APPROVED"
          ? "bg-success/12 text-success"
          : "bg-elevated text-muted-foreground";
  const label = status === "PENDING_APPROVAL" ? "Awaiting approval" : status === "AUTO_APPROVED" ? "Logged" : status === "APPROVED" ? "Approved" : "Declined";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>{label}</span>;
}

function bucketLabel(b: ExpenseRow["bucketSource"]): string {
  return b ? BUCKET_META[b].label : "—";
}

function lockReason(e: ExpenseRow): string | null {
  if (e.projectId) return "From a job";
  if (e.kind === "AI") return "From the AI usage log";
  return null;
}

/**
 * Expenses as a list: faint dividers, no container; cards under md. The
 * founder approves or declines rows waiting on them and may delete manual
 * rows; commission and Claude roll-up rows are locked to their sources.
 */
export function ExpensesTable({ rows, canDelete, canApprove }: { rows: ExpenseRow[]; canDelete: boolean; canApprove: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<ExpenseRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmDelete() {
    if (!pending) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/expenses/${pending.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not delete this expense.");
      }
      setPending(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this expense.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: string, decision: "approve" | "decline") {
    setBusy(`${decision}:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/expenses/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "That could not be saved.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  const actions = (e: ExpenseRow) => {
    const locked = lockReason(e);
    if (canApprove && e.approvalStatus === "PENDING_APPROVAL") {
      return (
        <div className="flex gap-1.5">
          <Button size="sm" disabled={busy !== null} onClick={() => decide(e.id, "approve")}>
            {busy === `approve:${e.id}` ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuCheck className="size-4" aria-hidden />}
            Approve
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" disabled={busy !== null} onClick={() => decide(e.id, "decline")}>
            {busy === `decline:${e.id}` ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuX className="size-4" aria-hidden />}
            Decline
          </Button>
        </div>
      );
    }
    if (locked) return <span className="text-xs text-muted-foreground">{locked}</span>;
    if (canDelete) {
      return (
        <Button size="icon-sm" variant="ghost" className="text-danger" aria-label="Delete expense" onClick={() => setPending(e)}>
          <LuTrash2 className="size-4" aria-hidden />
        </Button>
      );
    }
    return null;
  };

  return (
    <>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* Phone */}
      <ul className="divide-y divide-border/70 md:hidden">
        {rows.map((e) => (
          <li key={e.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{e.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {e.category} · {bucketLabel(e.bucketSource)} · {formatDate(e.date)}
                  {e.loggedByName ? ` · ${e.loggedByName}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">{formatNaira(e.amount, { decimals: !Number.isInteger(e.amount) })}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <StatusPill status={e.approvalStatus} />
                {e.recurring ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <LuRepeat className="size-3" aria-hidden />
                    {e.frequency}
                  </span>
                ) : null}
              </span>
              {actions(e)}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">Date</th>
              <th scope="col" className="py-2 pr-3 font-medium">Category</th>
              <th scope="col" className="py-2 pr-3 font-medium">Description</th>
              <th scope="col" className="py-2 pr-3 font-medium">Paid from</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th>
              <th scope="col" className="py-2 pr-3 font-medium">Status</th>
              <th scope="col" className="py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap py-3 pr-3 font-mono text-xs tabular-nums text-muted-foreground">{formatDate(e.date)}</td>
                <td className="py-3 pr-3 text-muted-foreground">
                  {e.category}
                  {e.recurring ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px]">
                      <LuRepeat className="size-3" aria-hidden />
                      {e.frequency}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-3 text-foreground">
                  {e.description}
                  {e.loggedByName ? <span className="mt-0.5 block text-[11px] text-muted-foreground">by {e.loggedByName}</span> : null}
                </td>
                <td className="py-3 pr-3 text-muted-foreground">{bucketLabel(e.bucketSource)}</td>
                <td className="whitespace-nowrap py-3 pr-3 text-right font-mono tabular-nums text-foreground">{formatNaira(e.amount, { decimals: !Number.isInteger(e.amount) })}</td>
                <td className="py-3 pr-3">
                  <StatusPill status={e.approvalStatus} />
                </td>
                <td className="py-3 text-right">{actions(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this expense?</DialogTitle>
            <DialogDescription>
              {pending ? `${pending.description} — ${formatNaira(pending.amount)}. ` : ""}The bucket gets the money back. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy === "delete"} onClick={confirmDelete}>
              {busy === "delete" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
