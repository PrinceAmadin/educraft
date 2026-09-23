import { CHAPTER_SERVICE_CODE, normalizeChapters } from "@/lib/chapter-pricing";

/**
 * What each service hands the client, and when the client may download each
 * piece. Pure: no database. Keyed by service code, not intake template,
 * because the chapter-based order and the combos share the FYP template.
 *
 * The founder's rule for full reports: Chapters 1 and 2 download once the
 * downpayment is verified; Chapter 3 onwards and the complete document need
 * the balance. A chapter-based order downloads nothing until its balance is
 * paid. Admins can change any item's access later (see files/policy.ts).
 */

export type DeliverableKindName = "CHAPTER" | "FINAL" | "OTHER";
export type DeliverableTier = "DOWNPAYMENT" | "BALANCE";

export interface DeliverableSpec {
  key: string;
  kind: DeliverableKindName;
  chapter: number | null;
  title: string;
  sortOrder: number;
  access: DeliverableTier;
}

export const DEFAULT_CHAPTER_COUNT = 5;
/** Chapters of a full report that unlock with the downpayment. */
export const EARLY_CHAPTERS = 2;

const FULL_REPORTS = new Set(["FYP-FULL", "THESIS"]);
const WITH_PROPOSAL = new Set(["COMBO-PR", "COMBO-PR-DA", "COMBO-PRDS", "COMBO-PFRS"]);
const WITH_SLIDES = new Set(["COMBO-RS", "COMBO-RS-DA", "COMBO-PRDS", "COMBO-PFRS"]);

export function chapterTitle(n: number): string {
  return `Chapter ${n}`;
}

function clampChapters(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n) || n < 1) return DEFAULT_CHAPTER_COUNT;
  return Math.min(Math.round(n), 12);
}

export function deliverableTemplate(input: {
  serviceCode: string;
  serviceName: string;
  chapterCount: number | null;
  /** Chapter-based orders: the chapters the client paid for. */
  chapters?: readonly number[] | null;
}): DeliverableSpec[] {
  const code = input.serviceCode.toUpperCase();
  const out: DeliverableSpec[] = [];
  const push = (spec: Omit<DeliverableSpec, "sortOrder">) => out.push({ ...spec, sortOrder: out.length });

  if (code === CHAPTER_SERVICE_CODE) {
    const chapters = normalizeChapters(input.chapters);
    if (chapters.length === 1) {
      // One chapter is the whole order: it is the item that goes through the quality check.
      push({ key: "final", kind: "FINAL", chapter: chapters[0], title: chapterTitle(chapters[0]), access: "BALANCE" });
      return out;
    }
    for (const c of chapters) {
      push({ key: `ch${c}`, kind: "CHAPTER", chapter: c, title: chapterTitle(c), access: "BALANCE" });
    }
    push({ key: "final", kind: "FINAL", chapter: null, title: "Complete document", access: "BALANCE" });
    return out;
  }

  if (FULL_REPORTS.has(code) || WITH_PROPOSAL.has(code) || WITH_SLIDES.has(code)) {
    if (WITH_PROPOSAL.has(code)) {
      push({ key: "proposal", kind: "OTHER", chapter: null, title: "Proposal", access: "DOWNPAYMENT" });
    }
    const count = clampChapters(input.chapterCount);
    for (let c = 1; c <= count; c++) {
      push({
        key: `ch${c}`,
        kind: "CHAPTER",
        chapter: c,
        title: chapterTitle(c),
        access: c <= EARLY_CHAPTERS ? "DOWNPAYMENT" : "BALANCE",
      });
    }
    push({ key: "final", kind: "FINAL", chapter: null, title: "Complete project", access: "BALANCE" });
    if (WITH_SLIDES.has(code)) {
      push({ key: "slides", kind: "OTHER", chapter: null, title: "Presentation slides", access: "BALANCE" });
    }
    return out;
  }

  if (code === "FYP-CH4") {
    push({ key: "final", kind: "FINAL", chapter: 4, title: chapterTitle(4), access: "BALANCE" });
    return out;
  }
  if (code === "FYP-PROP") {
    push({ key: "final", kind: "FINAL", chapter: null, title: "Proposal", access: "BALANCE" });
    return out;
  }
  if (code === "IT-PPT") {
    push({ key: "final", kind: "FINAL", chapter: null, title: "Report", access: "BALANCE" });
    push({ key: "slides", kind: "OTHER", chapter: null, title: "Presentation slides", access: "BALANCE" });
    return out;
  }

  push({ key: "final", kind: "FINAL", chapter: null, title: input.serviceName.trim() || "Your document", access: "BALANCE" });
  return out;
}

/** The chapters a chapter-based order was placed for, read from the intake data. */
export function orderedChapters(additionalData: unknown): number[] {
  if (!additionalData || typeof additionalData !== "object") return [];
  const raw = (additionalData as Record<string, unknown>).chapters;
  if (!Array.isArray(raw)) return [];
  return normalizeChapters(raw.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
}
