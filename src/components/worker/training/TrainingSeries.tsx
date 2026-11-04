"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuListChecks, LuLock, LuPlay } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { TrainingPlayer } from "@/components/training/TrainingPlayer";
import { QuizPanel } from "@/components/training/QuizPanel";
import type { EpisodeProps } from "@/components/training/types";
import { completeLine, episodeLabel, TRAINING_TEXT } from "@/lib/training/rules";
import { formatTimestamp, watchComplete } from "@/lib/training/video-rules";
import { cn } from "@/lib/utils";

/**
 * The Training tab: the learning-platform layout — the player as the dominant
 * element, a curriculum rail beside it on desktop and below it on phones.
 * Episode rows carry a state icon (done / quiz to pass / up next / locked), the
 * title and the length; the current row is highlighted.
 *
 * A watched episode replays freely (library mode, nothing recorded). An
 * unwatched one plays in gate mode. An episode with a quiz is not done until the
 * quiz is passed, so the quiz shows under the player and holds the next episode.
 */
export function TrainingSeries({
  episodes,
  completed,
  total,
  nextRequiredId,
}: {
  episodes: EpisodeProps[];
  completed: number;
  total: number;
  nextRequiredId: string | null;
}) {
  const router = useRouter();
  const fallback = nextRequiredId ?? episodes[0]?.id ?? null;
  const [selectedId, setSelectedId] = React.useState<string | null>(fallback);
  // No-quiz episodes finished in this sitting (a quiz episode completes only on
  // a pass, which refreshes the page).
  const [justDone, setJustDone] = React.useState<Record<string, boolean>>({});
  const [problem, setProblem] = React.useState<string | null>(null);

  const selected = episodes.find((e) => e.id === selectedId) ?? episodes.find((e) => e.id === fallback) ?? null;
  if (!selected) return null;

  const isComplete = (e: EpisodeProps) => e.complete || Boolean(justDone[e.id]);
  const isWatched = (e: EpisodeProps) => e.watchedAt != null || Boolean(justDone[e.id]);
  const selectedQuiz = selected.hasQuiz && selected.quizPassedAt == null && isWatched(selected) && !isComplete(selected);
  const completedNow = completed + episodes.filter((e) => !e.complete && justDone[e.id]).length;

  return (
    <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <TrainingPlayer
          key={selected.id}
          src={selected.videoUrl}
          poster={selected.posterUrl}
          mode={selected.watchedAt != null ? "library" : "gate"}
          progressUrl={`/api/worker/training/${selected.id}/progress`}
          startAt={selected.watchedAt != null ? 0 : selected.startAt}
          initialSecondsWatched={selected.secondsWatched}
          onProgress={(seconds, duration) => {
            // A no-quiz episode is done the moment it is watched; an episode
            // with a quiz is only watched here, and the quiz completes it.
            if (!isWatched(selected) && watchComplete(seconds, duration) && !selected.hasQuiz) {
              setJustDone((f) => ({ ...f, [selected.id]: true }));
            }
          }}
          onError={() => setProblem(TRAINING_TEXT.loadError)}
        />

        {problem ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        ) : null}

        {justDone[selected.id] && !selected.complete ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zone p-3">
            <p className="text-sm text-foreground">{TRAINING_TEXT.episodeDone}</p>
            <Button type="button" size="sm" onClick={() => router.refresh()}>
              {TRAINING_TEXT.nextLabel}
            </Button>
          </div>
        ) : null}

        <div>
          <p className="eyebrow">{episodeLabel(selected.episodeNo)}</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">{selected.title}</h2>
          {selected.description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{selected.description}</p>
          ) : null}
        </div>

        {selectedQuiz ? <QuizPanel videoId={selected.id} onPassed={() => router.refresh()} /> : null}
      </div>

      <aside className="mt-6 lg:mt-0">
        <div className="rounded-xl bg-zone p-3">
          <p className="text-sm font-medium text-foreground">{completeLine(completedNow, total)}</p>
          <div
            role="progressbar"
            aria-label={completeLine(completedNow, total)}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completedNow}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: total > 0 ? `${(completedNow / total) * 100}%` : 0 }}
            />
          </div>

          <ul className="mt-3 space-y-0.5">
            {episodes.map((e) => {
              const done = isComplete(e);
              const quizPending = e.hasQuiz && e.quizPassedAt == null && isWatched(e) && !done;
              const isCurrent = e.id === selected.id;
              const playable = e.unlocked || isWatched(e);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={!playable}
                    onClick={() => {
                      setProblem(null);
                      setSelectedId(e.id);
                    }}
                    aria-current={isCurrent ? "true" : undefined}
                    title={!playable ? TRAINING_TEXT.lockedEpisode : undefined}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isCurrent ? "bg-card font-medium text-foreground shadow-soft" : "text-muted-foreground",
                      playable && !isCurrent ? "hover:bg-card/70 hover:text-foreground" : null,
                      !playable ? "cursor-not-allowed opacity-70" : null
                    )}
                  >
                    {done ? (
                      <LuCircleCheck className="size-4 shrink-0 text-primary" aria-label="Done" />
                    ) : quizPending ? (
                      <LuListChecks className="size-4 shrink-0 text-gold" aria-label={TRAINING_TEXT.quizPending} />
                    ) : playable ? (
                      <LuPlay className="size-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <LuLock className="size-4 shrink-0" aria-label={TRAINING_TEXT.lockedEpisode} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {episodeLabel(e.episodeNo)} — {e.title}
                      </span>
                      {!e.requiredForGate ? (
                        <span className="block text-xs text-muted-foreground">{TRAINING_TEXT.optionalTag}</span>
                      ) : null}
                    </span>
                    {e.durationSeconds ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatTimestamp(e.durationSeconds)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
