/**
 * Art direction for the WebGL layer.
 *
 * Every value the scene renders with lives here. The scene modules read this
 * file and nothing else for colour, camera framing and motion timing, so the
 * look can be re-tuned in one place instead of hunting through components.
 *
 * Colours are mirrored from the CSS custom properties in globals.css. They are
 * duplicated as hex rather than read from the DOM because WebGL needs linear
 * colour at material-construction time, and reading computed styles per frame
 * would be both slow and racy during theme transitions.
 */

export type ThemeKey = "dark" | "light";

export interface ScenePalette {
  /** Matches the page background — used for fog so the canvas edge disappears. */
  ground: string;
  /** Paper stock. Warm bone, never pure white: pure white blows out under the key. */
  paper: string;
  /** Paper edge — the 0.4mm rim that catches the key light. */
  paperEdge: string;
  /** Body type on paper. */
  ink: string;
  /** Muted type — captions, running heads. */
  inkMuted: string;
  /** Ruled lines, table rules, figure frames. */
  rule: string;
  /** The single accent permitted on paper: annotation marks and section flags. */
  accent: string;
  /** Restrained teal contribution — rim light only. */
  rim: string;
  /** Key light. Slightly warm so paper reads as paper. */
  key: string;
  /** Ambient bounce. */
  fill: string;
  /** Atmospheric layer behind the composition. */
  atmosphere: string;
  /** Spatial metadata typography. */
  meta: string;
  /** Far archive plane. */
  archive: string;
}

export const PALETTE: Record<ThemeKey, ScenePalette> = {
  dark: {
    ground: "#0a101d",
    paper: "#f4efe6",
    paperEdge: "#cfc7b8",
    ink: "#1a2030",
    inkMuted: "#6b7385",
    rule: "#c2bcb0",
    accent: "#b8722a",
    rim: "#2bbfae",
    key: "#fff6e8",
    fill: "#3d4c66",
    atmosphere: "#101a2c",
    meta: "#8fa3b8",
    archive: "#25334a",
  },
  light: {
    ground: "#f7f4ee",
    paper: "#ffffff",
    paperEdge: "#ded7c9",
    ink: "#141a28",
    inkMuted: "#6d7484",
    rule: "#cfcabf",
    accent: "#9d5512",
    rim: "#0e8c7d",
    key: "#fffaf2",
    fill: "#b9bfcc",
    atmosphere: "#e8e3d8",
    meta: "#7b8494",
    archive: "#c8c2b4",
  },
};

/**
 * Camera. A long-ish lens (35mm equivalent ≈ 38°) keeps the sheets from
 * skewing at the frame edge — wide angles make flat planes look like a
 * perspective exercise rather than an object on a desk.
 */
export const CAMERA = {
  fov: 34,
  near: 0.1,
  far: 30,
  /** Resting position. Slightly above and right of the composition. */
  position: [0.35, 0.28, 5.4] as const,
  /** What the lens is pointed at when the pointer is centred. */
  target: [0, -0.02, 0] as const,
};

/**
 * Motion tokens. `lambda` values feed exponential damping (see damp.ts) and are
 * expressed as "how fast this catches up", not as durations — the scene is
 * continuous, so nothing here has a start or an end.
 *
 * Lower = heavier. The hierarchy is deliberate: the camera is the heaviest
 * object in the scene, metadata is the lightest, and the document structure
 * sits between them. That difference is what produces parallax on a state
 * change rather than everything sliding as one rigid card.
 */
export const MOTION = {
  camera: 1.6,
  cameraScroll: 2.4,
  /** Sheet transforms on a service change. */
  sheet: 2.6,
  /** Per-sheet stagger, seconds. Reading order, front to back. */
  sheetStagger: 0.045,
  /** Metadata crossfade. */
  meta: 4.5,
  /** Atmospheric layer — almost imperceptible. */
  atmosphere: 0.8,
  /** Pointer field. Damped twice: raw → smooth → per-layer depth response. */
  pointer: 3.2,
  /** Maximum pointer excursion in world units, at the primary document plane. */
  pointerAmplitude: 0.16,
  /** Camera counter-move. Negative of pointer: the scene shifts against you. */
  cameraParallax: 0.22,
} as const;

/**
 * Sheet proportions. ISO 216 (1:√2) because that is what an academic document
 * is actually printed on, and the ratio is doing real work here — the eye
 * recognises the shape before it reads anything on it.
 */
export const SHEET = {
  width: 1,
  height: 1.4142,
  /** 80gsm at this scale. Thin enough to be a sheet, thick enough to catch light. */
  depth: 0.006,
} as const;
