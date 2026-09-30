import { CHAPTER_SERVICE_CODE, normalizeChapters } from "@/lib/chapter-pricing";

/**
 * What each service hands the client, and when the client may download each
 * piece. Pure: no database. Keyed by service code, not intake template,
 * because the chapter-based order and the combos share the FYP template.
 *
 * The founder's rule for full reports (30 Sept 2026): Chapters 1 and 2
 * download once approved and the downpayment is verified; Chapter 3 onwards
 * never download on their own (they come in the complete project), and the
 * complete document needs 100% payment. A chapter-based order downloads nothing
 * until its balance is paid. Only the super admin can release an item early
 * (see files/policy.ts).
 */

export type DeliverableKindName = "CHAPTER" | "FINAL" | "OTHER";
export type DeliverableTier = "DOWNPAYMENT" | "BALANCE" | "WITH_COMPLETE";

export interface DeliverableSpec {
  key: string;
  kind: DeliverableKindName;
  chapter: number | null;
  title: string;
  sortOrder: number;
  access: DeliverableTier;
  /** Reviewed like any chapter but never listed for the client. */
  clientHidden?: boolean;
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

/** Every report has five chapters at most, in every department (founder, 26 Sept 2026). */
export const MAX_REPORT_CHAPTERS = 5;
export const CHAPTER_LIMIT_MESSAGE = `A report has ${MAX_REPORT_CHAPTERS} chapters at most.`;

function clampChapters(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n) || n < 1) return DEFAULT_CHAPTER_COUNT;
  return Math.min(Math.round(n), MAX_REPORT_CHAPTERS);
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
      // Chapter 1 alone is written by the report pipeline, so it also gets a chapter item for the
      // COO's approval (hidden from the client, who receives it as the complete document).
      if (chapters[0] === 1) push({ key: "ch1", kind: "CHAPTER", chapter: 1, title: chapterTitle(1), access: "BALANCE", clientHidden: true });
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
        access: c <= EARLY_CHAPTERS ? "DOWNPAYMENT" : "WITH_COMPLETE",
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

/**
 * The chapters a report project has, in order: the ones ordered (a
 * chapter-based order), Chapter 4 alone (FYP-CH4), else 1 to its chapter
 * count. One rule for the chapter orchestrator, the progress dashboard, the
 * queue and the assembly, so they can never disagree about an order such as
 * "Chapters 2 and 4".
 */
export function expectedChapters(p: { serviceCode: string | null | undefined; additionalData: unknown; chapterCount: number | null | undefined }): number[] {
  const code = (p.serviceCode ?? "").toUpperCase();
  if (code === CHAPTER_SERVICE_CODE) {
    const ordered = orderedChapters(p.additionalData);
    if (ordered.length > 0) return ordered;
  }
  if (code === "FYP-CH4") return [4];
  const count = Math.min(MAX_REPORT_CHAPTERS, Math.max(1, Math.round(p.chapterCount ?? MAX_REPORT_CHAPTERS)));
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** True when the chapters are 1, 2, … N with no gap: the only orders the orchestrator writes on its own. */
export function runsFromChapterOne(chapters: readonly number[]): boolean {
  return chapters.length > 0 && chapters.every((n, i) => n === i + 1);
}
