/**
 * Chapter review's rules (src/lib/chapter-review.ts), with no database:
 * where a chapter stands as the AI draft, the specialist's upload and the COO's
 * approval come and go; what the report is built from; when approval is refused;
 * when a complete document is out of date.
 *
 *   npm run check:chapter-review
 */

import {
  approvalRefusals,
  approvedVersion,
  builtFromIsStale,
  builtFromRecord,
  CHAPTER_REVIEW_TEXT,
  chapterItems,
  chapterReviewState,
  currentAiDraft,
  isSettled,
  isWordFile,
  latestHumanVersion,
  reportReview,
  reviewApplies,
  type ReviewDeliverable,
  type ReviewVersion,
} from "../src/lib/chapter-review";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let n = 0;
const v = (over: Partial<ReviewVersion>): ReviewVersion => {
  n++;
  return { id: `v${n}`, version: n, status: "SUBMITTED", submittedByRole: "WORKER", releaseNo: null, releasedAt: null, createdAt: new Date(2026, 8, 30, 9, n), fileName: "Chapter.docx", ...over };
};
const item = (chapter: number, versions: ReviewVersion[], changeNote: string | null = null, archived = false): ReviewDeliverable => ({ kind: "CHAPTER", chapter, archived, changeNote, versions });

// ── One chapter's life ──
const draft = v({ submittedByRole: "SYSTEM", fileName: "Chapter 2 (AI draft).docx" });
check("no version: being written", chapterReviewState(item(2, [])) === "WRITING");
check("the AI draft: ready for the specialist", chapterReviewState(item(2, [draft])) === "DRAFT_READY");
check("the COO's notes on the AI draft: returned", chapterReviewState(item(2, [{ ...draft, status: "RETURNED" }])) === "RETURNED");
const upload = v({});
check("the specialist's upload: waiting for approval", chapterReviewState(item(2, [{ ...draft, status: "SUPERSEDED" }, upload])) === "AWAITING_APPROVAL");
check("returned with notes", chapterReviewState(item(2, [{ ...draft, status: "SUPERSEDED" }, { ...upload, status: "RETURNED" }])) === "RETURNED");
const approved = { ...upload, status: "RELEASED" as const, releaseNo: 1, releasedAt: new Date(2026, 8, 30, 10) };
check("approved", chapterReviewState(item(2, [draft, approved])) === "APPROVED");
check("approved, then the COO asks for changes", chapterReviewState(item(2, [draft, approved], "Fix Table 2.1")) === "CHANGES_REQUESTED");
const update = v({});
check("approved, and an update waits", chapterReviewState(item(2, [draft, approved, update])) === "UPDATE_WAITING");
check("approved, and the update was returned", chapterReviewState(item(2, [draft, approved, { ...update, status: "RETURNED" }])) === "RETURNED");
check("a newer AI draft never outranks an approval", chapterReviewState(item(2, [approved, v({ submittedByRole: "SYSTEM" })])) === "APPROVED");

// ── What counts ──
check("an AI draft is never the approved version, even if released", approvedVersion([{ ...draft, status: "RELEASED", releaseNo: 1 }]) === null);
const second = { ...update, status: "RELEASED" as const, releaseNo: 2, releasedAt: new Date(2026, 8, 30, 11) };
check("the approved version is the latest release by a person", approvedVersion([approved, second])?.id === second.id);
check("the latest human version ignores the AI drafts", latestHumanVersion([draft, upload])?.id === upload.id);
check("the current AI draft is the newest one", currentAiDraft([draft, v({ submittedByRole: "SYSTEM" })])?.version === n);
check("settled only when approved with nothing outstanding", isSettled("APPROVED") && !isSettled("CHANGES_REQUESTED") && !isSettled("UPDATE_WAITING") && !isSettled("AWAITING_APPROVAL"));
check("an approval stays in use while changes are asked for", approvedVersion([draft, approved, { ...update, status: "RETURNED" }])?.id === approved.id);
check("review applies to reports the pipeline writes", reviewApplies({ generationRuns: 3 }) && !reviewApplies({ generationRuns: 0 }));
check("Word files only", isWordFile("Chapter 3.docx") && isWordFile(" ch.DOCX ") && !isWordFile("Chapter 3.pdf") && !isWordFile("Chapter 3.doc"));

// ── The report ──
const items = [
  item(1, [{ ...approved, id: "a1" }]),
  item(2, [draft, approved]),
  item(3, [v({ submittedByRole: "SYSTEM" })]),
  item(4, [{ ...approved, id: "a4" }], "More detail"),
  item(4, [{ ...approved, id: "archived-4" }], null, true),
  { kind: "FINAL" as const, chapter: null, archived: false, changeNote: null, versions: [] },
];
const r = reportReview(items, [1, 2, 3, 4, 5]);
check("report: approved chapters", same(r.approved, [1, 2, 4]), r.approved);
check("report: settled chapters", same(r.settled, [1, 2]), r.settled);
check("report: pending, in order (a missing chapter counts)", same(r.pending, [3, 4, 5]), r.pending);
check("report: not all settled", !r.allSettled && !r.allApproved);
check("report: an archived item never stands for a chapter", r.approvedVersionIds.get(4) === "a4");
check("report: a chapter with no item is being written", r.states.get(5) === "WRITING");
check("report: approval times", r.approvedAt.get(2)?.getTime() === approved.releasedAt.getTime());
check("chapter items: one per chapter, the first unarchived", chapterItems(items, [4]).get(4)?.changeNote === "More detail");
const full = reportReview([item(1, [{ ...approved, id: "x1" }]), item(2, [{ ...approved, id: "x2" }])], [1, 2]);
check("report: all approved and settled", full.allSettled && full.allApproved);

// ── A complete document built from approved chapters ──
const built = builtFromRecord(full.approvedVersionIds);
check("built-from record", same(built, { 1: "x1", 2: "x2" }));
check("built-from: still the approved versions", builtFromIsStale(built, full.approvedVersionIds).length === 0);
check("built-from: Chapter 2 approved again makes it stale", same(builtFromIsStale(built, new Map([[1, "x1"], [2, "x2b"]])), [2]));
check("built-from: a chapter no longer approved makes it stale", same(builtFromIsStale(built, new Map([[1, "x1"]])), [2]));
check("built-from: a document with no record is never judged", builtFromIsStale(null, full.approvedVersionIds).length === 0);

// ── Approving ──
const clean = { blocking: [], placeholders: [], hash: "h1" };
const refuse = (over: Partial<Parameters<typeof approvalRefusals>[0]>) =>
  approvalRefusals({ version: { status: "SUBMITTED", submittedByRole: "WORKER", fileName: "c.docx" }, projectStatus: "IN_PROGRESS", readback: clean, seenHash: "h1", ...over });
check("a clean Word upload can be approved", refuse({}).length === 0);
check("the AI draft is never approved", same(refuse({ version: { status: "SUBMITTED", submittedByRole: "SYSTEM", fileName: "c.docx" } }), [CHAPTER_REVIEW_TEXT.refuse.aiDraft]));
check("only an upload waiting for review", same(refuse({ version: { status: "RELEASED", submittedByRole: "WORKER", fileName: "c.docx" } }), [CHAPTER_REVIEW_TEXT.refuse.notWaiting]));
check("a PDF is refused", refuse({ version: { status: "SUBMITTED", submittedByRole: "WORKER", fileName: "c.pdf" } }).includes(CHAPTER_REVIEW_TEXT.refuse.notWord));
check("a file not read yet is refused", refuse({ readback: null }).includes(CHAPTER_REVIEW_TEXT.refuse.notRead));
check("a blocking problem is refused, named", refuse({ readback: { ...clean, blocking: ["The chapter has a live chart."] } }).includes("The chapter has a live chart."));
check("blanks left are refused, listed", refuse({ readback: { ...clean, placeholders: ["[N_DISTRIBUTED]", "p. [page]"] } }).some((x) => x.includes("[N_DISTRIBUTED]") && x.includes("p. [page]")));
check("a file read again since the COO looked is refused", refuse({ seenHash: "old" }).includes(CHAPTER_REVIEW_TEXT.refuse.changed));
check("no hash sent: not judged on it", refuse({ seenHash: null }).length === 0);
check("in QA: refused", refuse({ projectStatus: "SUBMITTED" }).includes(CHAPTER_REVIEW_TEXT.refuse.inQa) && refuse({ projectStatus: "IN_QA_REVIEW" }).includes(CHAPTER_REVIEW_TEXT.refuse.inQa));
check("after QA (supervisor corrections): allowed", refuse({ projectStatus: "SUPERVISOR_CORRECTIONS" }).length === 0);

// ── Wording (staff and specialists: no client word rules apply, but every state is said) ──
const states = ["WRITING", "DRAFT_READY", "RETURNED", "AWAITING_APPROVAL", "APPROVED", "CHANGES_REQUESTED", "UPDATE_WAITING"] as const;
check("every state has a label and both lines", states.every((s) => CHAPTER_REVIEW_TEXT.state[s] && CHAPTER_REVIEW_TEXT.specialistLine[s] && CHAPTER_REVIEW_TEXT.staffLine[s]));
check("not-all-approved names the chapters", CHAPTER_REVIEW_TEXT.notAllApproved([3, 5]).endsWith("Still to approve: Chapters 3 and 5."), CHAPTER_REVIEW_TEXT.notAllApproved([3, 5]));
check("not-all-approved, one chapter", CHAPTER_REVIEW_TEXT.notAllApproved([4]).endsWith("Still to approve: Chapter 4."));
check("stale document names the chapters", CHAPTER_REVIEW_TEXT.finalStale([2]).includes("before Chapter 2 was approved again") && CHAPTER_REVIEW_TEXT.finalStale([2, 3]).includes("before Chapters 2 and 3 were approved again"));

if (failures.length) {
  console.error(`check:chapter-review — ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:chapter-review — all ${passed} checks passed`);
