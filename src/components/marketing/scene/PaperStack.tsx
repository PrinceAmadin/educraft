"use client";

import * as React from "react";
import { ScrollingPage } from "@/components/marketing/scene/DocumentBody";
import { ANALYSIS_SHEET, REFERENCE_SHEET, REVIEW_SHEET } from "@/lib/document-content";
import { cn } from "@/lib/utils";

/**
 * The workspace composition, in CSS 3D.
 *
 * Three sheets, deliberately overlapped: the reviewed chapter in the reading
 * plane, the analysis chapter tucked behind its left edge, and the reference
 * list behind its right. Each carries real typeset project copy under an
 * EduCraft running head, and the type inside each frame travels as the hero
 * scrolls, so the stack reads as work in progress rather than a screenshot.
 *
 * Decorative in full: the element is `aria-hidden`, and every claim it makes
 * is stated in the hero copy beside it.
 */

const SHEET =
  "absolute paper-surface [clip-path:polygon(0_0,100%_0,100%_calc(100%-22px),calc(100%-22px)_100%,0_100%)]";

function RunningHead({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between font-mono text-[0.5em] font-semibold tracking-[0.14em]">
      <span className="text-primary">{left}</span>
      <span className="text-paper-muted">{right}</span>
    </div>
  );
}

export function PaperStack({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-full w-full [perspective:1600px]", className)}>
      <div className="absolute inset-0 [transform-style:preserve-3d] [transform:rotateX(3deg)_rotateY(-12deg)]">
        {/* References — behind the right edge */}
        <div
          className={cn(SHEET, "overflow-hidden opacity-85")}
          style={{
            width: "44%",
            aspectRatio: "1 / 1.414",
            right: "2%",
            top: "8%",
            transform: "translateZ(-150px) rotateY(5deg) rotateZ(2deg)",
          }}
        >
          <div className="flex h-full flex-col p-[8%]" style={{ fontSize: "0.9rem" }}>
            <RunningHead left="EDUCRAFT" right="REFERENCES" />
            <div className="mt-[6%] min-h-0 flex-1">
              <ScrollingPage blocks={REFERENCE_SHEET} distance={30} fontSize="0.44rem" dense />
            </div>
          </div>
        </div>

        {/* Analysis — behind the left edge */}
        <div
          className={cn(SHEET, "overflow-hidden opacity-95")}
          style={{
            width: "45%",
            aspectRatio: "1 / 1.414",
            left: "0%",
            top: "1%",
            transform: "translateZ(-80px) rotateY(10deg) rotateZ(-2.5deg)",
          }}
        >
          <div className="flex h-full flex-col p-[8%]" style={{ fontSize: "0.9rem" }}>
            <RunningHead left="EDUCRAFT" right="CH. 04" />
            <div className="mt-[6%] min-h-0 flex-1">
              <ScrollingPage blocks={ANALYSIS_SHEET} distance={34} fontSize="0.46rem" dense />
            </div>
          </div>
        </div>

        {/* Primary — the reviewed chapter, in the reading plane */}
        <div
          className={cn(SHEET, "overflow-hidden")}
          style={{
            width: "54%",
            aspectRatio: "1 / 1.414",
            left: "23%",
            top: "17%",
            transform: "translateZ(40px) rotateY(-5deg)",
          }}
        >
          <div className="relative flex h-full flex-col p-[8%]" style={{ fontSize: "1rem" }}>
            <RunningHead left="EDUCRAFT / QUALITY REVIEW" right="PASSED" />

            <div className="mt-[5%] h-px shrink-0 bg-paper-ink/15" />

            {/* The page itself — travels with the reader */}
            <div className="relative mt-[5%] min-h-0 flex-1">
              {/* Margin marker beside the passage under review */}
              <span className="absolute -left-[4%] top-2 z-10 h-10 w-[2px] bg-primary" />
              <span className="absolute -left-[4.4%] top-1 z-10 size-1.5 rounded-full bg-primary" />
              <ScrollingPage blocks={REVIEW_SHEET} distance={46} fontSize="0.5rem" />
            </div>

            {/* Chapter tab, bled off the edge — the only gold in the frame */}
            <span className="absolute right-0 top-[46%] h-[14%] w-[8px] bg-gold" />

            <span className="absolute bottom-[6%] left-[8%] font-mono text-[0.5rem] font-medium text-paper-muted">
              42
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
