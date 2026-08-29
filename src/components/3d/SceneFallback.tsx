"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ScenePalette } from "@/lib/scene/art-direction";

interface SceneFallbackProps {
  palette: ScenePalette;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}

/**
 * The composition without WebGL.
 *
 * This is not a placeholder box and it is not a spinner. It is the same idea —
 * a document held in depth, with its metadata beside it — built out of three
 * transformed elements and a hairline. It renders before the canvas has drawn
 * a frame, on machines that cannot give us a context, and inside the server
 * pass, so the hero is never structurally empty.
 *
 * It is also the honest test of the design: if the page only works with the
 * canvas running, the canvas is carrying the design rather than supporting it.
 */
export function SceneFallback({ palette, className, style, ...rest }: SceneFallbackProps) {
  return (
    <div
      className={cn("pointer-events-none relative flex items-center justify-center", className)}
      style={{ perspective: "1400px", ...style }}
      {...rest}
    >
      <div
        className="relative h-[min(60vh,30rem)] w-[min(78vw,21rem)]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Back of the stack. Two sheets, only their trim edges visible. */}
        <div
          className="paper-surface absolute inset-0 rounded-[2px]"
          style={{ transform: "translate3d(-6%, 7%, -140px) rotate(-3.6deg)", opacity: 0.4 }}
        />
        <div
          className="paper-surface absolute inset-0 rounded-[2px]"
          style={{ transform: "translate3d(-2%, 3.5%, -70px) rotate(-1.7deg)", opacity: 0.66 }}
        />

        {/* The page in hand. */}
        <div
          className="paper-surface absolute inset-0 rounded-[2px] px-[11%] py-[9%]"
          style={{ transform: "rotateY(-14deg) rotateX(3deg)" }}
        >
          <div className="flex items-baseline justify-between">
            <span
              className="index-mark"
              style={{ color: palette.inkMuted, letterSpacing: "0.18em" }}
            >
              CHAPTER FOUR · ANALYSIS
            </span>
            <span className="index-mark" style={{ color: palette.inkMuted }}>
              47
            </span>
          </div>
          <div className="mt-2 h-px w-full" style={{ background: palette.rule }} />

          <p
            className="mt-[9%] font-serif text-[clamp(1rem,2.4vw,1.35rem)] leading-[1.15]"
            style={{ color: palette.ink }}
          >
            Analysis and Discussion of Findings
          </p>

          <div
            className="paper-lines mt-[8%] h-[26%] w-full opacity-[0.22]"
            style={{ color: palette.ink }}
          />
          <div
            className="mt-[6%] h-[16%] w-full border"
            style={{ borderColor: palette.rule }}
            aria-hidden
          />
          <div
            className="paper-lines mt-[6%] h-[12%] w-[86%] opacity-[0.18]"
            style={{ color: palette.ink }}
          />
        </div>

        {/* Foreground metadata, on the same leader-rule system as the scene. */}
        <div
          className="absolute -left-[34%] top-[16%] hidden items-center gap-3 sm:flex"
          style={{ transform: "translateZ(90px)" }}
        >
          <span className="h-px w-10" style={{ background: palette.meta, opacity: 0.5 }} />
          <span className="index-mark" style={{ color: palette.accent }}>
            REF. 027
          </span>
        </div>
        <div
          className="absolute -right-[18%] bottom-[9%] hidden items-center gap-3 sm:flex"
          style={{ transform: "translateZ(60px)" }}
        >
          <span className="h-px w-8" style={{ background: palette.meta, opacity: 0.4 }} />
          <span className="index-mark" style={{ color: palette.meta }}>
            QUALITY REVIEW · PASSED
          </span>
        </div>
      </div>
    </div>
  );
}
