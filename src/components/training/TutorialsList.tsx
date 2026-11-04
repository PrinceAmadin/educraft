"use client";

import * as React from "react";
import { LuCircleAlert, LuCircleCheck, LuPlay } from "react-icons/lu";
import { TrainingPlayer } from "@/components/training/TrainingPlayer";
import type { EpisodeProps } from "@/components/training/types";
import { completeLine, episodeLabel, TUTORIALS_TEXT } from "@/lib/training/rules";
import { roughLength, watchComplete } from "@/lib/training/video-rules";

/**
 * The COO's tutorial library: every published episode as a poster card that
 * becomes a player when asked for (loading the page downloads no video), with
 * a watched tick and an "x of N watched" line. Seeking is free — nothing here
 * gates anyone — but the tick is earned by real playback only (the player's
 * tracked mode), so "Watched" means watched.
 */
export function TutorialsList({
  episodes,
  watched,
  total,
}: {
  episodes: EpisodeProps[];
  watched: number;
  total: number;
}) {
  // Episodes finished in this sitting, so the tick appears without a reload.
  const [finished, setFinished] = React.useState<Record<string, boolean>>({});
  const watchedNow = watched + episodes.filter((e) => !e.watchedAt && finished[e.id]).length;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">{completeLine(watchedNow, total)}</p>
        <div
          role="progressbar"
          aria-label={completeLine(watchedNow, total)}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={watchedNow}
          className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
            style={{ width: total > 0 ? `${(watchedNow / total) * 100}%` : 0 }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {episodes.map((episode) => (
          <TutorialCard
            key={episode.id}
            episode={episode}
            justFinished={Boolean(finished[episode.id])}
            onFinished={() => setFinished((f) => ({ ...f, [episode.id]: true }))}
          />
        ))}
      </div>
    </div>
  );
}

function TutorialCard({
  episode,
  justFinished,
  onFinished,
}: {
  episode: EpisodeProps;
  justFinished: boolean;
  onFinished: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const length = roughLength(episode.durationSeconds);
  const isWatched = episode.watchedAt != null || justFinished;
  const watchedOn = episode.watchedAt
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(
        new Date(episode.watchedAt)
      )
    : null;
  const stateLine = isWatched
    ? `${TUTORIALS_TEXT.watchedPrefix}${watchedOn ? ` ${watchedOn}` : ""}`
    : episode.startedAt
      ? TUTORIALS_TEXT.startedNotFinished
      : TUTORIALS_TEXT.neverWatched;

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{episodeLabel(episode.episodeNo)}</p>
          <h2 className="mt-0.5 text-sm font-semibold text-foreground">{episode.title}</h2>
          {episode.description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{episode.description}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">{[length, stateLine].filter(Boolean).join(" · ")}</p>
        </div>
        {isWatched ? (
          <LuCircleCheck className="mt-1 size-5 shrink-0 text-primary" aria-label={TUTORIALS_TEXT.watchedPrefix} />
        ) : null}
      </div>

      <div className="mt-3">
        {open ? (
          <TrainingPlayer
            src={episode.videoUrl}
            poster={episode.posterUrl}
            mode="tracked"
            progressUrl={`/api/admin/tutorials/${episode.id}/progress`}
            startAt={isWatched ? 0 : episode.startAt}
            initialSecondsWatched={episode.secondsWatched}
            onProgress={(seconds, duration) => {
              if (!isWatched && watchComplete(seconds, duration)) onFinished();
            }}
            onEnded={() => {
              if (!isWatched) onFinished();
            }}
            onError={() => setProblem(TUTORIALS_TEXT.loadError)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {episode.posterUrl ? (
              // A plain img: the poster is on the Blob CDN, not in /public, so
              // next/image would proxy it through a function for nothing.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={episode.posterUrl} alt="" className="size-full object-cover" />
            ) : null}
            <span className="absolute inset-0 grid place-items-center bg-slate-950/40 transition-colors group-hover:bg-slate-950/30">
              <span className="grid size-16 place-items-center rounded-full bg-white/95 text-slate-900 shadow-lift">
                <LuPlay className="size-7 translate-x-0.5" aria-hidden />
              </span>
            </span>
            <span className="sr-only">{TUTORIALS_TEXT.watchLabel}</span>
          </button>
        )}
      </div>

      {!isWatched && episode.secondsWatched > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{TUTORIALS_TEXT.resumedNote}</p>
      ) : null}

      {problem ? (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
    </section>
  );
}
