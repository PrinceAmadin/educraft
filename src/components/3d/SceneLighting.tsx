"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import type { SpotLight } from "three";
import type { ScenePalette } from "@/lib/scene/art-direction";
import { damp } from "@/lib/scene/damp";
import { field } from "./useSceneInteraction";

interface SceneLightingProps {
  palette: ScenePalette;
  shadows: boolean;
  reducedMotion: boolean;
}

/**
 * A four-light rig, borrowed wholesale from still-life photography because
 * that is the problem being solved: a flat, pale, matte object that has to
 * read as material rather than as a lit rectangle.
 *
 *   key    a spot, high and camera-left. Its distance falloff is doing the
 *          real work — a directional light lands identically on every sheet
 *          and the stack collapses into one flat plane.
 *   bounce a weak directional from below-right, standing in for the light a
 *          desk throws back up into the underside of a lifted page.
 *   rim    the only teal in the scene, raking from behind so the trim edges
 *          separate from the ground.
 *   fill   hemisphere, low, so nothing in shadow is ever fully black.
 *
 * The key drifts a few centimetres with the pointer. Not enough to notice
 * directly — enough that the specular gradient across the top sheet is never
 * quite the same twice, which is what stops the render looking frozen.
 */
export function SceneLighting({ palette, shadows, reducedMotion }: SceneLightingProps) {
  const key = React.useRef<SpotLight>(null);

  useFrame((_, delta) => {
    const node = key.current;
    if (!node || reducedMotion) return;
    const dt = Math.min(delta, 1 / 20);
    node.position.x = damp(node.position.x, -2.4 + field.x * 0.55, 1.4, dt);
    node.position.y = damp(node.position.y, 3.1 + field.y * 0.35, 1.4, dt);
  });

  return (
    <>
      <hemisphereLight args={[palette.key, palette.fill, 0.42]} />

      <spotLight
        ref={key}
        position={[-2.4, 3.1, 3.4]}
        angle={0.92}
        penumbra={1}
        decay={2}
        distance={18}
        // Physical falloff: the sheets sit ~5.2 units out, so the useful
        // irradiance is intensity / 27. Tuned to land paper just under clipping.
        intensity={34}
        color={palette.key}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={14}
        shadow-bias={-0.0004}
        shadow-normalBias={0.022}
        shadow-radius={3}
      />

      <directionalLight position={[2.6, -1.4, 2.2]} intensity={0.22} color={palette.key} />

      <directionalLight position={[1.8, 1.2, -3.2]} intensity={0.5} color={palette.rim} />
    </>
  );
}
