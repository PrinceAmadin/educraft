"use client";

/**
 * Continuous input, kept outside React on purpose.
 *
 * Pointer position and scroll progress change every frame. Routing them
 * through state would re-render the tree to move something React never draws,
 * so they live here as a plain mutable object: DOM listeners write, useFrame
 * reads, nothing re-renders.
 *
 * Values are normalised at the edge (−1…1 for pointer, 0…1 for progress) so
 * the scene never has to know about pixels or viewport size.
 */
export const signals = {
  /** Pointer, −1 (left/bottom) … 1 (right/top), relative to the viewport. */
  pointerX: 0,
  pointerY: 0,
  /** True until the pointer has moved at least once — suppresses a snap on load. */
  pointerIdle: true,
  /** 0 at the top of the hero, 1 when the hero has fully left the viewport. */
  heroProgress: 0,
};

let listening = false;

/**
 * Installs the global pointer listener once, no matter how many consumers ask.
 * Returns a disposer that only detaches when the last consumer leaves.
 */
let consumers = 0;

export function attachPointerSignal(): () => void {
  consumers += 1;

  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerMove, { passive: true });
  }

  return () => {
    consumers -= 1;
    if (consumers <= 0 && listening && typeof window !== "undefined") {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      listening = false;
      consumers = 0;
    }
  };
}

function onPointerMove(event: PointerEvent) {
  // Coarse pointers report a single tap at the moment of contact; treating
  // that as a parallax target makes the scene jump under the finger.
  if (event.pointerType === "touch") return;
  signals.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
  signals.pointerY = -((event.clientY / window.innerHeight) * 2 - 1);
  signals.pointerIdle = false;
}
