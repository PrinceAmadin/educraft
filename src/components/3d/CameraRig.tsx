"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { CAMERA, MOTION } from "@/lib/scene/art-direction";
import { damp, smoothstep } from "@/lib/scene/damp";
import { field } from "./useSceneInteraction";

/**
 * The lens.
 *
 * Three rules, all of them restrictions:
 *
 *   — it never orbits. A camera on a turntable is the single clearest signal
 *     that a scene was added rather than composed;
 *   — it moves *against* the pointer, not with it. Push right and the camera
 *     slides left, so the composition appears to hold still while the space
 *     around it shifts. Following the pointer would make the object feel
 *     attached to the cursor, which is the opposite of depth;
 *   — it is the heaviest thing in the scene. Its damping rate is the lowest of
 *     any layer, so on any change it arrives last.
 *
 * Scroll adds a slow dolly back and a lift, handing the composition off as the
 * hero leaves rather than cutting it.
 */
export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera);
  const target = React.useRef(new Vector3(...CAMERA.target));

  React.useLayoutEffect(() => {
    camera.position.set(...CAMERA.position);
    camera.lookAt(target.current);
  }, [camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const scroll = smoothstep(0, 1, field.scroll);

    // The entrance pulls the lens in from slightly further out — the space
    // establishes before the document does.
    const settle = 1 - smoothstep(0, 1, Math.min(field.entrance / 0.7, 1));

    const px = reducedMotion ? 0 : -field.x * MOTION.cameraParallax;
    const py = reducedMotion ? 0 : -field.y * MOTION.cameraParallax * 0.55;

    camera.position.x = damp(camera.position.x, CAMERA.position[0] + px, MOTION.camera, dt);
    camera.position.y = damp(
      camera.position.y,
      CAMERA.position[1] + py + scroll * 0.55,
      MOTION.camera,
      dt,
    );
    camera.position.z = damp(
      camera.position.z,
      CAMERA.position[2] + scroll * 1.15 + settle * 0.9,
      MOTION.camera,
      dt,
    );

    // The aim point trails the pointer by a fraction of the camera's own move,
    // which produces a slight focal shift across the composition instead of a
    // rigid translation of the whole frame.
    target.current.x = damp(target.current.x, CAMERA.target[0] - px * 0.35, MOTION.camera, dt);
    target.current.y = damp(
      target.current.y,
      CAMERA.target[1] - py * 0.35 + scroll * 0.22,
      MOTION.camera,
      dt,
    );
    camera.lookAt(target.current);
  });

  return null;
}
