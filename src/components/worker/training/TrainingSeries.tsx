"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LuCircleAlert, LuCircleCheck, LuLock, LuPlay } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { TrainingPlayer } from "@/components/training/TrainingPlayer";
import type { EpisodeProps } from "@/components/training/types";
import { completeLine, episodeLabel, TRAINING_TEXT } from "@/lib/training/rules";
import { formatTimestamp, watchComplete } from "@/lib/training/video-rules";
import { cn } from "@/lib/utils";

/**
 * The Training tab: the learning-platform layout — the player as the dominant
 * element, a curriculum rail beside it on desktop and below it on phones.
 * Episode rows carry a state icon (watched / up next / locked), the title and
 * the length; the current row is highlighted.
 *
 * A watched episode replays freely (library mode, nothing recorded). An
 * unwatched one plays in gate mode — the tick is earned by real watching, the
 * same rule as the portal gate — and a locked one cannot be opened until the
 * required episodes before it are done.
 */
export function TrainingSeries({
  episodes,
  watched,
  total,
  nextRequiredId,
}: {
  episodes: EpisodeProps[];
  watched: number;
  total: number;
  nextRequiredId: string | null;
}) {
  const router = useRouter();
  const fallback = nextRequiredId ?? episodes[0]?.id ?? null;
  const [selectedId, setSelectedId] = React.useState<string | null>(fallback);
  const [justFinished, setJustFinished] = React.useState<Record<string, boolean>>({});
  const [problem, setProblem] = React.useState<string | null>(null);

  const selected = episodes.find((e) => e.id === selectedId) ?? episodes.find((e) => e.id === fallback) ?? null;
  if (!selected) return null;

  const selectedWatched = selected.watchedAt != null || Boolean(justFinished[selected.id]);
  const watchedNow = watched + episodes.filter((e) => !e.watchedAt && justFinished[e.id]).length;

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
            if (!selectedWatched && watchComplete(seconds, duration)) {
              setJustFinished((f) => ({ ...f, [selected.id]: true }));
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

        {justFinished[selected.id] && selected.watchedAt == null ? (
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
      </div>

      <aside className="mt-6 lg:mt-0">
        <div className="rounded-xl bg-zone p-3">
          <p className="text-sm font-medium text-foreground">{completeLine(watchedNow, total)}</p>
          <div
            role="progressbar"
            aria-label={completeLine(watchedNow, total)}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={watchedNow}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: total > 0 ? `${(watchedNow / total) * 100}%` : 0 }}
            />
          </div>

          <ul className="mt-3 space-y-0.5">
            {episodes.map((e) => {
              const isDone = e.watchedAt != null || Boolean(justFinished[e.id]);
              const isCurrent = e.id === selected.id;
              const playable = e.unlocked || isDone;
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
                    {isDone ? (
                      <LuCircleCheck className="size-4 shrink-0 text-primary" aria-label={TRAINING_TEXT.watchedPrefix} />
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
