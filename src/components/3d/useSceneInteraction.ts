"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { damp, clamp } from "@/lib/scene/damp";
import { MOTION } from "@/lib/scene/art-direction";
import { attachPointerSignal, signals } from "@/lib/scene/signals";

/**
 * The interaction field.
 *
 * Raw pointer position is never used by anything that draws. It is damped once
 * here, per frame, into a single shared field that every part of the scene
 * reads. That has two consequences worth the indirection:
 *
 *   — everything moves on the same curve, so the composition holds together
 *     instead of each element racing the cursor at its own speed;
 *   — the layers can then scale that one value by their own depth, which is
 *     what produces parallax rather than a scene that follows the mouse.
 *
 * The field is a mutable module object, not state. It is written 60 times a
 * second and read inside useFrame; React is not involved.
 */
export const field = {
  /** Damped pointer, −1…1. */
  x: 0,
  y: 0,
  /** Damped hero scroll progress, 0…1. */
  scroll: 0,
  /** Seconds since the scene mounted. Drives ambient motion and the entrance. */
  elapsed: 0,
  /** 0…1 entrance progress. Layers key their arrival off slices of this. */
  entrance: 0,
};

interface Options {
  /** Coarse-pointer devices get no parallax; there is nothing to parallax against. */
  pointer: boolean;
  /** Reduced motion holds the field at rest and lets the composition settle. */
  reducedMotion: boolean;
}

export function useSceneInteraction({ pointer, reducedMotion }: Options) {
  React.useEffect(() => {
    if (!pointer) return undefined;
    return attachPointerSignal();
  }, [pointer]);

  // Reset on remount so a hot reload or a theme swap does not inherit a stale
  // entrance that has already finished.
  React.useEffect(() => {
    field.elapsed = 0;
    field.entrance = 0;
  }, []);

  useFrame((_, delta) => {
    // Long frames (tab restore, GC pause) would otherwise teleport everything.
    const dt = Math.min(delta, 1 / 20);
    field.elapsed += dt;

    // 2.4s to compose. Not a duration on any single element — it is the window
    // the staged entrance is distributed across.
    field.entrance = clamp(field.elapsed / 2.4, 0, 1);

    const targetX = pointer && !signals.pointerIdle ? signals.pointerX : 0;
    const targetY = pointer && !signals.pointerIdle ? signals.pointerY : 0;

    if (reducedMotion) {
      field.x = 0;
      field.y = 0;
      field.scroll = signals.heroProgress;
      return;
    }

    field.x = damp(field.x, targetX, MOTION.pointer, dt);
    field.y = damp(field.y, targetY, MOTION.pointer, dt);
    field.scroll = damp(field.scroll, signals.heroProgress, MOTION.cameraScroll, dt);
  }, -2);
}

/**
 * Publishes hero scroll progress into the signal object.
 *
 * Lives outside the Canvas — it measures a DOM element. Reads are coalesced
 * into a rAF so a fast scroll costs one layout read per frame, not one per
 * event.
 */
export function useHeroProgress(ref: React.RefObject<HTMLElement>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = rect.height || 1;
      signals.heroProgress = clamp(-rect.top / travel, 0, 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref]);
}
