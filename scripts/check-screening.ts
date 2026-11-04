/**
 * Checks the Stage-1 worker screening rules with no database:
 *
 *   npm run check:screening
 *
 * Scoring (Eye test + reference relevance), the overall percent, the
 * pass/fail/borderline band, the stage it lands on, the item draw, the sitting
 * clock, the founder's bank-item validation, and the candidate wording.
 *
 * Fails (exit 1) on any mismatch.
 */
import {
  DEFAULT_SCREENING_PASS_PERCENT,
  RELEVANCE_LABELS,
  RELEVANCE_SOURCE_COUNT,
  SCREENING_KINDS,
  SCREENING_TEXT,
  ScreeningRuleError,
  drawItems,
  isRelevanceLabel,
  outcomeFor,
  overallScore,
  scoreEye,
  scoreRelevance,
  sittingExpired,
  stageForOutcome,
  validateEyeItem,
  validateRelevanceItem,
  type EyeItemKey,
  type RelevanceLabel,
} from "../src/lib/screening/rules";
import { REWRITE_MIN_PLANTED, bannedConstructions, scoreRewrite, validateRewriteItem } from "../src/lib/screening/rewrite";
import { FORMAT_INJECTORS, FORMAT_INJECTOR_IDS } from "../src/lib/screening/format-test";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}
function throws(label: string, fn: () => unknown) {
  try {
    fn();
    expect(label, "no throw", "throw");
  } catch (e) {
    expect(label, e instanceof ScreeningRuleError, true);
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

expect("the four relevance labels", RELEVANCE_LABELS, ["CORE", "CLOSELY_RELATED", "TANGENTIAL", "IRRELEVANT"]);
expect("isRelevanceLabel", [isRelevanceLabel("CORE"), isRelevanceLabel("core"), isRelevanceLabel(2)], [true, false, false]);
expect("relevance source count", RELEVANCE_SOURCE_COUNT, 10);
expect("the kinds", SCREENING_KINDS, ["EYE", "REL", "REWRITE", "FORMAT"]);

// ── Eye scoring ──────────────────────────────────────────────────────────────

const eyeItems: EyeItemKey[] = [
  { id: "a", isAI: true },
  { id: "b", isAI: false },
  { id: "c", isAI: true },
];
expect("all correct", scoreEye(eyeItems, { a: { choice: "AI" }, b: { choice: "HUMAN" }, c: { choice: "AI" } }), 3);
expect("one wrong", scoreEye(eyeItems, { a: { choice: "HUMAN" }, b: { choice: "HUMAN" }, c: { choice: "AI" } }), 2);
expect("unanswered scores nothing", scoreEye(eyeItems, { a: { choice: "AI" } }), 1);
expect("a tell does not affect scoring", scoreEye(eyeItems, { a: { choice: "AI", tell: "robotic" }, b: { choice: "HUMAN" }, c: { choice: "AI" } }), 3);

// ── Relevance scoring ────────────────────────────────────────────────────────

const correct: RelevanceLabel[] = ["CORE", "CLOSELY_RELATED", "TANGENTIAL", "IRRELEVANT"];
expect("rel all correct", scoreRelevance(correct, { 0: "CORE", 1: "CLOSELY_RELATED", 2: "TANGENTIAL", 3: "IRRELEVANT" }), 4);
expect("rel two wrong", scoreRelevance(correct, { 0: "CORE", 1: "CORE", 2: "TANGENTIAL", 3: "TANGENTIAL" }), 2);
expect("rel unanswered scores nothing", scoreRelevance(correct, { 0: "CORE" }), 1);

// ── Overall + outcome ────────────────────────────────────────────────────────

expect("overall equal weighting", overallScore({ eyeCorrect: 10, eyeTotal: 12, relCorrect: 8, relTotal: 10 }).overallPercent, Math.round((18 / 22) * 100));
expect("overall with no questions is 0", overallScore({ eyeCorrect: 0, eyeTotal: 0, relCorrect: 0, relTotal: 0 }).overallPercent, 0);
expect("a sitting with no rewrite scores exactly as before", overallScore({ eyeCorrect: 10, eyeTotal: 12, relCorrect: 8, relTotal: 10 }).rewriteTotal, 0);
expect("a sitting with no formatting scores exactly as before", overallScore({ eyeCorrect: 10, eyeTotal: 12, relCorrect: 8, relTotal: 10 }).formatTotal, 0);
expect("the rewrite is folded into the overall", overallScore({ eyeCorrect: 5, eyeTotal: 10, relCorrect: 5, relTotal: 10, rewriteCorrect: 4, rewriteTotal: 4 }).overallPercent, Math.round((14 / 24) * 100));
expect("the formatting practical is folded into the overall", overallScore({ eyeCorrect: 5, eyeTotal: 10, relCorrect: 5, relTotal: 10, formatCorrect: 4, formatTotal: 6 }).overallPercent, Math.round((14 / 26) * 100));

expect("clear pass at the bar", outcomeFor(70, 70, 10), "PASS");
expect("above the bar passes", outcomeFor(85, 70, 10), "PASS");
expect("inside the band is borderline", outcomeFor(65, 70, 10), "BORDERLINE");
expect("at the fail edge is a fail", outcomeFor(59, 70, 10), "FAIL");
expect("well below is a fail", outcomeFor(30, 70, 10), "FAIL");
expect("defaults used when args omitted", outcomeFor(DEFAULT_SCREENING_PASS_PERCENT), "PASS");
expect("a nonsense bar falls back to the default", outcomeFor(72, 0, 10), "PASS");

expect("stage for a pass", stageForOutcome("PASS"), "SCREEN_PASSED");
expect("stage for a fail", stageForOutcome("FAIL"), "SCREEN_FAILED");
expect("a borderline stays in progress", stageForOutcome("BORDERLINE"), "SCREEN_IN_PROGRESS");

// ── Draw + clock ─────────────────────────────────────────────────────────────

{
  const pool = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}` }));
  const seq = [0.1, 0.9, 0.5, 0.3, 0.7];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  const drawn = drawItems(pool, 12, rng);
  expect("draws the asked-for count", drawn.length, 12);
  expect("every drawn item is distinct", new Set(drawn.map((d) => d.id)).size, 12);
  expect("asking for more than the pool returns the pool", drawItems(pool, 50, rng).length, 20);
  expect("drawing from an empty pool is empty", drawItems([], 5), []);
}

{
  const now = new Date("2026-11-04T10:00:00Z");
  expect("a null deadline never expires", sittingExpired(null, now), false);
  expect("before the deadline is fine", sittingExpired(new Date("2026-11-04T10:30:00Z"), now), false);
  expect("after the deadline is expired", sittingExpired(new Date("2026-11-04T09:30:00Z"), now), true);
}

// ── Bank validation ──────────────────────────────────────────────────────────

expect(
  "a good Eye item is cleaned",
  validateEyeItem({ text: "  A long enough paragraph about rural water purification systems in practice.  ", source: " A book " }, { isAI: true }),
  { payload: { text: "A long enough paragraph about rural water purification systems in practice.", source: "A book" }, answerKey: { isAI: true } }
);
throws("an Eye item too short is refused", () => validateEyeItem({ text: "too short" }, { isAI: true }));
throws("an Eye item with no isAI is refused", () => validateEyeItem({ text: "A long enough paragraph about rural water purification systems in practice." }, {}));

{
  const sources = Array.from({ length: 10 }, (_, i) => ({ title: `Source ${i}`, year: 2020 + i }));
  const labels: RelevanceLabel[] = ["CORE", "CORE", "CLOSELY_RELATED", "CLOSELY_RELATED", "TANGENTIAL", "TANGENTIAL", "IRRELEVANT", "IRRELEVANT", "CORE", "TANGENTIAL"];
  const cleaned = validateRelevanceItem({ topic: "Solar water purification in rural Nigeria", sources }, { labels });
  expect("a good relevance item keeps 10 sources + 10 labels", [cleaned.payload.sources.length, cleaned.answerKey.labels.length], [10, 10]);
  throws("fewer than ten sources is refused", () => validateRelevanceItem({ topic: "A topic here", sources: sources.slice(0, 5) }, { labels }));
  throws("a bad label is refused", () => validateRelevanceItem({ topic: "A topic here", sources }, { labels: [...labels.slice(0, 9), "MAYBE"] }));
  throws("a source without a title is refused", () => validateRelevanceItem({ topic: "A topic here", sources: [...sources.slice(0, 9), { year: 2021 }] }, { labels }));
  throws("a too-short topic is refused", () => validateRelevanceItem({ topic: "x", sources }, { labels }));
}

// ── Rewrite test ───────────────────────────────────────────────────────────────

{
  // A paragraph thick with AI tells: two stock openers, first person, hype.
  const original =
    "It is important to note that our organisation utilises cutting-edge, groundbreaking solutions. In today's rapidly evolving digital landscape, we believe these tools are essential.";
  const planted = bannedConstructions(original).length;
  expect("the test paragraph carries several banned constructions", planted >= 3, true);

  // A clean recast: plain, specific, long enough, no tells.
  const clean =
    "The organisation uses modern software to manage its academic projects. The tools were chosen after comparing three options on cost and reliability across the 2024 session.";
  const cleanScore = scoreRewrite(original, clean);
  expect("a clean rewrite clears every tell", [cleanScore.remaining, cleanScore.correct, cleanScore.percent], [0, planted, 100]);
  expect("a clean rewrite is not flagged too short", cleanScore.tooShort, false);

  // One stock opener left behind: not a clean pass.
  const withOpener =
    "It is important to note that the organisation uses modern software, chosen carefully for its cost and its reliability across the whole academic session this year.";
  const partial = scoreRewrite(original, withOpener);
  expect("a leftover tell keeps remaining above zero", partial.remaining >= 1, true);
  expect("a leftover tell scores below full marks", partial.percent < 100, true);

  // Gaming by deletion: too short to count.
  const tiny = scoreRewrite(original, "The org uses tools.");
  expect("a cut-down rewrite is too short and scores zero", [tiny.tooShort, tiny.correct, tiny.percent], [true, 0, 0]);

  // Bank validation: a clean paragraph has nothing to fix.
  throws("a paragraph with no tells is refused as a rewrite item", () => validateRewriteItem({ text: clean }, {}));
  expect("the planted minimum is at least two", REWRITE_MIN_PLANTED >= 2, true);
  const ok = validateRewriteItem({ text: original, note: "  from a real submission  " }, {});
  expect("a genuine AI paragraph is accepted and the note trimmed", [ok.payload.text === original.trim(), ok.payload.note], [true, "from a real submission"]);
}

// ── Formatting practical: each injector's "is it fixed?" reader ──────────────

{
  expect("the six formatting faults", FORMAT_INJECTOR_IDS, ["font", "size", "colour", "spacing", "align", "margin"]);
  const by = (id: string) => FORMAT_INJECTORS.find((i) => i.id === id)!;
  // Crafted fragments for each fault: a broken one (fault present) and a fixed one.
  const run = (props: string) => `<w:p><w:pPr></w:pPr><w:r><w:rPr>${props}</w:rPr><w:t>text</w:t></w:r></w:p>`;
  const para = (pPr: string) => `<w:p><w:pPr>${pPr}</w:pPr><w:r><w:t>text</w:t></w:r></w:p>`;

  expect("font fault seen, fix cleared", [by("font").isFixed(run('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>')), by("font").isFixed(run('<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'))], [false, true]);
  expect("size fault seen, fix cleared", [by("size").isFixed(run('<w:sz w:val="28"/>')), by("size").isFixed(run('<w:sz w:val="24"/>'))], [false, true]);
  expect("size ignores complex-script size", by("size").isFixed(run('<w:sz w:val="24"/><w:szCs w:val="28"/>')), true);
  expect("colour fault seen, fix cleared", [by("colour").isFixed(run('<w:color w:val="1F4E79"/>')), by("colour").isFixed(run('<w:color w:val="000000"/>'))], [false, true]);
  expect("colour auto counts as black", by("colour").isFixed(run('<w:color w:val="auto"/>')), true);
  expect("spacing fault seen, fix cleared", [by("spacing").isFixed(para('<w:spacing w:line="240" w:lineRule="auto"/>')), by("spacing").isFixed(para('<w:spacing w:line="480" w:lineRule="auto"/>'))], [false, true]);
  expect("spacing with no line set is not a fault", by("spacing").isFixed(para("")), true);
  expect("align fault seen, fix cleared", [by("align").isFixed(para('<w:jc w:val="left"/>')), by("align").isFixed(para('<w:jc w:val="both"/>'))], [false, true]);
  expect("align with no jc set is not a fault", by("align").isFixed(para("")), true);
  expect("margin fault seen, fix cleared", [by("margin").isFixed('<w:pgMar w:top="720" w:bottom="1440"/>'), by("margin").isFixed('<w:pgMar w:top="1440" w:bottom="1440"/>')], [false, true]);
  expect("margin within tolerance passes", by("margin").isFixed('<w:pgMar w:top="1400"/>'), true);
}

// ── Wording ──────────────────────────────────────────────────────────────────

const textValues = [
  SCREENING_TEXT.introTitle,
  SCREENING_TEXT.introBody,
  SCREENING_TEXT.startLabel,
  SCREENING_TEXT.eyeTitle,
  SCREENING_TEXT.eyeBody,
  SCREENING_TEXT.relTitle,
  SCREENING_TEXT.relBody,
  SCREENING_TEXT.rewriteTitle,
  SCREENING_TEXT.rewriteBody,
  SCREENING_TEXT.rewriteParagraphLabel,
  SCREENING_TEXT.rewriteAnswerLabel,
  SCREENING_TEXT.rewritePlaceholder,
  SCREENING_TEXT.formatTitle,
  SCREENING_TEXT.formatBody,
  SCREENING_TEXT.formatDownloadLabel,
  SCREENING_TEXT.formatUploadLabel,
  SCREENING_TEXT.formatUploaded,
  SCREENING_TEXT.formatUploadError,
  SCREENING_TEXT.submitLabel,
  SCREENING_TEXT.doneTitle,
  SCREENING_TEXT.doneBody,
  SCREENING_TEXT.emailSubject,
  SCREENING_TEXT.emailLine,
  SCREENING_TEXT.timeNote(40),
];
for (const [i, v] of textValues.entries()) {
  expect(`wording ${i} is a non-empty sentence`, typeof v === "string" && v.trim().length > 0, true);
  expect(`wording ${i} has no emoji`, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(v), false);
}
expect("the time note carries the minutes", SCREENING_TEXT.timeNote(40).includes("40 minutes"), true);

if (failures > 0) {
  console.log(`\ncheck:screening — ${failures} failure(s).`);
  process.exit(1);
}
console.log("check:screening — the screening rules hold.");
