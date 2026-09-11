"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Repeat, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ExpenseRow } from "@/lib/services/expenses";
import { formatDate, formatNaira } from "@/lib/utils";

export function ExpensesTable({ rows, canDelete }: { rows: ExpenseRow[]; canDelete: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<ExpenseRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((e) => (
          <div key={e.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{e.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {e.category} · {formatDate(e.date)}
                </p>
              </div>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {formatNaira(e.amount)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              {e.recurring ? (
                <Badge variant="neutral">
                  <Repeat className="size-3" aria-hidden />
                  {e.frequency}
                </Badge>
              ) : (
                <span />
              )}
              {canDelete ? (
                <Button size="icon-sm" variant="ghost" className="text-danger" onClick={() => setPending(e)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium">Recurring</th>
              {canDelete ? <th className="px-4 py-2.5 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDate(e.date)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.category}</td>
                <td className="px-4 py-3 text-foreground">{e.description}</td>
                <td className="px-4 py-3 font-mono tabular-nums text-foreground">{formatNaira(e.amount)}</td>
                <td className="px-4 py-3">
                  {e.recurring ? (
                    <Badge variant="neutral">
                      <Repeat className="size-3" aria-hidden />
                      {e.frequency}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                {canDelete ? (
                  <td className="px-4 py-3 text-right">
                    <Button size="icon-sm" variant="ghost" className="text-danger" onClick={() => setPending(e)}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </td>
                ) : null}
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
              {pending ? `${pending.description} — ${formatNaira(pending.amount)}` : ""} This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="flex items-start gap-2 text-sm text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={confirmDelete}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
