"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuBan, LuCircleAlert, LuLoaderCircle, LuPlay } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Suspend (with an optional reason) or reactivate one ambassador. Used on
 * the detail page header and in the directory's Actions column.
 */
export function SuspendControl({ ambassadorId, fullName, status, size = "sm" }: { ambassadorId: string; fullName: string; status: string; size?: "sm" | "default" }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const suspended = status === "Suspended" || status === "Paused" || status === "Lapsed";
  if (status === "Terminated") return null;

  async function call(path: "suspend" | "activate") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: path === "suspend" ? JSON.stringify({ reason }) : "{}",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not update.");
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  if (suspended) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Button type="button" size={size} variant="outline" disabled={busy} onClick={() => call("activate")}>
          {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuPlay className="size-4" aria-hidden />}
          Activate
        </Button>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </span>
    );
  }

  return (
    <>
      <Button type="button" size={size} variant="outline" onClick={() => setOpen(true)}>
        <LuBan className="size-4" aria-hidden />
        Suspend
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend {fullName}?</DialogTitle>
            <DialogDescription>
              Their referral link keeps working, but no new referral counts for them and their portal sign-in is switched off until they are reactivated.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Reason (optional, kept in their notes)</span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Sharing the link in unrelated groups" />
          </label>
          {error ? (
            <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
              <LuCircleAlert className="size-4" aria-hidden />
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => call("suspend")} disabled={busy}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuBan className="size-4" aria-hidden />}
              Suspend
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
