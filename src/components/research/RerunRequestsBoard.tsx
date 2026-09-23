"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuBookCheck, LuCheck, LuCircleAlert, LuLoaderCircle, LuX } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime } from "@/lib/utils";

export interface RerunRequestItem {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "USED" | "EXPIRED";
  reason: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  approvedUntil: string | null;
  projectCode: string;
  projectTitle: string | null;
  workerName: string;
  reviewerName: string | null;
  rerunsUsed: number;
  sharedWithClient: boolean;
}

const STATUS_BADGE: Record<RerunRequestItem["status"], { label: string; variant: "warning" | "success" | "danger" | "neutral" }> = {
  PENDING: { label: "Waiting", variant: "warning" },
  APPROVED: { label: "Approved, not used yet", variant: "success" },
  USED: { label: "Approved and used", variant: "neutral" },
  EXPIRED: { label: "Approved, expired unused", variant: "neutral" },
  REJECTED: { label: "Declined", variant: "danger" },
};

async function review(id: string, decision: "approve" | "reject", note?: string) {
  const res = await fetch(`/api/admin/research-rerun-requests/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, note }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not save your decision.");
  }
}

function PendingCard({ item }: { item: RerunRequestItem }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState(false);
  const [note, setNote] = React.useState("");

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    setError(null);
    try {
      await review(item.id, decision, decision === "reject" ? note : undefined);
      setDeclining(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="surface min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <Link
            href={`/admin/projects/${item.projectCode}`}
            className="font-mono text-sm font-medium text-foreground hover:text-primary"
          >
            {item.projectCode}
          </Link>
          {item.projectTitle ? (
            <p className="mt-0.5 break-words text-sm text-muted-foreground">{item.projectTitle}</p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{item.workerName}</span> · {item.rerunsUsed} re-run
        {item.rerunsUsed === 1 ? "" : "s"} already used on this project
      </p>

      <blockquote className="whitespace-pre-wrap break-words rounded-xl bg-zone p-3 text-sm text-foreground">
        {item.reason}
      </blockquote>

      {item.sharedWithClient ? (
        <p className="rounded-xl bg-gold/10 p-3 text-xs text-foreground">
          The client already has this research list in their dashboard. A re-run replaces it, and the new list shows
          only after you share it again.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy !== null} onClick={() => decide("approve")}>
          {busy === "approve" ? (
            <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <LuCheck className="size-4" aria-hidden />
          )}
          Approve (24 hours to use it)
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setDeclining(true)}>
          <LuX className="size-4" aria-hidden />
          Decline
        </Button>
      </div>

      <Dialog open={declining} onOpenChange={(v) => busy === null && setDeclining(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this re-run?</DialogTitle>
            <DialogDescription>
              {item.workerName} sees your note, so tell them what to try instead.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. The results are fine, the topic just needs a broader phrase."
            aria-label="Reason for declining"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy !== null || note.trim().length === 0} onClick={() => decide("reject")}>
              {busy === "reject" ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Decline
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function RerunRequestsBoard({ pending, recent }: { pending: RerunRequestItem[]; recent: RerunRequestItem[] }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Waiting for you ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState icon={LuBookCheck} title="Nothing waiting" description="Requests appear here when a worker needs a re-run beyond the free one." />
        ) : (
          <ul className="space-y-3">
            {pending.map((item) => (
              <PendingCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Recent decisions</h2>
          <ul className="divide-y divide-border/70">
            {recent.map((item) => (
              <li key={item.id} className="min-w-0 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <Link
                      href={`/admin/projects/${item.projectCode}`}
                      className="font-mono font-medium text-foreground hover:text-primary"
                    >
                      {item.projectCode}
                    </Link>{" "}
                    <span className="text-muted-foreground">· {item.workerName}</span>
                  </span>
                  <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                </div>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  &ldquo;{item.reason}&rdquo;
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.reviewerName ? `${item.reviewerName}` : "—"}
                  {item.reviewedAt ? ` · ${formatDateTime(item.reviewedAt)}` : ""}
                  {item.reviewNote ? ` · ${item.reviewNote}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
