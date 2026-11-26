"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { LuPlay, LuVolume2, LuVolumeX } from "react-icons/lu";
import { cn } from "@/lib/utils";

/**
 * The short vertical clip on the join page.
 *
 * Its own player rather than the tutorial's: that one bakes a 16:9 frame in,
 * so a phone-shaped film would sit letterboxed with bars taking most of the
 * frame, and it carries the tutorial's watch-tracking, which has no business
 * on a public page. For a thirty-second vertical hook the interaction model is
 * three things the tutorial player does not do — start muted on its own, loop,
 * and unmute on a tap — so they are what this is.
 *
 * Sized small on purpose. A phone-shot film is a few hundred pixels wide, and
 * blown up it looks like what it is; held to its own size it reads as
 * composition. On a phone that is the full column, on a desktop it sits beside
 * the copy.
 *
 * Under `prefers-reduced-motion` nothing moves until asked: the poster and a
 * play button. That also spares a metered Nigerian connection a film nobody
 * asked for.
 */
export function HookVideo({
  src,
  poster,
  label,
  tapForSound,
}: {
  src: string;
  poster?: string;
  label: string;
  tapForSound: string;
}) {
  const video = React.useRef<HTMLVideoElement>(null);
  const frame = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const [muted, setMuted] = React.useState(true);
  const [started, setStarted] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [hintGone, setHintGone] = React.useState(false);
  const [broken, setBroken] = React.useState(false);

  // Start only once it is actually on screen, and only if the visitor has not
  // asked for less motion. An IntersectionObserver rather than a scroll
  // handler: no work on frames where nothing crossed the threshold.
  React.useEffect(() => {
    const node = frame.current;
    const el = video.current;
    if (!node || !el || reduced) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void el.play().then(() => setStarted(true)).catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);

  // The hint has one job and then goes. Timed from the moment it starts
  // playing, not from mount, or it would expire before anyone saw the frame.
  React.useEffect(() => {
    if (!started || hintGone) return;
    const timer = window.setTimeout(() => setHintGone(true), 3200);
    return () => window.clearTimeout(timer);
  }, [started, hintGone]);

  // A broken video must not leave a tall dark rectangle under the page's main
  // button. If it cannot play, the section is simply not there.
  if (broken) return null;

  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    setHintGone(true);
    const next = !el.muted;
    el.muted = next;
    setMuted(next);
    if (!next) void el.play().then(() => setStarted(true)).catch(() => {});
  };

  const play = () => {
    const el = video.current;
    if (!el) return;
    void el.play().then(() => setStarted(true)).catch(() => {});
  };

  return (
    <div
      ref={frame}
      className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-zone shadow-soft"
      style={{ aspectRatio: "478 / 850", maxHeight: "min(60svh, 34rem)" }}
    >
      <video
        ref={video}
        src={src}
        poster={poster || undefined}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        className="size-full object-cover"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) setProgress((el.currentTime / el.duration) * 100);
        }}
        onError={() => setBroken(true)}
      />

      {/* One tap target over the whole frame. A muted loop whose sound cannot
          obviously be turned on is the commonest way a hook video fails. */}
      <button
        type="button"
        onClick={started ? toggleSound : play}
        className="absolute inset-0 flex cursor-pointer items-end justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary"
        aria-label={started ? (muted ? "Turn the sound on" : "Turn the sound off") : "Play the video"}
      >
        {!started ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              <LuPlay className="size-7 translate-x-[2px]" aria-hidden />
            </span>
          </span>
        ) : null}

        {started && !hintGone ? (
          <span className="mb-10 rounded-full bg-black/60 px-3.5 py-1.5 text-[0.8125rem] font-medium text-white backdrop-blur-sm">
            {tapForSound}
          </span>
        ) : null}
      </button>

      {/* Sound state, always visible once it is running. */}
      {started ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          {muted ? <LuVolumeX className="size-4" /> : <LuVolume2 className="size-4" />}
        </span>
      ) : null}

      {/* How much is left, so the commitment is visible. Not draggable: there
          is nothing to seek to in half a minute. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
        <span
          className={cn("block h-full bg-white/85", progress > 0 && "transition-[width] duration-200 ease-linear")}
          style={{ width: `${progress}%` }}
        />
      </span>
    </div>
  );
}
