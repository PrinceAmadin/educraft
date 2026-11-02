"use client";

import * as React from "react";
import { LuCircleAlert, LuPlay } from "react-icons/lu";
import { TOUR_TEXT, formatTimestamp, roughLength, type TourChapter } from "@/lib/ambassador-tour";
import { TourPlayer } from "@/components/ambassador/tour/TourPlayer";

/**
 * "How the ambassador platform works" — where the tour lives after the first
 * watch, on the dashboard home.
 *
 * It is a section of the page rather than a tab of its own: the phone bottom
 * bar is full at five slots, and this is something an ambassador comes back to
 * occasionally, not somewhere they navigate.
 *
 * The poster stands in for the video until it is asked for, so opening the
 * dashboard never costs anyone a video download on mobile data.
 */
export function TourSection({
  videoUrl,
  posterUrl,
  chapters,
  watchedAt,
  durationSeconds,
}: {
  videoUrl: string;
  posterUrl: string;
  chapters: readonly TourChapter[];
  /** ISO date, or null if they have somehow not watched it. */
  watchedAt: string | null;
  durationSeconds: number | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const seek = React.useRef<((seconds: number) => void) | null>(null);

  const length = roughLength(durationSeconds);
  const watched = watchedAt
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(
        new Date(watchedAt)
      )
    : null;

  return (
    <section id="how-it-works" className="surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{TOUR_TEXT.sectionTitle}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{TOUR_TEXT.sectionBody}</p>

      <p className="mt-1 text-xs text-muted-foreground">
        {[length, watched ? `Watched ${watched}` : TOUR_TEXT.neverWatched].filter(Boolean).join(" · ")}
      </p>

      <div className="mt-3">
        {open ? (
          <TourPlayer
            src={videoUrl}
            poster={posterUrl}
            mode="library"
            seekRef={seek}
            onError={() => setProblem(TOUR_TEXT.loadError)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {posterUrl ? (
              // A plain img: the poster is on the Blob CDN, not in /public, so
              // next/image would proxy it through a function for nothing.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={posterUrl} alt="" className="size-full object-cover" />
            ) : null}
            <span className="absolute inset-0 grid place-items-center bg-slate-950/40 transition-colors group-hover:bg-slate-950/30">
              <span className="grid size-16 place-items-center rounded-full bg-white/95 text-slate-900 shadow-lift">
                <LuPlay className="size-7 translate-x-0.5" aria-hidden />
              </span>
            </span>
            <span className="sr-only">{TOUR_TEXT.watchLabel}</span>
          </button>
        )}
      </div>

      {problem ? (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-danger">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}

      {chapters.length > 0 ? (
        <>
          <h3 className="mt-4 meta-label">{TOUR_TEXT.sectionChapters}</h3>
          <ul className="mt-2 space-y-0.5">
            {chapters.map((chapter, i) => (
              <li key={chapter.startSeconds}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(true);
                    // The element mounts this tick; seek once it exists.
                    window.setTimeout(() => seek.current?.(chapter.startSeconds), 0);
                  }}
                  className="flex min-h-[44px] w-full items-baseline gap-3 rounded-lg px-1 text-left text-sm transition-colors hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="min-w-0 flex-1 text-foreground">{chapter.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatTimestamp(chapter.startSeconds)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
