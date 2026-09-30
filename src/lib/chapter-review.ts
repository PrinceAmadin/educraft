/**
 * Chapter review (30 Sept 2026, founder's rule): a generated report's chapter
 * reaches a client, and the complete report, only as a file a person reviewed
 * and the COO approved.
 *
 *   AI writes the chapter -> the free automated checks run on it -> it is stored
 *   as the AI draft -> the specialist reviews it and uploads their version (.docx)
 *   -> the COO returns it with correction notes (the loop) or approves it.
 *
 * Approving is the chapter's "release" in the deliverables system (a release
 * number, the payment gate in files/policy.ts). The approved upload is the
 * chapter from then on: the complete report is built only from approved uploads,
 * read back into chapter text (assembly/read-chapter-docx.ts), never from the AI text.
 *
 * Pure: no database. The Documents tabs, the Report tab, the orchestrator and
 * `npm run check:chapter-review` all use these rules.
 */

export type ReviewVersionStatus = "SUBMITTED" | "RELEASED" | "RETURNED" | "SUPERSEDED";

export interface ReviewVersion {
  id: string;
  version: number;
  status: ReviewVersionStatus;
  /** WORKER, ADMIN, or SYSTEM for the AI draft. */
  submittedByRole: string;
  releaseNo: number | null;
  releasedAt: Date | string | null;
  createdAt: Date | string;
  fileName: string;
}

export interface ReviewDeliverable {
  kind: "CHAPTER" | "FINAL" | "OTHER";
  chapter: number | null;
  archived: boolean;
  /** The COO's notes on a chapter that is already approved. */
  changeNote: string | null;
  versions: ReviewVersion[];
}

export type ChapterReviewState =
  /** The AI has not finished the chapter yet: nothing to review. */
  | "WRITING"
  /** The AI draft is ready: the specialist reviews it and uploads their version. */
  | "DRAFT_READY"
  /** The COO returned the latest file with correction notes. */
  | "RETURNED"
  /** The specialist's upload waits for the COO. */
  | "AWAITING_APPROVAL"
  | "APPROVED"
  /** Approved, but the COO has since asked for changes. */
  | "CHANGES_REQUESTED"
  /** Approved, and a newer upload waits for the COO. */
  | "UPDATE_WAITING";

/** The AI draft: a version the system recorded on a chapter. */
export const isAiDraft = (v: Pick<ReviewVersion, "submittedByRole">) => v.submittedByRole === "SYSTEM";

const time = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);

/** The approved version: the chapter's latest release by a person (the canonical text). */
export function approvedVersion<V extends ReviewVersion>(versions: readonly V[]): V | null {
  let best: V | null = null;
  for (const v of versions) {
    if (v.releaseNo == null || isAiDraft(v)) continue;
    if (!best || v.releaseNo > (best.releaseNo ?? 0)) best = v;
  }
  return best;
}

/** The newest version a person uploaded (whatever became of it). */
export function latestHumanVersion<V extends ReviewVersion>(versions: readonly V[]): V | null {
  let best: V | null = null;
  for (const v of versions) if (!isAiDraft(v) && (!best || v.version > best.version)) best = v;
  return best;
}

/** The newest AI draft still in play (not replaced by a newer draft or an upload). */
export function currentAiDraft<V extends ReviewVersion>(versions: readonly V[]): V | null {
  let best: V | null = null;
  for (const v of versions) if (isAiDraft(v) && (!best || v.version > best.version)) best = v;
  return best;
}

export function chapterReviewState(d: ReviewDeliverable): ChapterReviewState {
  const approved = approvedVersion(d.versions);
  const human = latestHumanVersion(d.versions);
  if (approved) {
    if (human && human.version > approved.version) {
      if (human.status === "SUBMITTED") return "UPDATE_WAITING";
      if (human.status === "RETURNED") return "RETURNED";
    }
    return d.changeNote ? "CHANGES_REQUESTED" : "APPROVED";
  }
  if (human) {
    if (human.status === "SUBMITTED") return "AWAITING_APPROVAL";
    if (human.status === "RETURNED") return "RETURNED";
  }
  const draft = currentAiDraft(d.versions);
  if (draft?.status === "RETURNED") return "RETURNED";
  if (draft) return "DRAFT_READY";
  return "WRITING";
}

/** Approved with nothing outstanding: what the gate, the auto-submit and the orchestrator wait for. */
export function isSettled(state: ChapterReviewState): boolean {
  return state === "APPROVED";
}

/**
 * Chapter review applies to reports the pipeline writes (they have generation
 * runs). Projects written by hand keep the plain release flow.
 */
export function reviewApplies(p: { generationRuns: number }): boolean {
  return p.generationRuns > 0;
}

/** The chapter items that stand for the report's expected chapters (archived ones never count). */
export function chapterItems<D extends ReviewDeliverable>(deliverables: readonly D[], expected: readonly number[]): Map<number, D> {
  const out = new Map<number, D>();
  for (const d of deliverables) {
    if (d.kind !== "CHAPTER" || d.archived || d.chapter == null || !expected.includes(d.chapter)) continue;
    if (!out.has(d.chapter)) out.set(d.chapter, d);
  }
  return out;
}

export interface ReportReview {
  /** Per expected chapter. A chapter with no item is WRITING. */
  states: Map<number, ChapterReviewState>;
  /** Chapters with an approved version. */
  approved: number[];
  /** Chapters approved with nothing outstanding. */
  settled: number[];
  /** Chapters not yet settled, in order. */
  pending: number[];
  allSettled: boolean;
  allApproved: boolean;
  /** When each chapter's approved version was approved (for the gate's staleness). */
  approvedAt: Map<number, Date>;
  /** The approved version of each chapter: what a complete document is built from. */
  approvedVersionIds: Map<number, string>;
}

export function reportReview<D extends ReviewDeliverable>(deliverables: readonly D[], expected: readonly number[]): ReportReview {
  const items = chapterItems(deliverables, expected);
  const states = new Map<number, ChapterReviewState>();
  const approvedAt = new Map<number, Date>();
  const approvedVersionIds = new Map<number, string>();
  for (const n of expected) {
    const d = items.get(n);
    states.set(n, d ? chapterReviewState(d) : "WRITING");
    const a = d ? approvedVersion(d.versions) : null;
    if (a) {
      approvedVersionIds.set(n, a.id);
      approvedAt.set(n, new Date(time(a.releasedAt) || time(a.createdAt)));
    }
  }
  const approved = expected.filter((n) => approvedVersionIds.has(n));
  const settled = expected.filter((n) => isSettled(states.get(n) ?? "WRITING"));
  return {
    states,
    approved,
    settled,
    pending: expected.filter((n) => !settled.includes(n)),
    allSettled: expected.length > 0 && settled.length === expected.length,
    allApproved: expected.length > 0 && approved.length === expected.length,
    approvedAt,
    approvedVersionIds,
  };
}

/**
 * A complete document built from approved chapters is stale when any chapter's
 * approved version is no longer the one it was built from. A complete document
 * with no record (uploaded by hand, or built before chapter review) is not judged.
 */
export function builtFromIsStale(builtFrom: unknown, current: ReadonlyMap<number, string>): number[] {
  if (!builtFrom || typeof builtFrom !== "object") return [];
  const recorded = builtFrom as Record<string, unknown>;
  const stale: number[] = [];
  for (const [n, id] of current) if (recorded[String(n)] !== id) stale.push(n);
  for (const key of Object.keys(recorded)) if (!current.has(Number(key))) stale.push(Number(key));
  return [...new Set(stale)].sort((a, b) => a - b);
}

export const builtFromRecord = (ids: ReadonlyMap<number, string>): Record<string, string> => Object.fromEntries([...ids].map(([n, id]) => [String(n), id]));

// ─── Approving ───────────────────────────────────────────────────────────────

export interface ApprovalFacts {
  version: Pick<ReviewVersion, "status" | "submittedByRole" | "fileName">;
  projectStatus: string;
  /** From the read-back; null when the file has not been read yet. */
  readback: { blocking: string[]; placeholders: string[]; hash: string } | null;
  /** The read-back the COO was looking at, when the screen sent it. */
  seenHash?: string | null;
  /**
   * Chapter gate (30 Sept 2026): the chapter check of this upload's text; null = not run yet. Left out
   * (undefined) where the gate does not apply.
   */
  check?: { status: "RUNNING" | "PASSED" | "FAILED" | "ERROR"; lines: string[] } | null;
  /** The founder approves a failed check anyway, with a written reason. */
  override?: boolean;
}

/** Why the COO cannot approve this version (empty = they can). */
export function approvalRefusals(f: ApprovalFacts): string[] {
  const t = CHAPTER_REVIEW_TEXT.refuse;
  if (isAiDraft(f.version)) return [t.aiDraft];
  if (f.version.status !== "SUBMITTED") return [t.notWaiting];
  const out: string[] = [];
  if (f.projectStatus === "SUBMITTED" || f.projectStatus === "IN_QA_REVIEW") out.push(t.inQa);
  if (!isWordFile(f.version.fileName)) out.push(t.notWord);
  else if (!f.readback) out.push(t.notRead);
  else {
    out.push(...f.readback.blocking);
    if (f.readback.placeholders.length) out.push(t.placeholders(f.readback.placeholders));
    if (f.seenHash && f.seenHash !== f.readback.hash) out.push(t.changed);
    // Only a file read back cleanly is checked; the check must have passed (or the founder overrides a failure).
    if (f.readback.blocking.length === 0 && f.check !== undefined) {
      const c = CHAPTER_REVIEW_TEXT.check.refuse;
      if (f.check === null) out.push(c.notChecked);
      else if (f.check.status === "RUNNING") out.push(c.running);
      else if (f.check.status === "ERROR") out.push(c.error);
      else if (f.check.status === "FAILED" && !f.override) out.push(c.failed(f.check.lines));
    }
  }
  return out;
}

export const isWordFile = (fileName: string) => /\.docx$/i.test(fileName.trim());

// ─── Wording (staff and specialists only; nothing here reaches a client) ─────

const LIST = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
/** "Chapter 3", "Chapters 3 and 5". */
const CHAPTERS = (ns: readonly number[]) => `${ns.length === 1 ? "Chapter" : "Chapters"} ${LIST(ns.map(String))}`;

export const CHAPTER_REVIEW_TEXT = {
  state: {
    WRITING: "Being written",
    DRAFT_READY: "AI draft ready",
    RETURNED: "Returned with notes",
    AWAITING_APPROVAL: "Waiting for approval",
    APPROVED: "Approved",
    CHANGES_REQUESTED: "Changes requested",
    UPDATE_WAITING: "Update waiting",
  } satisfies Record<ChapterReviewState, string>,
  /** What the specialist reads under the chapter. */
  specialistLine: {
    WRITING: "The AI is still writing this chapter.",
    DRAFT_READY: "Download the AI draft, review and correct it in Word, then upload your version (.docx).",
    RETURNED: "The COO returned it with correction notes. Upload your corrected version (.docx).",
    AWAITING_APPROVAL: "Your version is waiting for the COO's approval.",
    APPROVED: "Approved by the COO.",
    CHANGES_REQUESTED: "The COO asked for changes to the approved chapter. Upload your corrected version (.docx).",
    UPDATE_WAITING: "Your update is waiting for the COO's approval. The approved version stays in use until then.",
  } satisfies Record<ChapterReviewState, string>,
  /** What the founder or the COO reads under the chapter. */
  staffLine: {
    WRITING: "The AI is still writing this chapter.",
    DRAFT_READY: "The AI draft is with the specialist for review.",
    RETURNED: "Returned to the specialist with your notes.",
    AWAITING_APPROVAL: "The specialist's version is ready for your approval.",
    APPROVED: "Approved. This is the chapter the complete report is built from.",
    CHANGES_REQUESTED: "Approved, with your requested changes outstanding. The approved version stays in use until you approve the correction.",
    UPDATE_WAITING: "Approved, and the specialist uploaded an update for your approval.",
  } satisfies Record<ChapterReviewState, string>,
  refuse: {
    aiDraft: "This is the AI draft. The specialist reviews it and uploads their own version; that upload is what you approve.",
    notWaiting: "Only an upload that is waiting for review can be approved.",
    inQa: "The complete report is with QA. Recall it, or wait for the QA decision, before approving a chapter: approving now would change the report QA is reviewing.",
    notWord: "Chapters are approved as Word files (.docx), so that the complete report can be built from them. Ask the specialist for the .docx.",
    notRead: "The file has not been read yet. Refresh in a moment.",
    placeholders: (items: readonly string[]) => `Blanks are still to be filled in: ${LIST(items.slice(0, 8))}${items.length > 8 ? ` and ${items.length - 8} more` : ""}.`,
    changed: "The file was read again since you looked at it. Refresh and check the summary before approving.",
  },
  approveConfirm: (chapter: number, clientSees: boolean) =>
    `Approve Chapter ${chapter}? ${clientSees ? "The client can download it straight away." : "It is not shown to the client on its own; it goes into the complete report."} The complete report is built from this file.`,
  returnHint: "Say what needs to change. The specialist reads these notes and uploads a corrected version.",
  changesHint: "The approved chapter stays in use until you approve the corrected version.",
  finalBuilt: "Built from the approved chapters.",
  finalStale: (chapters: readonly number[]) =>
    `This complete document was built before ${CHAPTERS(chapters)} ${chapters.length === 1 ? "was" : "were"} approved again. Rebuild it from the approved chapters before releasing it.`,
  finalByHandRefused: "The complete project is built from the approved chapters. Upload each chapter for approval instead.",
  humanVersionExists: (chapter: number) =>
    `Chapter ${chapter} has been reviewed by the specialist, so it is not written again by the AI: that would discard their work. Return it to the specialist with the notes instead.`,
  notAllApproved: (pending: readonly number[]) => `The complete report is built from the approved chapters. Still to approve: ${CHAPTERS(pending)}.`,
  /** Chapter gate (30 Sept 2026): every chapter is checked on its own before it is downloaded or approved. */
  check: {
    chip: { RUNNING: "Being checked", PASSED: "Check passed", FAILED: "Check failed", ERROR: "Check did not run", NONE: "Not checked yet" },
    passedNote: (passed: number, applicable: number) => `Quality check passed: ${passed} of ${applicable} checks that apply to this chapter.`,
    failedNote: (rewrites: number) =>
      `Quality check: this chapter did not pass${rewrites ? ` after ${rewrites} rewrite${rewrites === 1 ? "" : "s"}` : ""}. Fix these before you upload your version:`,
    uncheckedNote: "The quality check could not run on this chapter. Read it through with care; the COO has been told.",
    warningsIntro: "Also look at:",
    beingChecked: (chapter: number) => `Chapter ${chapter} is written and is being checked before it comes to you.`,
    beingRewritten: (chapter: number) => `Chapter ${chapter} did not pass its check and is being written again.`,
    staffChecking: (chapter: number) => `Chapter ${chapter} is written and is being checked. The specialist gets the draft once it passes (or after two rewrites).`,
    uploadChecking: "Your version is being checked. It goes to the COO for approval once it passes.",
    uploadFailed: "Your version did not pass the chapter's quality check. Fix these and upload it again:",
    uploadPassed: (passed: number, applicable: number) => `Your version passed the quality check (${passed} of ${applicable}). It is waiting for the COO's approval.`,
    uploadPassedMessage: (code: string, chapter: number, passed: number, applicable: number) =>
      `${code}: the specialist's Chapter ${chapter} passed its quality check (${passed} of ${applicable}) and is ready for your approval.`,
    uploadFailedMessage: (code: string, chapter: number, failures: number) =>
      `${code}: your Chapter ${chapter} did not pass its quality check (${failures} point${failures === 1 ? "" : "s"} to fix). The details are on the Documents tab; upload the corrected version.`,
    draftFailedTitle: (code: string, chapter: number) => `${code}: Chapter ${chapter} went to the specialist without passing its check`,
    draftFailedMessage: (code: string, chapter: number, why: string) => `${code}: Chapter ${chapter} ${why} Its failures are listed on the draft for the specialist to fix.`,
    whyFailed: (rewrites: number) => (rewrites ? `still failed its quality check after ${rewrites} rewrite${rewrites === 1 ? "" : "s"}.` : "failed its quality check and could not be rewritten."),
    whyUnchecked: "could not be checked (the check failed to run three times).",
    refuse: {
      notChecked: "This version has not been checked yet. Refresh in a minute.",
      running: "The chapter's quality check is still running. Refresh in a minute.",
      error: "The chapter's quality check could not run. Press Check again.",
      failed: (lines: readonly string[]) =>
        `This version did not pass the chapter's quality check${lines.length ? `: ${lines.slice(0, 3).join(" ")}${lines.length > 3 ? ` (and ${lines.length - 3} more)` : ""}` : ""}. Return it to the specialist with these points.`,
      overrideNeedsReason: "Say why this chapter may be approved without passing its check.",
      overrideFounderOnly: "Only the founder can approve a chapter that did not pass its check.",
    },
    overrideHint: "Approve anyway: say why this chapter may be approved without passing its check. The reason is kept with the chapter.",
    formattedCopy: "Formatted copy",
    specialistFile: "Specialist's file",
  },
} as const;
