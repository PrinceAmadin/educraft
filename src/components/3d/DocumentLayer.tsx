"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import type {
  BufferGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from "three";
import { MOTION, SHEET } from "@/lib/scene/art-direction";
import { clamp, damp, damp3, dampE, lerp, smoothstep } from "@/lib/scene/damp";
import { layoutFor, type SceneState } from "@/lib/scene/composition";
import { field } from "./useSceneInteraction";

interface DocumentLayerProps {
  index: number;
  state: SceneState;
  spread: number;
  reducedMotion: boolean;
  shadows: boolean;
  /** Shared across every sheet — one box, seven meshes. */
  geometry: BufferGeometry;
  overlayGeometry: BufferGeometry;
  /** Front face. Unique per sheet: it is the page. */
  face: MeshStandardMaterial;
  /** Trim and verso, shared. */
  edge: Material;
  back: Material;
  annotation: Texture | null;
  annotationMaterial: MeshStandardMaterial | null;
}

/**
 * One sheet.
 *
 * A thin box rather than a plane, which costs four extra faces and buys the
 * single most convincing detail in the composition: the trim edge catches the
 * key light, so the stack reads as objects with thickness instead of decals
 * floating at different z values.
 *
 * The sheet owns its own motion. It is handed a target by the composition
 * table and chases it — nothing upstream animates it, which is why a state
 * change looks like seven sheets deciding to move rather than one rigid group
 * being re-laid-out.
 */
export function DocumentLayer({
  index,
  state,
  spread,
  reducedMotion,
  shadows,
  geometry,
  overlayGeometry,
  face,
  edge,
  back,
  annotation,
  annotationMaterial,
}: DocumentLayerProps) {
  const mesh = React.useRef<Mesh>(null);
  const overlay = React.useRef<Mesh>(null);

  const target = React.useMemo(() => layoutFor(state, index, spread), [state, index, spread]);

  // Where the sheet arrives from: further away, lower, and turned a few degrees
  // further open. The stack assembles towards the lens rather than fading in.
  const entry = React.useMemo(() => {
    const rest = layoutFor("rest", index, spread);
    return {
      position: [
        rest.position[0] - 0.22,
        rest.position[1] - 0.42 - index * 0.03,
        rest.position[2] - 1.5 - index * 0.12,
      ] as [number, number, number],
      rotation: [
        rest.rotation[0] + 0.14,
        rest.rotation[1] - 0.2,
        rest.rotation[2] + 0.06,
      ] as [number, number, number],
    };
  }, [index, spread]);

  // Start at the entry pose so the first drawn frame is already correct.
  React.useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    node.position.set(...entry.position);
    node.rotation.set(...entry.rotation);
    node.scale.setScalar(0.94);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const materials = React.useMemo<Material[]>(
    // BoxGeometry groups: +x, −x, +y, −y, +z, −z. Only +z is the page.
    () => [edge, edge, edge, edge, face, back],
    [edge, face, back],
  );

  useFrame((_, delta) => {
    const node = mesh.current;
    if (!node) return;
    const dt = Math.min(delta, 1 / 20);

    // Staged arrival: each sheet waits its turn, front to back, and the whole
    // sequence is a slice of the scene's single entrance clock.
    const stagger = index * MOTION.sheetStagger;
    const arrival = smoothstep(0, 1, clamp((field.entrance - stagger) / 0.62, 0, 1));

    // The pointer moves the composition against itself: sheets nearer the lens
    // travel further, which is the whole of the depth illusion.
    const depth = target.parallax;
    const px = -field.x * MOTION.pointerAmplitude * depth;
    const py = -field.y * MOTION.pointerAmplitude * 0.55 * depth;

    // Paper on a desk is never quite still. 4mm, slower than breathing.
    const drift = reducedMotion ? 0 : Math.sin(field.elapsed * 0.32 + index * 1.7) * 0.004;

    const tx = lerp(entry.position[0], target.position[0], arrival) + px;
    const ty = lerp(entry.position[1], target.position[1], arrival) + py + drift;
    const tz = lerp(entry.position[2], target.position[2], arrival);

    damp3(node.position, tx, ty, tz, MOTION.sheet, dt);
    dampE(
      node.rotation,
      lerp(entry.rotation[0], target.rotation[0], arrival) + field.y * 0.014 * depth,
      lerp(entry.rotation[1], target.rotation[1], arrival) + field.x * 0.022 * depth,
      lerp(entry.rotation[2], target.rotation[2], arrival),
      MOTION.sheet,
      dt,
    );

    const scale = damp(node.scale.x, lerp(0.94, target.scale, arrival), MOTION.sheet, dt);
    node.scale.setScalar(scale);

    const opacity = damp(face.opacity, target.opacity * arrival, MOTION.sheet, dt);
    face.opacity = opacity;
    node.visible = opacity > 0.02;

    if (overlay.current && annotationMaterial) {
      const marks = damp(annotationMaterial.opacity, target.marks * arrival, MOTION.sheet, dt);
      annotationMaterial.opacity = marks;
      overlay.current.visible = marks > 0.02;
    }
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={materials}
      castShadow={shadows}
      receiveShadow={shadows}
    >
      {annotation && annotationMaterial && (
        <mesh
          ref={overlay}
          geometry={overlayGeometry}
          material={annotationMaterial}
          position={[0, 0, SHEET.depth / 2 + 0.0012]}
          visible={false}
        />
      )}
    </mesh>
  );
}
