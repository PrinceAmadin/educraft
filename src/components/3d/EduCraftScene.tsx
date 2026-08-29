"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, Fog } from "three";
import { useTheme } from "next-themes";
import { CAMERA, PALETTE, type ThemeKey } from "@/lib/scene/art-direction";
import { useSceneStore } from "@/lib/scene/store";
import { AcademicDocuments } from "./AcademicDocuments";
import { ArchiveField } from "./ArchiveField";
import { Atmosphere } from "./Atmosphere";
import { CameraRig } from "./CameraRig";
import { SceneLighting } from "./SceneLighting";
import { SceneFallback } from "./SceneFallback";
import { useResponsiveScene, type SceneProfile } from "./useResponsiveScene";
import { useHeroProgress, useSceneInteraction } from "./useSceneInteraction";

/**
 * The hero's WebGL layer.
 *
 * Everything that touches the browser rather than the scene graph lives here:
 * theme resolution, the render-loop gate, the device budget, and the decision
 * not to render at all. Below this component nothing knows what a media query
 * is.
 */

interface EduCraftSceneProps {
  /** Scroll progress and visibility are measured against this element. */
  progressRef: React.RefObject<HTMLElement>;
  className?: string;
}

export function EduCraftScene({ progressRef, className }: EduCraftSceneProps) {
  const profile = useResponsiveScene();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const ready = useSceneStore((s) => s.ready);

  React.useEffect(() => setMounted(true), []);
  useHeroProgress(progressRef);

  // The render loop is gated on the hero being on screen. A canvas that has
  // scrolled away costs exactly nothing.
  React.useEffect(() => {
    const el = progressRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "160px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [progressRef]);

  const theme: ThemeKey = resolvedTheme === "light" ? "light" : "dark";
  const palette = PALETTE[theme];

  // Composition anchor: right of the lens axis on desktop where the headline
  // occupies the left half, centred once the layout stacks.
  const anchorX = profile.spread >= 1 ? 0.92 : profile.spread >= 0.85 ? 0.52 : 0;

  if (!mounted) return <SceneFallback className={className} palette={palette} />;
  if (!profile.supported) return <SceneFallback className={className} palette={palette} />;

  return (
    <div className={className}>
      {/* Held under the canvas until the pages have been typeset and drawn, so
          the hero is never an empty rectangle on a slow first paint. */}
      <SceneFallback
        palette={palette}
        className="absolute inset-0 transition-opacity duration-700 ease-editorial"
        style={{ opacity: ready ? 0 : 1 }}
        aria-hidden
      />

      <Canvas
        className="!absolute inset-0"
        dpr={profile.dpr}
        shadows={profile.shadows}
        frameloop={visible ? (profile.reducedMotion ? "demand" : "always") : "never"}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        }}
        camera={{
          fov: CAMERA.fov,
          near: CAMERA.near,
          far: CAMERA.far,
          position: [...CAMERA.position],
        }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          // Fog is the depth cue and the edge treatment at once: the archive
          // dissolves into the page background instead of stopping at the
          // canvas boundary.
          scene.fog = new Fog(palette.ground, 5.8, 14);
        }}
      >
        <SceneContents palette={palette} profile={profile} anchorX={anchorX} theme={theme} />
      </Canvas>
    </div>
  );
}

function SceneContents({
  palette,
  profile,
  anchorX,
  theme,
}: {
  palette: (typeof PALETTE)[ThemeKey];
  profile: SceneProfile;
  anchorX: number;
  theme: ThemeKey;
}) {
  const { scene } = useThree();

  // Theme changes swap the fog without rebuilding the scene.
  React.useEffect(() => {
    if (scene.fog) scene.fog.color.set(palette.ground);
  }, [scene, palette.ground]);

  useSceneInteraction({
    pointer: profile.pointer && !profile.reducedMotion,
    reducedMotion: profile.reducedMotion,
  });

  return (
    <>
      <CameraRig reducedMotion={profile.reducedMotion} />
      <SceneLighting
        palette={palette}
        shadows={profile.shadows}
        reducedMotion={profile.reducedMotion}
      />

      <Atmosphere
        palette={palette}
        reducedMotion={profile.reducedMotion}
        additive={theme === "dark"}
        intensity={theme === "dark" ? 0.55 : 0.2}
      />

      {profile.archive && <ArchiveField palette={palette} />}

      <AcademicDocuments
        palette={palette}
        resolution={profile.textureResolution}
        sheets={profile.sheets}
        spread={profile.spread}
        shadows={profile.shadows}
        reducedMotion={profile.reducedMotion}
        anchorX={anchorX}
      />

      {profile.reducedMotion && <SettleLoop />}
    </>
  );
}

/**
 * Reduced motion still needs the composition to *assemble* — it just must not
 * keep moving afterwards. The loop runs while the scene settles and after any
 * state change, then stops, leaving a still image on screen and an idle GPU.
 */
function SettleLoop() {
  const invalidate = useThree((s) => s.invalidate);
  const state = useSceneStore((s) => s.state);
  const ready = useSceneStore((s) => s.ready);
  const until = React.useRef(0);

  React.useEffect(() => {
    until.current = performance.now() + 2600;
    invalidate();
  }, [state, ready, invalidate]);

  useFrame(() => {
    if (performance.now() < until.current) invalidate();
  });

  return null;
}
