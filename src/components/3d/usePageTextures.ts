"use client";

import * as React from "react";
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from "three";
import { useThree } from "@react-three/fiber";
import { createAnnotationCanvas, createPageCanvas } from "@/lib/scene/paper";
import { SHEETS } from "@/lib/scene/composition";
import type { ScenePalette } from "@/lib/scene/art-direction";

interface PageTextures {
  pages: Texture[];
  annotation: Texture | null;
}

/**
 * Typesets the sheets and uploads them.
 *
 * Two details carry the quality here. The first is the wait on
 * `document.fonts.ready`: the pages are drawn with the same families the page
 * uses, and typesetting before they load bakes a fallback font into a texture
 * that never re-renders. The second is anisotropy — the sheets are viewed at a
 * steep angle, and without it the body copy turns to mush two thirds of the way
 * up every page.
 */
export function usePageTextures(
  palette: ScenePalette,
  resolution: number,
  count: number,
): PageTextures {
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const [textures, setTextures] = React.useState<PageTextures>({ pages: [], annotation: null });

  React.useEffect(() => {
    let cancelled = false;
    const built: Texture[] = [];
    let annotation: Texture | null = null;

    const prepare = (canvas: HTMLCanvasElement) => {
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = Math.min(8, maxAnisotropy);
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return texture;
    };

    const build = () => {
      if (cancelled) return;
      for (let i = 0; i < count; i += 1) {
        built.push(prepare(createPageCanvas(SHEETS[i], palette, resolution)));
      }
      annotation = prepare(createAnnotationCanvas(palette, Math.min(resolution, 704)));
      if (cancelled) {
        built.forEach((t) => t.dispose());
        annotation.dispose();
        return;
      }
      setTextures({ pages: built, annotation });
    };

    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (fonts?.ready) fonts.ready.then(build).catch(build);
    else build();

    return () => {
      cancelled = true;
    };
  }, [palette, resolution, count, maxAnisotropy]);

  // Disposal is keyed on the set itself, not on the inputs that produced it:
  // React has already swapped in the replacement by the time this runs, so the
  // old textures are never released while a mesh is still pointing at them.
  React.useEffect(
    () => () => {
      textures.pages.forEach((t) => t.dispose());
      textures.annotation?.dispose();
    },
    [textures],
  );

  return textures;
}
