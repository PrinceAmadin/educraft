import type { PageKind } from "./paper";

/**
 * The spatial score for the document composition.
 *
 * Every service the studio sells reorganises the same seven sheets into a
 * different structure. Nothing is added, nothing is labelled — the geometry
 * carries the meaning:
 *
 *   projects       a chapter ladder, stepped in depth   → volume and structure
 *   reports        one tight document, references out   → a single bound thing
 *   presentations  a stepped sequence of small frames   → slides in order
 *   career         a single sheet, alone and forward    → one page about you
 *   editing        an overlapped pile, marks revealed   → work being corrected
 *   combos         three clusters held together         → a bundle
 *
 * Keeping this as pure data means the animation layer never branches on the
 * state — it interpolates towards whatever this returns, and adding a service
 * is a table entry rather than a new code path.
 */

export type SceneState =
  | "rest"
  | "projects"
  | "reports"
  | "presentations"
  | "career"
  | "editing"
  | "combos";

export interface SheetTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  opacity: number;
  /** Reviewer's marks on this sheet, 0–1. */
  marks: number;
  /**
   * How strongly this sheet answers the pointer. Sheets nearer the lens move
   * more, which is the entire parallax effect — see useSceneInteraction.
   */
  parallax: number;
}

/** Front to back. Index 0 is the sheet nearest the lens. */
export const SHEETS: PageKind[] = [
  "chapter",
  "figure",
  "table",
  "body",
  "abstract",
  "references",
  "title",
];

export const SHEET_COUNT = SHEETS.length;

/** Deterministic per-sheet jitter — a stack is never machine-perfect. */
const JITTER = [0.0, 0.31, -0.62, 0.44, -0.18, 0.73, -0.41];

function base(i: number, spread: number): SheetTransform {
  return {
    position: [0, 0, -i * 0.14 * spread],
    rotation: [0, 0, 0],
    scale: 1,
    opacity: 1,
    marks: 0,
    parallax: 1 - i * 0.1,
  };
}

/**
 * @param state   the composition to resolve
 * @param i       sheet index, 0 = front
 * @param spread  responsive compression. 1 on desktop, ~0.7 on small screens,
 *                where the same offsets would push sheets out of frame.
 */
export function layoutFor(state: SceneState, i: number, spread: number): SheetTransform {
  const t = base(i, spread);
  const j = JITTER[i % JITTER.length];

  switch (state) {
    /* A fanned stack on a desk. The resting state, and the one the eye reads
       as "a document" fastest — so it is what the page loads into. */
    case "rest": {
      t.position = [0.052 * i * spread, 0.03 * i * spread, -0.145 * i * spread];
      t.rotation = [0.008 * i, -0.021 * i, 0.017 * i + j * 0.006];
      t.parallax = 1 - i * 0.085;
      return t;
    }

    /* Final year projects — chapters as a ladder. Deep z steps so the stack
       gains visible volume: you are looking at the length of a project. */
    case "projects": {
      const step = Math.min(i, 4);
      t.position = [
        (-0.2 + step * 0.155) * spread,
        (0.42 - step * 0.235) * spread,
        -step * 0.42 * spread - (i > 4 ? 1.6 : 0),
      ];
      t.rotation = [0.13, -0.16 + step * 0.03, 0.012 * step + j * 0.004];
      t.scale = 1 - step * 0.012;
      t.opacity = i > 4 ? 0.18 : 1;
      t.parallax = 1.05 - step * 0.14;
      return t;
    }

    /* Reports and papers — one document, closed and aligned. The references
       sheet is the exception: it leaves the block, because citations are the
       part of this service people are actually buying. */
    case "reports": {
      const isReferences = SHEETS[i] === "references";
      if (isReferences) {
        t.position = [0.78 * spread, -0.12 * spread, 0.42];
        t.rotation = [0.02, -0.34, -0.035];
        t.scale = 0.94;
        t.parallax = 1.35;
        return t;
      }
      t.position = [0.012 * i * spread, 0.006 * i * spread, -0.055 * i * spread];
      t.rotation = [0, -0.004 * i, 0.003 * i + j * 0.002];
      t.parallax = 1 - i * 0.05;
      return t;
    }

    /* Presentations — a stepped sequence. Three across, two deep, each frame
       smaller and further back: a deck read in order rather than a pile. */
    case "presentations": {
      const col = i % 3;
      const row = Math.floor(i / 3);
      t.position = [
        (-0.62 + col * 0.62) * spread,
        (0.42 - row * 0.58) * spread,
        -row * 0.5 - col * 0.16,
      ];
      t.rotation = [0.05, -0.2 + col * 0.09, 0.004 * j];
      t.scale = 0.55 - row * 0.03;
      t.opacity = i > 5 ? 0.2 : 1;
      t.parallax = 1.1 - row * 0.25;
      return t;
    }

    /* CV and career — one sheet, forward and alone. The rest withdraw far
       enough that fog does the dimming for us. */
    case "career": {
      if (i === 0) {
        t.position = [0.06 * spread, 0.02, 0.72];
        t.rotation = [0.015, -0.05, 0.004];
        t.scale = 1.06;
        t.parallax = 1.3;
        return t;
      }
      t.position = [(0.02 * i + j * 0.05) * spread, -0.02 * i, -0.9 - i * 0.34];
      t.rotation = [0.01, -0.03 * i, 0.01 * i + j * 0.01];
      t.opacity = 0.42;
      t.parallax = 0.5 - i * 0.05;
      return t;
    }

    /* Editing and formatting — sheets pulled out of alignment and marked up.
       Two lift clear of the pile so the marks on them are legible. */
    case "editing": {
      const lifted = i === 1 || i === 3;
      t.position = [
        (j * 0.34 + (lifted ? 0.34 : 0)) * spread,
        (j * 0.18 + (lifted ? 0.1 : 0)) * spread,
        -i * 0.11 * spread + (lifted ? 0.28 : 0),
      ];
      t.rotation = [0.02 + j * 0.02, -0.06 + j * 0.05, j * 0.075];
      t.marks = 1;
      t.parallax = 1 - i * 0.07;
      return t;
    }

    /* Combos — three clusters, held in one field. Bundled, not merged. */
    case "combos": {
      const cluster = i < 3 ? 0 : i < 5 ? 1 : 2;
      const within = i - (cluster === 0 ? 0 : cluster === 1 ? 3 : 5);
      t.position = [
        (-0.66 + cluster * 0.66 + within * 0.045) * spread,
        (0.2 - cluster * 0.22 + within * 0.03) * spread,
        -cluster * 0.44 - within * 0.11,
      ];
      t.rotation = [0.04, -0.14 + cluster * 0.1, 0.02 * within + j * 0.01];
      t.scale = 0.74;
      t.parallax = 1.1 - cluster * 0.22;
      return t;
    }

    default:
      return t;
  }
}

/**
 * Metadata that belongs to each composition.
 *
 * Deliberately terse and deliberately dull: a folio, a reference number, a
 * status. It is the marginalia of a document control system, not a caption
 * explaining the picture to you — the moment it explains, it is a label, and
 * labels floating in 3D space are the cheapest trick in the medium.
 */
export interface MetadataLine {
  text: string;
  /** Position in the composition's local space. */
  position: [number, number, number];
  /** Leader rule drawn to the left of the text, in world units. 0 = none. */
  leader: number;
  /** Type size in world units. */
  size: number;
  emphasis?: boolean;
}

const REST_META: MetadataLine[] = [
  { text: "CHAPTER 04 / ANALYSIS", position: [-1.02, 0.52, 0.6], leader: 0.22, size: 0.052, emphasis: true },
  { text: "REF. 027", position: [-1.02, 0.38, 0.6], leader: 0.22, size: 0.046 },
  { text: "QUALITY REVIEW · PASSED", position: [0.34, -0.86, 0.5], leader: 0.16, size: 0.046 },
  { text: "2026", position: [1.02, 0.74, 0.34], leader: 0, size: 0.05 },
];

export const METADATA: Record<SceneState, MetadataLine[]> = {
  rest: REST_META,
  projects: [
    { text: "CHAPTERS 01 — 05", position: [-1.06, 0.6, 0.65], leader: 0.24, size: 0.052, emphasis: true },
    { text: "RESEARCH · ANALYSIS", position: [-1.06, 0.46, 0.65], leader: 0.24, size: 0.046 },
    { text: "REFERENCES 42", position: [0.52, -0.92, 0.5], leader: 0.16, size: 0.046 },
    { text: "DEFENCE READY", position: [1.0, 0.8, 0.3], leader: 0, size: 0.046 },
  ],
  reports: [
    { text: "SEMINAR REPORT", position: [-1.04, 0.54, 0.6], leader: 0.22, size: 0.052, emphasis: true },
    { text: "CITATIONS · APA 7", position: [-1.04, 0.4, 0.6], leader: 0.22, size: 0.046 },
    { text: "FORMAT · DEPT. STANDARD", position: [0.3, -0.88, 0.5], leader: 0.16, size: 0.046 },
  ],
  presentations: [
    { text: "DECK / 12 SLIDES", position: [-1.06, 0.72, 0.6], leader: 0.22, size: 0.052, emphasis: true },
    { text: "VISUAL HIERARCHY", position: [-1.06, 0.58, 0.6], leader: 0.22, size: 0.046 },
    { text: "SPEAKER NOTES", position: [0.62, -0.86, 0.45], leader: 0.16, size: 0.046 },
  ],
  career: [
    { text: "CURRICULUM VITAE", position: [-1.0, 0.5, 0.8], leader: 0.2, size: 0.052, emphasis: true },
    { text: "ONE PAGE", position: [-1.0, 0.36, 0.8], leader: 0.2, size: 0.046 },
    { text: "SHORTLIST READY", position: [0.46, -0.9, 0.6], leader: 0.16, size: 0.046 },
  ],
  editing: [
    { text: "REVIEW PASS 02", position: [-1.04, 0.56, 0.7], leader: 0.22, size: 0.052, emphasis: true },
    { text: "48 MARKS RESOLVED", position: [-1.04, 0.42, 0.7], leader: 0.22, size: 0.046 },
    { text: "PROOF · FORMAT · SUBMIT", position: [0.3, -0.9, 0.5], leader: 0.16, size: 0.046 },
  ],
  combos: [
    { text: "BUNDLE / 03 PARTS", position: [-1.06, 0.62, 0.6], leader: 0.22, size: 0.052, emphasis: true },
    { text: "PROPOSAL · REPORT · SLIDES", position: [-1.06, 0.48, 0.6], leader: 0.22, size: 0.044 },
    { text: "ONE DELIVERY", position: [0.56, -0.88, 0.45], leader: 0.16, size: 0.046 },
  ],
};

/** Group-level framing per state. The composition itself turns, not just its parts. */
export const FRAMING: Record<SceneState, { rotation: [number, number, number]; position: [number, number, number] }> = {
  rest: { rotation: [0.07, -0.36, 0.02], position: [0.06, -0.02, 0] },
  projects: { rotation: [0.02, -0.5, 0.01], position: [0.1, 0.0, -0.15] },
  reports: { rotation: [0.05, -0.26, 0.015], position: [0.0, -0.02, 0.1] },
  presentations: { rotation: [0.14, -0.34, 0.0], position: [0.08, 0.04, -0.1] },
  career: { rotation: [0.04, -0.22, 0.01], position: [-0.02, -0.02, -0.1] },
  editing: { rotation: [0.16, -0.4, 0.02], position: [0.04, 0.02, -0.05] },
  combos: { rotation: [0.09, -0.42, 0.01], position: [0.06, 0.0, -0.2] },
};
