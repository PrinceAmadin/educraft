import type { Euler, Vector3 } from "three";

/**
 * Frame-rate independent exponential damping.
 *
 * `current += (target - current) * factor` is the usual one-liner, and it is
 * wrong: the factor is per *frame*, so the same scene moves at a different
 * speed on 60Hz, 120Hz and a throttled background tab. This solves the decay
 * analytically instead — `lambda` is a rate per second and the result is
 * identical at any refresh rate.
 *
 * Nothing in this scene is attached directly to input. Everything is a target
 * that something else chases, which is what makes the movement feel like mass
 * rather than a value assignment.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Same curve, applied to a Vector3 in place. Returns whether it moved meaningfully. */
export function damp3(
  current: Vector3,
  tx: number,
  ty: number,
  tz: number,
  lambda: number,
  dt: number,
): void {
  const decay = Math.exp(-lambda * dt);
  current.x = tx + (current.x - tx) * decay;
  current.y = ty + (current.y - ty) * decay;
  current.z = tz + (current.z - tz) * decay;
}

/** Same curve, applied to an Euler in place. */
export function dampE(
  current: Euler,
  rx: number,
  ry: number,
  rz: number,
  lambda: number,
  dt: number,
): void {
  const decay = Math.exp(-lambda * dt);
  current.x = rx + (current.x - rx) * decay;
  current.y = ry + (current.y - ry) * decay;
  current.z = rz + (current.z - rz) * decay;
}

/** Clamp helper — used for pointer normalisation and scroll progress. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Hermite smoothstep. Used for scroll-driven ranges so nothing starts abruptly. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Linear interpolation, for values that are already smoothed upstream. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
