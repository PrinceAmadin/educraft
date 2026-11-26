/**
 * Postgraduate reports: the one place the differences between an undergraduate project, a master's
 * dissertation and a PhD thesis are written down. Pure — no database, no docx, no Claude — so the
 * prompt loader, the document assembly, the quality gate, the intake forms and
 * `npm run check:degree-level` all share one definition.
 *
 * Founder's calls (26 Nov 2026):
 *  - Postgraduate work runs through the same orchestrator and chapter gate as an undergraduate
 *    report, with a stricter review: only Green trust-tier specialists may approve its chapters.
 *  - It is longer and deeper, "especially from chapter 2, 3 and 4", every chapter well referenced
 *    and measured against published standard results or percentage values.
 *  - A master's dissertation is 150-200 body pages; a PhD thesis 250-400.
 *  - A master's dissertation is priced at a flat ₦120,000; a PhD is quote-only.
 *
 * Six chapters are PhD only. NALT states it for law — "six in case of PhD thesis" — and it holds
 * everywhere: an undergraduate long essay and a master's dissertation both have five.
 */

/** The three levels, in the order a form offers them. Must match the Prisma `DegreeLevel` enum. */
export const DEGREE_LEVELS = ["UNDERGRADUATE", "MASTERS", "PHD"] as const;

export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export function isDegreeLevel(value: unknown): value is DegreeLevel {
  return typeof value === "string" && (DEGREE_LEVELS as readonly string[]).includes(value);
}

/** Anything above a first degree: the branch every stricter rule here hangs off. */
export function isPostgraduate(level: DegreeLevel): boolean {
  return level !== "UNDERGRADUATE";
}

// ─── Chapters ────────────────────────────────────────────────────────────────

/**
 * The most chapters a report of this level may have. Five everywhere except a PhD, which takes the
 * sixth chapter the prompt library was originally written for (`TEMPLATE_B_THEMATIC_CH5` and
 * `TEMPLATE_B_CONCLUSION` both exist in the Chapter 5 file; the five-chapter cap skips the first).
 */
export function maxChaptersFor(level: DegreeLevel): number {
  return level === "PHD" ? 6 : 5;
}

/** The chapter count a report of this level gets when the order does not say. */
export function defaultChaptersFor(level: DegreeLevel): number {
  return maxChaptersFor(level);
}

// ─── Wording ─────────────────────────────────────────────────────────────────

/**
 * What the document calls itself on its own preliminary pages: "This project", "This dissertation",
 * "This thesis". The undergraduate word is unchanged, so every existing report reads as before.
 */
export function workNoun(level: DegreeLevel): string {
  if (level === "MASTERS") return "dissertation";
  if (level === "PHD") return "thesis";
  return "project";
}

/** "A PROJECT SUBMITTED TO…", "A DISSERTATION SUBMITTED TO…". */
export function workNounUpper(level: DegreeLevel): string {
  return workNoun(level).toUpperCase();
}

/** For a screen or a dropdown. */
export function degreeLevelLabel(level: DegreeLevel): string {
  if (level === "MASTERS") return "Master's";
  if (level === "PHD") return "PhD";
  return "Undergraduate";
}

// ─── Length ──────────────────────────────────────────────────────────────────

/**
 * The body pages a report of this level aims at — the written chapters, not the bound document, so
 * preliminary pages, the instrument and appendices are all on top. Production targets, not
 * university regulations: the institution's own handbook always wins (founder, 26 Nov 2026).
 */
export function pageTargetFor(level: DegreeLevel): { min: number; max: number } {
  if (level === "MASTERS") return { min: 150, max: 200 };
  if (level === "PHD") return { min: 250, max: 400 };
  return { min: 60, max: 120 };
}

// ─── References ──────────────────────────────────────────────────────────────

/**
 * The fewest works the chapters must actually cite (ST12's floor). A full undergraduate report is
 * 35; postgraduate work carries its argument in its sources, so it is far higher.
 *
 * Known ceiling: the research step keeps at most `MAX_REFERENCES` (70) references, so the PhD floor
 * below is NOT satisfiable until that cap and the OpenAlex query budget rise. PhD is quote-only and
 * never self-serve, so this is a deliberate marker rather than a live refusal.
 */
export function referenceFloorFor(level: DegreeLevel, chapterBased = false): number {
  if (chapterBased) return 15;
  if (level === "MASTERS") return 60;
  if (level === "PHD") return 90;
  return 35;
}

// ─── Abstract ────────────────────────────────────────────────────────────────

/**
 * A postgraduate abstract is longer than an undergraduate one. The undergraduate band (240-320) and
 * the NALT law band (250-350) are unchanged and still decided by `abstractBand`, which calls this
 * only for postgraduate work.
 */
export function abstractBandFor(level: DegreeLevel): { min: number; max: number; targetLo: number; targetHi: number } | null {
  if (level === "MASTERS") return { min: 300, max: 400, targetLo: 320, targetHi: 370 };
  if (level === "PHD") return { min: 350, max: 500, targetLo: 380, targetHi: 450 };
  return null;
}

// ─── Which level an order is ─────────────────────────────────────────────────

/**
 * The service a client picks already says what level the work is, so the intake asks no extra
 * question: someone ordering a master's dissertation has told us by choosing it. Anything not
 * listed is undergraduate, which keeps every existing service exactly as it was.
 *
 * The admin New project form can still set the level by hand, which is how a PhD (quote-only, never
 * self-serve) and any mis-picked service are handled.
 */
const SERVICE_LEVEL: Record<string, DegreeLevel> = {
  THESIS: "MASTERS",
  "PHD-THESIS": "PHD",
};

export function degreeLevelForService(serviceCode: string | null | undefined): DegreeLevel {
  return SERVICE_LEVEL[(serviceCode ?? "").trim().toUpperCase()] ?? "UNDERGRADUATE";
}

/** The service codes that sell postgraduate work, for the catalogue checks. */
export const POSTGRADUATE_SERVICE_CODES = Object.keys(SERVICE_LEVEL);

// ─── Review ──────────────────────────────────────────────────────────────────

/**
 * Postgraduate chapters may only be approved by a specialist at the Green trust tier (founder's
 * "same pipeline, stricter review"). `deriveTrustTier` in src/lib/operations/trust-tier.ts computes
 * the tier; this says which tiers may sign off at this level.
 */
export function requiresGreenReviewer(level: DegreeLevel): boolean {
  return isPostgraduate(level);
}

// ─── Every sentence the system writes about a level ──────────────────────────

export const DEGREE_LEVEL_TEXT = {
  /** The intake's own question. */
  question: "What level is this work?",
  option: {
    UNDERGRADUATE: "Undergraduate — a first degree (B.Sc, B.Eng, LL.B and the like)",
    MASTERS: "Master's — an M.Sc, M.A, M.Eng, MBA or equivalent dissertation",
    PHD: "PhD — a doctoral thesis",
  } satisfies Record<DegreeLevel, string>,
  /** Shown beside the chapter-count field. */
  chapterLimit: (level: DegreeLevel) =>
    `A ${degreeLevelLabel(level).toLowerCase()} ${workNoun(level)} has ${maxChaptersFor(level)} chapters at most.`,
  /** Shown beside the page target. */
  pageTarget: (level: DegreeLevel) => {
    const { min, max } = pageTargetFor(level);
    return `${min}-${max} pages of written chapters. Your department's own requirement comes first.`;
  },
  /** Why a PhD is not on the price list. */
  phdQuoteOnly: "A doctoral thesis is quoted after we have seen the work; it is not a list price.",
  /** The postgraduate depth rule the chapter prompts receive. */
  benchmarking:
    "This is postgraduate work. Measure each finding against published standard values or percentages and cite the work you compare it with; a postgraduate result stated without a benchmark is not finished work.",
  /** The reviewer rule, for the chapter-approval screens. */
  greenReviewerOnly: "Postgraduate chapters are approved by a Green-tier specialist only.",
} as const;
