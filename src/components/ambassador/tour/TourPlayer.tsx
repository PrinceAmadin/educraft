"use client";

import * as React from "react";
import { LuMaximize, LuPause, LuPlay, LuRotateCw, LuSmartphone, LuVolume2, LuVolumeX } from "react-icons/lu";
import {
  MAX_CREDITED_JUMP_SECONDS,
  MAX_PLAYBACK_RATE,
  PROGRESS_SAVE_SECONDS,
  TOUR_CONTROLS,
  TOUR_TEXT,
  advanceProgress,
  formatTimestamp,
  rotateHintTimes,
  rotateHintVisible,
  watchedPercent,
} from "@/lib/ambassador-tour";
import { cn } from "@/lib/utils";

/**
 * The ambassador tour's 16:9 player.
 *
 * Two modes, one element:
 *
 *   gate    — the first watch. Play, pause, volume and full screen, and a
 *             progress line that cannot be dragged. Progress is the furthest
 *             point actually reached in playback, so neither dragging nor
 *             setting `currentTime` from the console earns any of it, and
 *             re-watching the opening minute over and over earns it only once.
 *             It is saved to the server as it goes, so a dropped connection
 *             resumes rather than restarting.
 *
 *   library — every watch after that, from the dashboard. Native controls,
 *             free seeking, chapter links. Nothing is recorded; it is already
 *             watched.
 */
export function TourPlayer({
  src,
  poster,
  mode,
  startAt = 0,
  initialSecondsWatched = 0,
  onProgress,
  onDuration,
  onError,
  seekRef,
}: {
  src: string;
  poster?: string;
  mode: "gate" | "library";
  /** Where to resume, in seconds. */
  startAt?: number;
  /** The furthest point already reached before this sitting. */
  initialSecondsWatched?: number;
  /** Told the furthest point reached and whether that is now enough. */
  onProgress?: (secondsWatched: number, durationSeconds: number) => void;
  onDuration?: (durationSeconds: number) => void;
  onError?: () => void;
  /** Lets a parent seek (the chapter list). Library mode only. */
  seekRef?: React.MutableRefObject<((seconds: number) => void) | null>;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);

  /** The furthest point legitimately reached. The measure of progress. */
  const progressRef = React.useRef(initialSecondsWatched);
  /** The previous `timeupdate` position, for the step size. */
  const lastTimeRef = React.useRef(startAt);
  /** Progress as it was last sent, so we only send on real movement. */
  const sentRef = React.useRef(initialSecondsWatched);

  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [duration, setDuration] = React.useState(0);
  const [progress, setProgress] = React.useState(initialSecondsWatched);
  const [position, setPosition] = React.useState(startAt);

  // 85% of ambassadors are on a phone, and a 16:9 video in an upright column is
  // small. They can turn the video instead of the phone (rotation lock, lying
  // in bed), and a hint says so a few times while it would help.
  const [rotated, setRotated] = React.useState(false);
  const [portrait, setPortrait] = React.useState(false);
  const [frameWidth, setFrameWidth] = React.useState(0);

  const gate = mode === "gate";

  React.useEffect(() => {
    const query = window.matchMedia("(orientation: portrait)");
    const read = () => {
      setPortrait(query.matches);
      // They turned the phone itself: the layout is already wide, so take the
      // manual rotation off rather than leaving the video on its side.
      if (!query.matches) setRotated(false);
    };
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  // The rotated frame is as tall as the upright one is wide multiplied out to
  // 16:9, so the turned video fills it exactly.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setFrameWidth(frame.clientWidth));
    observer.observe(frame);
    setFrameWidth(frame.clientWidth);
    return () => observer.disconnect();
  }, []);

  const rotatedLong = Math.round(frameWidth * (16 / 9));
  const turned = rotated && frameWidth > 0;
  const hintTimes = React.useMemo(() => rotateHintTimes(duration), [duration]);
  const showHint = portrait && !rotated && playing && rotateHintVisible(position, hintTimes);

  // Let the chapter list drive the element, without exposing the ref itself.
  React.useEffect(() => {
    if (!seekRef) return;
    seekRef.current = (seconds: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, seconds);
      lastTimeRef.current = v.currentTime;
      void v.play().catch(() => {});
    };
    return () => {
      seekRef.current = null;
    };
  }, [seekRef]);

  const send = React.useCallback(
    (keepalive: boolean) => {
      if (!gate) return;
      const seconds = Math.round(progressRef.current);
      const length = Math.round(videoRef.current?.duration ?? duration);
      if (!length || seconds <= Math.round(sentRef.current)) return;
      sentRef.current = seconds;
      onProgress?.(seconds, length);
      void fetch("/api/ambassador/tour/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secondsWatched: seconds, durationSeconds: length }),
        keepalive,
      }).catch(() => {
        // A failed save costs at most the seconds since the last one: the next
        // tick sends the furthest point again, not a delta.
        sentRef.current = Math.min(sentRef.current, seconds - 1);
      });
    },
    [duration, gate, onProgress]
  );

  // Save on a timer rather than on every frame, and once more on the way out
  // (closing the tab, locking the phone) so the position is not lost.
  React.useEffect(() => {
    if (!gate) return;
    const timer = window.setInterval(() => send(false), PROGRESS_SAVE_SECONDS * 1000);
    const leave = () => send(true);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", leave);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", leave);
      send(true);
    };
  }, [gate, send]);

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    setDuration(v.duration);
    onDuration?.(v.duration);
    if (startAt > 0 && startAt < v.duration) {
      v.currentTime = startAt;
      lastTimeRef.current = startAt;
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setPosition(t);

    if (!gate) {
      lastTimeRef.current = t;
      return;
    }

    const next = advanceProgress(progressRef.current, lastTimeRef.current, t);
    if (next.clampTo != null) {
      v.currentTime = next.clampTo;
      lastTimeRef.current = next.clampTo;
      setPosition(next.clampTo);
      return;
    }
    lastTimeRef.current = t;
    if (next.progress > progressRef.current) {
      progressRef.current = next.progress;
      setProgress(next.progress);
    }
  };

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const onVolume = (next: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = next;
    v.muted = next === 0;
    setVolume(next);
    setMuted(v.muted);
  };

  const fullscreen = () => {
    // Full screen is already big, and the two sizings would fight: the rotated
    // frame is measured from the column width, not the screen.
    setRotated(false);
    const frame = frameRef.current;
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (frame?.requestFullscreen) void frame.requestFullscreen().catch(() => {});
    else v?.webkitEnterFullscreen?.(); // iPhone Safari has no element fullscreen
  };

  const percent = watchedPercent(progress, duration);

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-slate-950",
          turned ? null : "aspect-video"
        )}
        style={turned ? { height: rotatedLong } : undefined}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          preload="metadata"
          playsInline
          controls={!gate}
          controlsList={gate ? "nodownload" : undefined}
          className={turned ? "absolute left-1/2 top-1/2 max-w-none" : "size-full"}
          style={
            turned
              ? {
                  width: rotatedLong,
                  height: frameWidth,
                  transform: "translate(-50%, -50%) rotate(90deg)",
                }
              : undefined
          }
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            send(false);
          }}
          onEnded={() => {
            setPlaying(false);
            send(true);
          }}
          onError={() => onError?.()}
          onRateChange={() => {
            // Watching at double speed is still watching; 16x is not — at that
            // rate each timeupdate step is too big to earn anything anyway, so
            // this only keeps the progress line honest rather than punishing it.
            const v = videoRef.current;
            if (!gate || !v) return;
            if (v.playbackRate > MAX_PLAYBACK_RATE) v.playbackRate = MAX_PLAYBACK_RATE;
          }}
          onSeeking={() => {
            // Belt and braces: `timeupdate` clamps too, but this catches a drag
            // before a frame is even decoded.
            const v = videoRef.current;
            if (!gate || !v) return;
            if (v.currentTime > progressRef.current + MAX_CREDITED_JUMP_SECONDS) {
              v.currentTime = progressRef.current;
            }
          }}
        />

        {/* The poster's own play button: a video with sound needs a real click. */}
        {gate && !playing ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={TOUR_CONTROLS.play}
            className="absolute inset-0 grid place-items-center bg-slate-950/40 transition-colors hover:bg-slate-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
          >
            <span className="grid size-16 place-items-center rounded-full bg-white/95 text-slate-900 shadow-lift">
              <LuPlay className="size-7 translate-x-0.5" aria-hidden />
            </span>
          </button>
        ) : null}

        {/* Turn the video rather than the phone: for a phone on rotation lock,
            or anyone lying down. Offered only while the phone is upright,
            where it is the whole point. */}
        {portrait ? (
          <button
            type="button"
            onClick={() => setRotated((r) => !r)}
            aria-label={rotated ? TOUR_CONTROLS.unrotate : TOUR_CONTROLS.rotate}
            aria-pressed={rotated}
            className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-slate-950/65 text-white backdrop-blur-sm transition-colors hover:bg-slate-950/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <LuRotateCw className={cn("size-5", rotated ? "-rotate-90" : null)} aria-hidden />
          </button>
        ) : null}

        {/* "Turn your phone sideways", a few times while it would help. */}
        {showHint ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
            <p className="flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-2 text-[13px] font-medium text-white shadow-lift backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in">
              <LuSmartphone className="size-4 shrink-0 rotate-90" aria-hidden />
              {TOUR_TEXT.rotateHint}
            </p>
          </div>
        ) : null}
      </div>

      {gate ? (
        <>
          <div
            role="progressbar"
            aria-label={TOUR_CONTROLS.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 w-full overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? TOUR_CONTROLS.pause : TOUR_CONTROLS.play}
              className="grid size-12 place-items-center rounded-lg text-foreground transition-colors hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {playing ? <LuPause className="size-5" aria-hidden /> : <LuPlay className="size-5" aria-hidden />}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? TOUR_CONTROLS.unmute : TOUR_CONTROLS.mute}
              className="grid size-12 place-items-center rounded-lg text-foreground transition-colors hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {muted ? <LuVolumeX className="size-5" aria-hidden /> : <LuVolume2 className="size-5" aria-hidden />}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-12 w-20 accent-primary sm:w-28"
            />

            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {formatTimestamp(position)}
              {duration > 0 ? ` / ${formatTimestamp(duration)}` : null}
            </span>

            <button
              type="button"
              onClick={fullscreen}
              aria-label={TOUR_CONTROLS.fullscreen}
              className={cn(
                "grid size-12 place-items-center rounded-lg text-foreground transition-colors",
                "hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <LuMaximize className="size-5" aria-hidden />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
