"use client";

import * as React from "react";

/**
 * What this device can afford.
 *
 * Resolved once on mount rather than per frame, because none of it changes
 * without a resize — and a resize gets a fresh evaluation. The scene never
 * asks "is this mobile"; it asks for a budget and spends it.
 */
export interface SceneProfile {
  /** WebGL context is obtainable at all. */
  supported: boolean;
  /** User asked for less motion. The scene composes, then holds still. */
  reducedMotion: boolean;
  /** Sheets to build. Fewer on small screens: the back of the stack is not visible there. */
  sheets: number;
  /** Page texture width in px. Height follows the ISO ratio. */
  textureResolution: number;
  /** Device pixel ratio clamp. Retina phones will happily render 3× and melt. */
  dpr: [number, number];
  /** Shadow maps — the single most expensive thing in this scene. */
  shadows: boolean;
  /** The far archive grid. Atmosphere only; first thing to go. */
  archive: boolean;
  /** Composition compression. Full offsets push sheets off a narrow screen. */
  spread: number;
  /** Pointer parallax is meaningless without a pointer. */
  pointer: boolean;
}

const SERVER_PROFILE: SceneProfile = {
  supported: false,
  reducedMotion: false,
  sheets: 7,
  textureResolution: 896,
  dpr: [1, 1.75],
  shadows: true,
  archive: true,
  spread: 1,
  pointer: true,
};

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!gl) return false;
    // A software rasteriser will report a context and then render at 4fps.
    const debug = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
    if (debug) {
      const renderer = String(
        (gl as WebGLRenderingContext).getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "",
      ).toLowerCase();
      if (renderer.includes("swiftshader") || renderer.includes("llvmpipe")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Probed once per document. Creating a context per resize leaks them. */
let webglSupport: boolean | null = null;

function resolve(): SceneProfile {
  if (webglSupport === null) webglSupport = detectWebGL();
  const supported = webglSupport;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const width = window.innerWidth;

  // `deviceMemory` is Chromium-only; absent means "assume capable", which is
  // the right default because Safari desktop reports nothing and renders fine.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const weak = memory <= 4 || cores <= 4;

  const small = width < 768;
  const medium = width < 1200;

  return {
    supported,
    reducedMotion,
    sheets: small ? 5 : 7,
    textureResolution: small ? 512 : weak || medium ? 704 : 896,
    dpr: small ? [1, 1.5] : [1, weak ? 1.5 : 1.75],
    shadows: !small && !weak,
    archive: !small && !weak,
    spread: small ? 0.72 : medium ? 0.88 : 1,
    pointer: !coarse,
  };
}

export function useResponsiveScene(): SceneProfile {
  const [profile, setProfile] = React.useState<SceneProfile>(SERVER_PROFILE);

  React.useEffect(() => {
    setProfile(resolve());

    // Only the layout-sensitive half is re-resolved on resize; re-running the
    // WebGL probe on every drag of a window edge would leak contexts.
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setProfile(resolve()));
    };
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setProfile(resolve());

    window.addEventListener("resize", onResize, { passive: true });
    motionQuery.addEventListener("change", onMotion);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      motionQuery.removeEventListener("change", onMotion);
    };
  }, []);

  return profile;
}
