"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";
import { MOTION, SHEET, type ScenePalette } from "@/lib/scene/art-direction";
import { FRAMING, SHEETS } from "@/lib/scene/composition";
import { damp, dampE, damp3, smoothstep } from "@/lib/scene/damp";
import { useSceneStore } from "@/lib/scene/store";
import { DocumentLayer } from "./DocumentLayer";
import { SpatialMetadata } from "./SpatialMetadata";
import { usePageTextures } from "./usePageTextures";
import { field } from "./useSceneInteraction";

interface AcademicDocumentsProps {
  palette: ScenePalette;
  resolution: number;
  sheets: number;
  spread: number;
  shadows: boolean;
  reducedMotion: boolean;
  /** Where the composition sits relative to the lens axis. */
  anchorX: number;
}

/**
 * The primary document structure.
 *
 * This component owns the shared GPU resources — one geometry for every sheet,
 * one edge material, one verso material — and the framing of the composition
 * as a whole. Everything below it owns only its own motion.
 *
 * The group carries two things the individual sheets must not: the framing per
 * service (the whole composition turns to present itself differently), and the
 * scroll response (it lifts and tips towards a plan view as the hero leaves).
 * Keeping those here is what stops the sheets from having to know anything
 * about the page they are sitting in.
 */
export function AcademicDocuments({
  palette,
  resolution,
  sheets,
  spread,
  shadows,
  reducedMotion,
  anchorX,
}: AcademicDocumentsProps) {
  const group = React.useRef<Group>(null);
  const state = useSceneStore((s) => s.state);
  const setReady = useSceneStore((s) => s.setReady);
  const { pages, annotation } = usePageTextures(palette, resolution, sheets);

  const geometry = React.useMemo(
    () => new BoxGeometry(SHEET.width, SHEET.height, SHEET.depth),
    [],
  );
  const overlayGeometry = React.useMemo(
    () => new PlaneGeometry(SHEET.width, SHEET.height),
    [],
  );

  const edge = React.useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color(palette.paperEdge),
        roughness: 0.78,
        metalness: 0,
      }),
    [palette.paperEdge],
  );

  const back = React.useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color(palette.paper).multiplyScalar(0.88),
        roughness: 0.95,
        metalness: 0,
      }),
    [palette.paper],
  );

  const faces = React.useMemo(
    () =>
      pages.map(
        (map) =>
          new MeshStandardMaterial({
            map,
            roughness: 0.92,
            metalness: 0,
            // Always transparent: states that withdraw a sheet fade it, and
            // toggling the flag at runtime would recompile the shader mid-move.
            transparent: true,
            opacity: 0,
          }),
      ),
    [pages],
  );

  // One material per sheet even though they share a texture — each sheet damps
  // its own arrival, and a shared material would have seven writers.
  const annotationMaterials = React.useMemo(
    () =>
      annotation
        ? pages.map(
            () =>
              new MeshStandardMaterial({
                map: annotation,
                transparent: true,
                opacity: 0,
                roughness: 1,
                metalness: 0,
                depthWrite: false,
                side: DoubleSide,
              }),
          )
        : [],
    [annotation, pages],
  );

  React.useEffect(() => {
    if (pages.length) setReady(true);
  }, [pages.length, setReady]);

  React.useEffect(
    () => () => {
      geometry.dispose();
      overlayGeometry.dispose();
    },
    [geometry, overlayGeometry],
  );
  React.useEffect(() => () => void edge.dispose(), [edge]);
  React.useEffect(() => () => void back.dispose(), [back]);
  React.useEffect(() => () => faces.forEach((m) => m.dispose()), [faces]);
  React.useEffect(
    () => () => annotationMaterials.forEach((m) => m.dispose()),
    [annotationMaterials],
  );

  const framing = FRAMING[state];

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    const dt = Math.min(delta, 1 / 20);

    // Scroll tips the composition towards a plan view and lets it rise out of
    // frame — the document is handed over as the page moves on.
    const scroll = smoothstep(0, 1, field.scroll);

    damp3(
      node.position,
      anchorX + framing.position[0],
      framing.position[1] + scroll * 0.5,
      framing.position[2] - scroll * 0.9,
      MOTION.sheet * 0.8,
      dt,
    );

    dampE(
      node.rotation,
      framing.rotation[0] + scroll * 0.42,
      framing.rotation[1] - scroll * 0.12,
      framing.rotation[2],
      MOTION.sheet * 0.8,
      dt,
    );

    const scale = damp(node.scale.x, 1 - scroll * 0.06, MOTION.sheet, dt);
    node.scale.setScalar(scale);
  });

  return (
    <group ref={group}>
      {faces.map((face, i) => (
        <DocumentLayer
          key={SHEETS[i]}
          index={i}
          state={state}
          spread={spread}
          reducedMotion={reducedMotion}
          shadows={shadows}
          geometry={geometry}
          overlayGeometry={overlayGeometry}
          face={face}
          edge={edge}
          back={back}
          annotation={annotation}
          annotationMaterial={annotationMaterials[i] ?? null}
        />
      ))}

      <SpatialMetadata palette={palette} state={state} spread={spread} />
    </group>
  );
}
