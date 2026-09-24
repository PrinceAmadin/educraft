"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LuChevronDown as ChevronDown,
  LuCircleAlert,
  LuLoaderCircle as Loader2,
} from "react-icons/lu";
import type { ProjectStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ADMIN_HOLDS, HOLD_LABELS, type AdminHold } from "@/lib/pipeline";

const CLOSED: ProjectStatus[] = ["COMPLETED", "CANCELLED", "REFUNDED"];

export function ProjectHoldControl({
  projectCode,
  status,
}: {
  projectCode: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const [pendingHold, setPendingHold] = React.useState<AdminHold | null>(null);
  const [note, setNote] = React.useState("");
  const [refundAmount, setRefundAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onHold = status === "ON_HOLD" || status === "DISPUTED";
  const closed = CLOSED.includes(status);

  async function call(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectCode}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "That action could not be completed.");
      }
      setPendingHold(null);
      setNote("");
      setRefundAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (closed) return null;

  return (
    <div className="flex items-center gap-2">
      {onHold ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => call({ resume: true })}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Resume project
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="text-muted-foreground">
            More
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {ADMIN_HOLDS.filter((h) => h !== status).map((h) => (
            <DropdownMenuItem
              key={h}
              onSelect={(e) => {
                e.preventDefault();
                setPendingHold(h);
                setError(null);
              }}
              className={h === "CANCELLED" || h === "REFUNDED" ? "text-danger focus:text-danger" : ""}
            >
              {HOLD_LABELS[h]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pendingHold !== null} onOpenChange={(o) => !o && setPendingHold(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingHold ? HOLD_LABELS[pendingHold] : ""}</DialogTitle>
            <DialogDescription>
              This is logged on the project timeline. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pendingHold && note.trim().length >= 3) {
                const amount = refundAmount.trim() === "" ? undefined : Number(refundAmount);
                call({ to: pendingHold, note: note.trim(), ...(pendingHold === "REFUNDED" && amount != null ? { refundAmount: amount } : {}) });
              }
            }}
          >
            <Textarea
              aria-label="Reason"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why?"
            />
            {pendingHold === "REFUNDED" ? (
              <div className="space-y-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label="Amount refunded (naira)"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Amount refunded — leave empty for everything the client paid"
                />
                <p className="text-xs text-muted-foreground">
                  Recorded as a refund in Finance; the buckets give the retained share of it back.
                </p>
              </div>
            ) : null}
            {error ? (
              <p className="flex items-start gap-2 text-sm text-danger">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPendingHold(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || note.trim().length < 3}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Confirm
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
