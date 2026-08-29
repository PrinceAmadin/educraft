"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { MOTION, type ScenePalette } from "@/lib/scene/art-direction";
import { METADATA, type MetadataLine, type SceneState } from "@/lib/scene/composition";
import { createLabelCanvas } from "@/lib/scene/label";
import { clamp, damp, damp3, smoothstep } from "@/lib/scene/damp";
import { field } from "./useSceneInteraction";

interface SpatialMetadataProps {
  palette: ScenePalette;
  state: SceneState;
  spread: number;
}

interface Entry {
  key: string;
  owner: SceneState;
  line: MetadataLine;
  material: MeshBasicMaterial;
  ruleMaterial: MeshBasicMaterial;
  aspect: number;
}

/**
 * The foreground data layer.
 *
 * Every state's metadata exists in the scene at all times and is crossfaded by
 * opacity, which is both cheaper than building textures on a hover and — more
 * importantly — lets two sets overlap for a moment during the change. A hard
 * swap would read as a UI update. The overlap reads as a document system
 * revising its own header.
 *
 * These sit closest to the lens and therefore answer the pointer hardest. They
 * also respect depth: a line whose leader runs behind a sheet is occluded by
 * it, which is the cheapest and most convincing proof that this is one space
 * and not three layers of decoration.
 */
export function SpatialMetadata({ palette, state, spread }: SpatialMetadataProps) {
  const group = React.useRef<Group>(null);

  const geometry = React.useMemo(() => new PlaneGeometry(1, 1), []);
  const ruleGeometry = React.useMemo(() => new PlaneGeometry(1, 1), []);

  const entries = React.useMemo<Entry[]>(() => {
    const built: Entry[] = [];
    (Object.keys(METADATA) as SceneState[]).forEach((owner) => {
      METADATA[owner].forEach((line, i) => {
        const color = line.emphasis ? palette.accent : palette.meta;
        const { canvas, aspect } = createLabelCanvas(line.text, color, line.emphasis);
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        built.push({
          key: `${owner}-${i}`,
          owner,
          line,
          aspect,
          material: new MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          }),
          ruleMaterial: new MeshBasicMaterial({
            color: new Color(line.emphasis ? palette.accent : palette.meta),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          }),
        });
      });
    });
    return built;
  }, [palette.accent, palette.meta]);

  React.useEffect(
    () => () => {
      entries.forEach((entry) => {
        entry.material.map?.dispose();
        entry.material.dispose();
        entry.ruleMaterial.dispose();
      });
    },
    [entries],
  );

  React.useEffect(
    () => () => {
      geometry.dispose();
      ruleGeometry.dispose();
    },
    [geometry, ruleGeometry],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);

    // Metadata is the last thing to arrive and the first thing to leave.
    const arrival = smoothstep(0, 1, clamp((field.entrance - 0.55) / 0.45, 0, 1));
    const exit = 1 - smoothstep(0.05, 0.45, field.scroll);
    const visible = arrival * exit;

    for (const entry of entries) {
      const target = entry.owner === state ? visible : 0;
      const opacity = damp(entry.material.opacity, target, MOTION.meta, dt);
      entry.material.opacity = opacity;
      entry.ruleMaterial.opacity = opacity * 0.55;
    }

    const node = group.current;
    if (node) {
      // Lightest layer, strongest response — 1.6× what the front sheet does.
      damp3(
        node.position,
        -field.x * MOTION.pointerAmplitude * 1.6,
        -field.y * MOTION.pointerAmplitude * 0.9,
        0,
        MOTION.meta * 0.6,
        dt,
      );
    }
  });

  return (
    <group ref={group}>
      {entries.map((entry) => {
        const { line } = entry;
        const height = line.size;
        const width = height * entry.aspect;
        const x = line.position[0] * spread;
        const y = line.position[1] * spread;
        const z = line.position[2];

        return (
          <group key={entry.key} position={[x, y, z]}>
            {/* Counter-rotated a fraction of the composition's yaw: legible,
                without flattening into a HUD pasted over the scene. */}
            <group rotation={[0, 0.22, 0]}>
              <mesh
                geometry={geometry}
                material={entry.material}
                scale={[width, height, 1]}
                position={[width / 2, 0, 0]}
              />
              {line.leader > 0 && (
                <mesh
                  geometry={ruleGeometry}
                  material={entry.ruleMaterial}
                  scale={[line.leader, 0.0035, 1]}
                  position={[-line.leader / 2 - 0.03, 0, 0]}
                />
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
