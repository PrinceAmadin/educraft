"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuListChecks, LuLoaderCircle, LuLock, LuPlay } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrainingPlayer } from "@/components/training/TrainingPlayer";
import { QuizPanel } from "@/components/training/QuizPanel";
import type { EpisodeProps } from "@/components/training/types";
import { completeLine, episodeLabel, TRAINING_TEXT } from "@/lib/training/rules";
import { watchComplete, watchedPercent } from "@/lib/training/video-rules";
import { signOutAndClear } from "@/lib/pwa/sign-out";
import { cn } from "@/lib/utils";

type RailEpisode = Pick<EpisodeProps, "id" | "episodeNo" | "title" | "complete" | "hasQuiz" | "quizPassedAt">;

/**
 * The worker training gate. A worker — new or current, the founder's call —
 * cannot use the portal until every required episode is complete, so this
 * dialog has no close X, ignores Escape and ignores a click outside; the only
 * ways out are finishing the series or signing out.
 *
 * One episode shows at a time (the first required one not yet complete): the
 * video, then, if the episode has a quiz, the quiz. The next episode opens only
 * once the server agrees the current one is watched and its quiz passed.
 */
export function WorkerTrainingGate({
  episode,
  episodes,
  completed,
  total,
  isLast,
}: {
  /** The episode to work through now — the first required one not yet complete. */
  episode: EpisodeProps;
  /** The whole playable series, for the progress list. */
  episodes: RailEpisode[];
  completed: number;
  total: number;
  /** No other required episode is left: the button reads Continue, not Next. */
  isLast: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = React.useState(episode.secondsWatched);
  const [duration, setDuration] = React.useState(0);
  const [watchedNow, setWatchedNow] = React.useState(episode.watchedAt != null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const needsQuiz = episode.hasQuiz && episode.quizPassedAt == null;
  const done = watchComplete(progress, duration) || watchedNow;
  const percent = watchedPercent(progress, duration);

  const postProgress = React.useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/worker/training/${episode.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondsWatched: Math.round(progress), durationSeconds: Math.round(duration) }),
    });
    const body = (await res.json().catch(() => null)) as { watched?: boolean } | null;
    return res.ok && Boolean(body?.watched);
  }, [episode.id, progress, duration]);

  // The moment the video is watched, make sure the server has it (so the quiz
  // GET succeeds) and reveal the quiz, or advance when there is none.
  const onWatched = React.useCallback(async () => {
    if (watchedNow) return;
    setWatchedNow(true);
    try {
      await postProgress();
    } catch {
      /* the player's own 10 s save will catch up */
    }
  }, [watchedNow, postProgress]);

  // No quiz: the Next button posts the final position and moves on.
  const onAdvance = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (!(await postProgress())) {
        setProblem(TRAINING_TEXT.lockedHint);
        return;
      }
      router.refresh();
    } catch {
      setProblem("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const showQuiz = needsQuiz && done;

  return (
    <Dialog open>
      <DialogContent
        hideClose
        className="max-h-[92dvh] max-w-4xl overflow-y-auto"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{TRAINING_TEXT.gateTitle}</DialogTitle>
          <DialogDescription>{TRAINING_TEXT.gateBody}</DialogDescription>
        </DialogHeader>

        <p className="text-sm font-medium text-foreground">
          {episodeLabel(episode.episodeNo)} — {episode.title}
          <span className="ml-2 font-normal text-muted-foreground">{completeLine(completed, total)}</span>
        </p>

        <TrainingPlayer
          key={episode.id}
          src={episode.videoUrl}
          poster={episode.posterUrl}
          mode="gate"
          progressUrl={`/api/worker/training/${episode.id}/progress`}
          startAt={episode.startAt}
          initialSecondsWatched={episode.secondsWatched}
          onProgress={(seconds, length) => {
            setProgress(seconds);
            if (watchComplete(seconds, length)) void onWatched();
          }}
          onDuration={setDuration}
          onEnded={() => void onWatched()}
          onError={() => setProblem(TRAINING_TEXT.loadError)}
        />

        {episode.secondsWatched > 0 && progress <= episode.secondsWatched ? (
          <p className="text-xs text-muted-foreground">{TRAINING_TEXT.resumedNote}</p>
        ) : null}

        {problem ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        ) : null}

        {showQuiz ? (
          <QuizPanel videoId={episode.id} onPassed={() => router.refresh()} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {done
                ? isLast
                  ? TRAINING_TEXT.readyLine
                  : TRAINING_TEXT.episodeDone
                : percent >= 75
                  ? TRAINING_TEXT.nearlyThere
                  : TRAINING_TEXT.lockedHint}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void signOutAndClear()}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                {TRAINING_TEXT.signOutLabel}
              </button>
              <Button type="button" onClick={onAdvance} disabled={!done || busy}>
                {busy ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {isLast ? TRAINING_TEXT.continueLabel : TRAINING_TEXT.nextLabel}
              </Button>
            </div>
          </div>
        )}

        {episodes.length > 1 ? (
          <ul className="space-y-0.5 border-t border-border/70 pt-3">
            {episodes.map((e) => {
              const isCurrent = e.id === episode.id;
              return (
                <li
                  key={e.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm",
                    isCurrent ? "bg-zone font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {e.complete ? (
                    <LuCircleCheck className="size-4 shrink-0 text-primary" aria-label="Done" />
                  ) : isCurrent ? (
                    e.hasQuiz && e.quizPassedAt == null && watchedNow ? (
                      <LuListChecks className="size-4 shrink-0 text-gold" aria-label={TRAINING_TEXT.quizPending} />
                    ) : (
                      <LuPlay className="size-4 shrink-0 text-primary" aria-hidden />
                    )
                  ) : (
                    <LuLock className="size-4 shrink-0" aria-label={TRAINING_TEXT.lockedEpisode} />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {episodeLabel(e.episodeNo)} — {e.title}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
