"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle, LuRotateCcw } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Admin: archive the ambassador's current clicks into History and start a
 * fresh count. Nothing is deleted. Because it also restarts their leaderboard
 * count, it asks for confirmation and spells out what will change.
 */
export function ResetClicksButton({
  ambassadorId,
  ambassadorName,
  currentClicks,
}: {
  ambassadorId: string;
  ambassadorName: string;
  /** Clicks that will be archived, for the confirmation text. */
  currentClicks: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<number | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}/analytics/reset`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { archived?: number; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not reset.");
      setDone(body?.archived ?? 0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset.");
    } finally {
      setBusy(false);
    }
  }

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setDone(null);
      setError(null);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LuRotateCcw className="size-4" aria-hidden />
        Reset click count
      </Button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset click count for {ambassadorName}?</DialogTitle>
            <DialogDescription>
              {done === null
                ? "This closes the current counting period."
                : `Done. ${done.toLocaleString("en-NG")} click${done === 1 ? "" : "s"} moved to History.`}
            </DialogDescription>
          </DialogHeader>

          {done === null ? (
            <div className="space-y-4">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                <li>
                  {currentClicks.toLocaleString("en-NG")} click{currentClicks === 1 ? "" : "s"} will move to History as one closed period.
                </li>
                <li>Their totals, charts and leaderboard count start again from zero.</li>
                <li>Nothing is deleted, and it cannot be undone from this screen.</li>
              </ul>
              {error ? (
                <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                  <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy || currentClicks === 0} onClick={reset}>
                  {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                  Reset count
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button type="button" onClick={() => close(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
