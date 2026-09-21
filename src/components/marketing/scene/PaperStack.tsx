"use client";

import * as React from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
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

const SHEET = "absolute paper-surface rounded-[4px]";

function RunningHead({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between font-mono text-[0.5em] font-semibold tracking-[0.14em]">
      <span className="text-primary">{left}</span>
      <span className="text-paper-muted">{right}</span>
    </div>
  );
}

/**
 * Interaction, all transform-only so it stays on the compositor:
 *   • pointer / finger drag tilts the whole stack (springs back on release);
 *   • on Android, the phone's own tilt nudges it (iOS needs a permission
 *     prompt for that, which a decorative effect never asks for);
 *   • scrolling fans the sheets apart in depth;
 *   • at rest it breathes with a slow float.
 * Reduced motion gets the static composition.
 */

/**
 * One sheet's own motion. Every sheet answers the same pointer, but with its own
 * depth, weight and rhythm, so the stack never moves as a single rigid block:
 * near sheets travel further and settle quickly, distant ones lag behind, each
 * leans a little differently, and each drifts on its own slow cycle.
 */
function useSheet(
  tiltX: MotionValue<number>,
  tiltY: MotionValue<number>,
  lift: MotionValue<number>,
  reduced: boolean | null,
  o: { depth: number; stiffness: number; damping: number; lean: number; roll: number; float: number; period: number; delay: number; baseY: number; baseZ: number },
) {
  const spring = { stiffness: o.stiffness, damping: o.damping, mass: 0.9 };
  const x = useSpring(useTransform(tiltX, (v) => v * o.depth), spring);
  const yTilt = useSpring(useTransform(tiltY, (v) => v * o.depth * 0.7), spring);
  const rotateY = useSpring(useTransform(tiltX, (v) => o.baseY + v * o.lean), spring);
  const rotateX = useSpring(useTransform(tiltY, (v) => -v * o.lean * 0.6), spring);
  const rotateZ = useSpring(useTransform(tiltX, (v) => o.baseZ + v * o.roll), spring);
  const drift = useMotionValue(0);

  React.useEffect(() => {
    if (reduced) return;
    const controls = animate(drift, [0, -o.float, 0], {
      duration: o.period,
      delay: o.delay,
      repeat: Infinity,
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [reduced, drift, o.float, o.period, o.delay]);

  const y = useTransform([yTilt, drift, lift], ([a, b, c]: number[]) => a + b + c * (o.depth / 22));
  return { x, y, rotateX, rotateY, rotateZ };
}

export function PaperStack({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const root = React.useRef<HTMLDivElement>(null);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end start"] });
  const spread = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const backZ = useTransform(spread, (v) => -150 - v * 140);
  const midZ = useTransform(spread, (v) => -80 - v * 70);
  const frontZ = useTransform(spread, (v) => 40 + v * 90);
  const lift = useTransform(spread, (v) => v * -40);

  const back = useSheet(tiltX, tiltY, lift, reduced, { depth: 8, stiffness: 55, damping: 16, lean: 5, roll: 1.2, float: 7, period: 7.4, delay: 0.6, baseY: 5, baseZ: 2 });
  const mid = useSheet(tiltX, tiltY, lift, reduced, { depth: 15, stiffness: 80, damping: 15, lean: -7, roll: -2, float: 10, period: 6.1, delay: 0.2, baseY: 10, baseZ: -2.5 });
  const front = useSheet(tiltX, tiltY, lift, reduced, { depth: 26, stiffness: 130, damping: 14, lean: 9, roll: 1.6, float: 13, period: 5.2, delay: 0, baseY: -5, baseZ: 0 });

  React.useEffect(() => {
    if (reduced) return;
    const el = root.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tiltX.set(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)));
      tiltY.set(Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)));
    };
    const reset = () => {
      tiltX.set(0);
      tiltY.set(0);
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tiltX.set(Math.max(-1, Math.min(1, e.gamma / 30)));
      tiltY.set(Math.max(-1, Math.min(1, (e.beta - 45) / 40)));
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    el.addEventListener("pointerup", reset);
    el.addEventListener("pointercancel", reset);
    // Only where it needs no permission prompt (Android Chrome).
    const needsPermission =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === "function";
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse && !needsPermission) window.addEventListener("deviceorientation", onOrient);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
      el.removeEventListener("pointerup", reset);
      el.removeEventListener("pointercancel", reset);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [reduced, tiltX, tiltY]);

  return (
    <div ref={root} aria-hidden className={cn("relative h-full w-full touch-pan-y [perspective:1600px]", className)}>
      {/* The surface the stack rests over: a tinted pool of light and a soft
          contact shadow, so the sheets have somewhere to cast. */}
      <div className="pointer-events-none absolute inset-[6%_4%_2%] rounded-[50%] bg-[radial-gradient(closest-side,hsl(var(--primary)/0.16),transparent)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-[6%] left-[18%] h-[10%] w-[64%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(15_23_42/0.22),transparent)] blur-xl" />

      {/* Float lives on its own layer: a CSS animation would overwrite the
          transform the tilt writes on the stack itself. */}
      <div className="absolute inset-0 [transform-style:preserve-3d]">
        <motion.div className="absolute inset-0 [transform-style:preserve-3d]" style={{ rotateX: 3, rotateY: -12 }}>
          {/* References — behind the right edge */}
          <motion.div
            className={cn(SHEET, "overflow-hidden")}
            style={{
              width: "44%",
              aspectRatio: "1 / 1.414",
              right: "5%",
              top: "8%",
              z: reduced ? -150 : backZ,
              ...(reduced ? { rotateY: 5, rotateZ: 2 } : { x: back.x, y: back.y, rotateX: back.rotateX, rotateY: back.rotateY, rotateZ: back.rotateZ }),
            }}
          >
            <div className="flex h-full flex-col p-[8%]" style={{ fontSize: "0.9rem" }}>
              <RunningHead left="EDUCRAFT" right="REFERENCES" />
              <div className="mt-[6%] min-h-0 flex-1">
                <ScrollingPage blocks={REFERENCE_SHEET} distance={30} fontSize="0.44rem" dense />
              </div>
            </div>
          </motion.div>

          {/* Analysis — behind the left edge */}
          <motion.div
            className={cn(SHEET, "overflow-hidden")}
            style={{
              width: "45%",
              aspectRatio: "1 / 1.414",
              left: "0%",
              top: "1%",
              z: reduced ? -80 : midZ,
              ...(reduced ? { rotateY: 10, rotateZ: -2.5 } : { x: mid.x, y: mid.y, rotateX: mid.rotateX, rotateY: mid.rotateY, rotateZ: mid.rotateZ }),
            }}
          >
            <div className="flex h-full flex-col p-[8%]" style={{ fontSize: "0.9rem" }}>
              <RunningHead left="EDUCRAFT" right="CH. 04" />
              <div className="mt-[6%] min-h-0 flex-1">
                <ScrollingPage blocks={ANALYSIS_SHEET} distance={34} fontSize="0.46rem" dense />
              </div>
            </div>
          </motion.div>

          {/* Primary — the reviewed chapter, in the reading plane */}
          <motion.div
            className={cn(SHEET, "overflow-hidden")}
            style={{
              width: "54%",
              aspectRatio: "1 / 1.414",
              left: "23%",
              top: "17%",
              z: reduced ? 40 : frontZ,
              ...(reduced ? { rotateY: -5 } : { x: front.x, y: front.y, rotateX: front.rotateX, rotateY: front.rotateY, rotateZ: front.rotateZ }),
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
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
