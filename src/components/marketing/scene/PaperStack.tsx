"use client";

import * as React from "react";
import { ScrollingPage } from "@/components/marketing/scene/DocumentBody";
import { ANALYSIS_SHEET, REFERENCE_SHEET, REVIEW_SHEET } from "@/lib/document-content";
import { cn } from "@/lib/utils";

/**
 * The workspace composition, in CSS 3D.
 *
 * Four sheets on separate z-planes. Each carries real typeset project copy —
 * chapter openers, section numbers, justified prose, a figure, a reference
 * list — and the type inside each frame travels as the hero scrolls, so the
 * stack reads as work in progress rather than as a static screenshot.
 *
 * Decorative in full: the element is `aria-hidden`, and every claim it makes
 * is stated in the hero copy beside it.
 */

const SHEET =
  "absolute paper-surface [clip-path:polygon(0_0,100%_0,100%_calc(100%-26px),calc(100%-26px)_100%,0_100%)]";

export function PaperStack({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative h-full w-full [perspective:1500px]", className)}
    >
      <div className="absolute inset-0 [transform-style:preserve-3d] [transform:rotateX(3deg)_rotateY(-13deg)]">
        {/* Receding draft — depth only, no content at this distance */}
        <div
          className={cn(SHEET, "opacity-30")}
          style={{
            width: "44%",
            aspectRatio: "1 / 1.414",
            left: "6%",
            top: "34%",
            transform: "translateZ(-230px) rotateY(9deg) rotateZ(-1.5deg)",
          }}
        />

        {/* References */}
        <div
          className={cn(SHEET, "overflow-hidden opacity-70")}
          style={{
            width: "48%",
            aspectRatio: "1 / 1.414",
            right: "-2%",
            top: "9%",
            transform: "translateZ(-150px) rotateY(5deg) rotateZ(1.2deg)",
          }}
        >
          <div className="h-full p-[7%]">
            <ScrollingPage blocks={REFERENCE_SHEET} distance={30} fontSize="0.44rem" dense />
          </div>
        </div>

        {/* Analysis */}
        <div
          className={cn(SHEET, "overflow-hidden opacity-90")}
          style={{
            width: "46%",
            aspectRatio: "1 / 1.414",
            left: "-4%",
            top: "-2%",
            transform: "translateZ(-70px) rotateY(11deg) rotateZ(-2deg)",
          }}
        >
          <div className="h-full p-[8%]">
            <ScrollingPage blocks={ANALYSIS_SHEET} distance={34} fontSize="0.46rem" dense />
          </div>
        </div>

        {/* Primary — the reviewed chapter, in the reading plane */}
        <div
          className={cn(SHEET, "overflow-hidden")}
          style={{
            width: "54%",
            aspectRatio: "1 / 1.414",
            left: "24%",
            top: "16%",
            transform: "translateZ(30px) rotateY(-4deg)",
          }}
        >
          <div className="relative flex h-full flex-col p-[8%]">
            <div className="flex shrink-0 items-center justify-between font-mono text-[0.5rem] font-semibold tracking-[0.14em]">
              <span className="text-primary">EDUCRAFT / QUALITY REVIEW</span>
              <span className="text-paper-muted">PASSED</span>
            </div>

            <div className="mt-[5%] h-px shrink-0 bg-paper-ink/15" />

            {/* The page itself — travels with the reader */}
            <div className="relative mt-[5%] min-h-0 flex-1">
              {/* Margin marker beside the passage under review */}
              <span className="absolute -left-[4%] top-2 z-10 h-10 w-[2px] bg-primary" />
              <span className="absolute -left-[4.4%] top-1 z-10 h-1.5 w-1.5 rounded-full bg-primary" />
              <ScrollingPage blocks={REVIEW_SHEET} distance={46} fontSize="0.5rem" />
            </div>

            {/* Chapter tab, bled off the edge — the only gold in the frame */}
            <span className="absolute right-0 top-[46%] h-[14%] w-[9px] bg-gold" />

            <span className="absolute bottom-[7%] left-[8%] font-mono text-[0.5rem] font-medium text-paper-muted">
              42
            </span>
          </div>
        </div>

        {/* Foreground margin guide */}
        <span
          className="absolute left-[14%] top-0 h-full w-px bg-primary/50"
          style={{ transform: "translateZ(120px) rotateY(-8deg)" }}
        />
      </div>
    </div>
  );
}
