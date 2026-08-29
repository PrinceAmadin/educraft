"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Group, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";
import { MOTION, type ScenePalette } from "@/lib/scene/art-direction";
import { damp, damp3 } from "@/lib/scene/damp";
import { field } from "./useSceneInteraction";

const COLUMNS = 9;
const ROWS = 5;
const COUNT = COLUMNS * ROWS;

/**
 * The archive the document came from.
 *
 * A strict grid of small sheets, far behind the composition and near the floor
 * of the fog. It is the deepest spatial layer and it is deliberately the most
 * ordered thing in the scene: an even grid reads as a catalogue, whereas the
 * same objects scattered would read as debris — which is exactly the reflex
 * this scene is avoiding.
 *
 * One draw call, and the instance matrices are written once. Only the group
 * moves, at a third of the pointer response the front sheets get, which is
 * what places it behind them.
 */
export function ArchiveField({ palette }: { palette: ScenePalette }) {
  const group = React.useRef<Group>(null);
  const mesh = React.useRef<InstancedMesh>(null);

  const geometry = React.useMemo(() => new PlaneGeometry(0.17, 0.24), []);
  const material = React.useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(palette.archive),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [palette.archive],
  );

  React.useEffect(() => () => void geometry.dispose(), [geometry]);
  React.useEffect(() => () => void material.dispose(), [material]);

  React.useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const dummy = new Object3D();
    const tint = new Color();
    const base = new Color(palette.archive);

    for (let i = 0; i < COUNT; i += 1) {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      dummy.position.set(
        (col - (COLUMNS - 1) / 2) * 0.42,
        (row - (ROWS - 1) / 2) * 0.4,
        // A shallow depth step per row keeps the grid from reading as wallpaper.
        -row * 0.11,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);

      // Brightness falls towards the edges of the field so it dissolves rather
      // than stopping at a hard rectangle.
      const edge =
        1 -
        Math.max(
          Math.abs(col - (COLUMNS - 1) / 2) / ((COLUMNS - 1) / 2),
          Math.abs(row - (ROWS - 1) / 2) / ((ROWS - 1) / 2),
        ) *
          0.75;
      tint.copy(base).multiplyScalar(0.55 + edge * 0.7);
      node.setColorAt(i, tint);
    }

    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  }, [palette.archive]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const node = group.current;
    if (!node) return;

    damp3(
      node.position,
      -1.15 - field.x * MOTION.pointerAmplitude * 0.3,
      0.1 - field.y * MOTION.pointerAmplitude * 0.18 + field.scroll * 0.3,
      -3.4,
      MOTION.atmosphere * 2,
      dt,
    );

    // Arrives with the atmosphere, before the document — the room exists first.
    const arrival = Math.min(field.entrance / 0.45, 1);
    material.opacity = damp(material.opacity, 0.5 * arrival * (1 - field.scroll * 0.8), 1.2, dt);
  });

  return (
    <group ref={group} position={[-1.15, 0.1, -3.4]}>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, COUNT]}
        frustumCulled={false}
      />
    </group>
  );
}
