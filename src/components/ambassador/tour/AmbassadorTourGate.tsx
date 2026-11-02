"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuLoaderCircle } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TOUR_TEXT, tourComplete, watchedPercent } from "@/lib/ambassador-tour";
import { signOutAndClear } from "@/lib/pwa/sign-out";
import { TourPlayer } from "@/components/ambassador/tour/TourPlayer";

/**
 * The first watch. A new ambassador cannot use the portal until the tour is
 * done, so this dialog has no close X, ignores Escape and ignores a click
 * outside — the only ways out are finishing it or signing out.
 *
 * It is mounted by the ambassador layout, so it covers every page of the
 * portal, not just the dashboard: opening /ambassador/commissions directly
 * meets the same gate. Radix portals it to the body, and `z-modal` is above the
 * sidebar and topbar, so there is nothing behind it to click.
 *
 * The server decides whether it has really been watched. Continue sends the
 * final position and only moves on if the answer agrees, so a client that
 * reports nonsense stays here.
 */
export function AmbassadorTourGate({
  videoUrl,
  posterUrl,
  startAt,
  secondsWatched,
}: {
  videoUrl: string;
  posterUrl: string;
  startAt: number;
  secondsWatched: number;
}) {
  const router = useRouter();
  const [progress, setProgress] = React.useState(secondsWatched);
  const [duration, setDuration] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const done = tourComplete(progress, duration);
  const percent = watchedPercent(progress, duration);

  const onContinue = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/ambassador/tour/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secondsWatched: Math.round(progress),
          durationSeconds: Math.round(duration),
        }),
      });
      const body = (await res.json().catch(() => null)) as { watched?: boolean } | null;
      if (!res.ok || !body?.watched) {
        setProblem(TOUR_TEXT.lockedHint);
        return;
      }
      router.refresh();
    } catch {
      setProblem("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        hideClose
        className="max-w-4xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{TOUR_TEXT.gateTitle}</DialogTitle>
          <DialogDescription>{TOUR_TEXT.gateBody}</DialogDescription>
        </DialogHeader>

        <TourPlayer
          src={videoUrl}
          poster={posterUrl}
          mode="gate"
          startAt={startAt}
          initialSecondsWatched={secondsWatched}
          onProgress={(seconds) => setProgress(seconds)}
          onDuration={setDuration}
          onError={() => setProblem(TOUR_TEXT.loadError)}
        />

        {secondsWatched > 0 && progress <= secondsWatched ? (
          <p className="text-xs text-muted-foreground">{TOUR_TEXT.resumedNote}</p>
        ) : null}

        {problem ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {done ? TOUR_TEXT.readyLine : percent >= 75 ? TOUR_TEXT.nearlyThere : TOUR_TEXT.lockedHint}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void signOutAndClear()}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {TOUR_TEXT.signOutLabel}
            </button>
            <Button type="button" onClick={onContinue} disabled={!done || busy}>
              {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {TOUR_TEXT.continueLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
