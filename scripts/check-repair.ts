/**
 * Surgical chapter repair (3 Nov 2026): proves, without a database or Claude,
 *
 *  - which failures a repair may fix in place (and that ST16/ST8/ST11, builder
 *    formatting and missing sections never qualify);
 *  - that a failed check whose every failure is repairable is REPAIRED before
 *    any rewrite is considered, that the rewrite bars do not block a repair,
 *    and that repairs exhaust into the rewrite path, which exhausts into the
 *    hand-over, exactly in that order;
 *  - that a non-text-driven formatting failure (the Word builder's own defect)
 *    still never triggers a rewrite OR a repair — it hands the draft over;
 *  - the patcher's refusals: an anchor that is not in the text character for
 *    character, one that appears twice, one too short to be safe, a no-op, a
 *    replacement so large it is a rewrite in disguise — and that later patches
 *    are checked against the already-patched text;
 *  - the tolerant parse of the model's reply (object, JSON-string, junk);
 *  - the settings clamp and the human re-generation cap.
 *
 * `npm run check:repair`.
 */
import {
  allRepairable,
  chapterGateStep,
  gateFactFrom,
  isRewritable,
  MAX_GATE_REPAIRS,
  MAX_GATE_REWRITES,
  repairableItem,
  repairsSettingAllowed,
  type ChapterGateFact,
} from "../src/lib/quality/chapter-gate";
import {
  applyRepairs,
  MAX_REPAIRS_PER_CALL,
  MIN_FIND_CHARS,
  parseRepairs,
  REPAIR_STEP,
  REPAIR_TEXT,
} from "../src/lib/quality/chapter-repair";
import { MAX_CHAPTER_GENERATIONS } from "../src/lib/quality-gate";
import type { QualityItem } from "../src/lib/quality/types";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const item = (id: string, layer: QualityItem["layer"]): QualityItem => ({
  id,
  layer,
  severity: "MAJOR",
  status: "FAIL",
  chapter: 3,
  message: `${id} failed`,
  locations: [{ chapter: 3, paragraph: 1, quote: "an example quote" }],
  fix: "fix it",
});

// ── 1. The classifier ─────────────────────────────────────────────────────────
check("repairable: a VOICE finding", repairableItem(item("VOICE", "voice")));
check("repairable: a REF citation failure", repairableItem(item("REF", "reference")));
check("repairable: ST14 (a table never referred to)", repairableItem(item("ST14", "structural")));
check("repairable: ST15 (an equation not explained)", repairableItem(item("ST15", "structural")));
check("repairable: FG4 is the text's own formatting", repairableItem(item("FG4", "formatting")));
check("repairable: P2 dashes", repairableItem(item("P2", "formatting")));
check("not repairable: ST16 (a placeholder — repair cannot invent data)", !repairableItem(item("ST16", "structural")));
check("not repairable: ST8 (objectives must be word for word)", !repairableItem(item("ST8", "structural")));
check("not repairable: ST11 (length against plan needs new text)", !repairableItem(item("ST11", "structural")));
check("not repairable: ST3 (a missing required section)", !repairableItem(item("ST3", "structural")));
check("not repairable: S1 is the Word builder's rule, not the text's", !repairableItem(item("S1", "formatting")));
check("builder formatting is also never rewritable", !isRewritable(item("S1", "formatting")));
check("allRepairable: every failure must qualify", allRepairable([item("VOICE", "voice"), item("ST14", "structural")]));
check("allRepairable: one unrepairable failure disqualifies the set", !allRepairable([item("VOICE", "voice"), item("ST11", "structural")]));
check("allRepairable: no failures is not repairable", !allRepairable([]));

// ── 2. The one rule: repair before rewrite, in order ─────────────────────────
const fact = (over: Partial<ChapterGateFact>, checkOver: Partial<NonNullable<ChapterGateFact["check"]>> = {}): ChapterGateFact => ({
  chapter: 3,
  outputHash: "h1",
  rewritesUsed: 0,
  repairsUsed: 0,
  barred: null,
  check: { status: "FAILED", lockedUntil: null, attempts: 1, rewritable: true, allRepairable: true, lines: ["[VOICE] a banned phrase"], ...checkOver },
  ...over,
});
const ctx = { now: new Date(), maxRewrites: MAX_GATE_REWRITES, policy: "now" as const };

eq("step: a repairable failure is repaired, not rewritten", chapterGateStep(fact({}), ctx), { kind: "repair", lines: ["[VOICE] a banned phrase"] });
eq("step: repairs exhausted falls to the rewrite", chapterGateStep(fact({ repairsUsed: MAX_GATE_REPAIRS }), ctx).kind, "rewrite");
eq("step: not all repairable goes straight to the rewrite", chapterGateStep(fact({}, { allRepairable: false }), ctx).kind, "rewrite");
eq("step: the data-pause bar does NOT block a repair (it edits in place)", chapterGateStep(fact({ barred: "a data request exists" }), ctx).kind, "repair");
eq("step: barred + unrepairable hands the draft over", chapterGateStep(fact({ barred: "a data request exists" }, { allRepairable: false }), ctx), { kind: "handover", outcome: "failed" });
eq("step: repairs AND rewrites exhausted hands the draft over", chapterGateStep(fact({ repairsUsed: MAX_GATE_REPAIRS, rewritesUsed: MAX_GATE_REWRITES }), ctx), { kind: "handover", outcome: "failed" });
eq("step: a held project waits to repair (policy later)", chapterGateStep(fact({}), { ...ctx, policy: "later" }), { kind: "wait" });
eq("step: a stopped run never repairs — a person decides", chapterGateStep(fact({}), { ...ctx, policy: "never" }), { kind: "handover", outcome: "failed" });
eq("step: maxRepairs 0 (the Setting) switches repairs off", chapterGateStep(fact({}), { ...ctx, maxRepairs: 0 }).kind, "rewrite");
eq("step: a builder failure (rewritable false, not repairable) hands over", chapterGateStep(fact({}, { rewritable: false, allRepairable: false }), ctx), { kind: "handover", outcome: "failed" });
eq("step: a passed check hands over passed", chapterGateStep(fact({}, { status: "PASSED" }), ctx), { kind: "handover", outcome: "passed" });
check("step: an old fixture without the new fields behaves as before (no repair)", chapterGateStep({ chapter: 1, outputHash: "h", rewritesUsed: 0, barred: null, check: { status: "FAILED", lockedUntil: null, attempts: 1, rewritable: true, lines: ["[ST11] short"] } }, ctx).kind === "rewrite");

// gateFactFrom computes repairability from the stored failures.
const made = gateFactFrom({
  chapter: 2,
  outputHash: "h2",
  gateRewriteNo: 1,
  gateRepairNo: 1,
  check: { status: "FAILED", lockedUntil: null, attempts: 1, rewritable: true, failures: [item("VOICE", "voice"), item("REF", "reference")] },
  mode: 2,
  pauses: [],
  hasDataset: false,
});
check("gateFactFrom: allRepairable computed from the failures", made.check?.allRepairable === true);
check("gateFactFrom: repairsUsed carried", made.repairsUsed === 1);
check("gateFactFrom: gateRepairNo may be absent (older callers) and reads 0", gateFactFrom({ chapter: 1, outputHash: "h", gateRewriteNo: 0, check: null, mode: null, pauses: [], hasDataset: false }).repairsUsed === 0);

// ── 3. The patcher ────────────────────────────────────────────────────────────
const text = "The study area was described. Table 3.2 shows the breakdown. In today's rapidly evolving landscape, adoption grows. The sample size was computed.";
const good = applyRepairs(text, [
  { find: "In today's rapidly evolving landscape, adoption grows.", replace: "Adoption has grown steadily." },
  { find: "Table 3.2 shows the breakdown.", replace: "Table 3.2 shows the breakdown, and it is referred to in the analysis that follows." },
]);
check("apply: both safe patches applied", good.applied.length === 2 && good.refused.length === 0);
check("apply: the patched text carries the fixes", good.text.includes("Adoption has grown steadily.") && !good.text.includes("rapidly evolving"));
check("apply: untouched text is untouched", good.text.startsWith("The study area was described.") && good.text.endsWith("The sample size was computed."));

eq("apply: an anchor not in the text is refused", applyRepairs(text, [{ find: "This sentence is not there anywhere.", replace: "x" }]).refused[0]?.reason, "the anchor is not in the chapter character for character");
check("apply: an ambiguous anchor (appears twice) is refused", applyRepairs("aaa same phrase bbb same phrase ccc", [{ find: "same phrase", replace: "x" }]).refused[0]?.reason.includes("2 times") === true);
check("apply: a too-short anchor is refused", applyRepairs(text, [{ find: "Table", replace: "Tab" }]).refused[0]?.reason.includes(String(MIN_FIND_CHARS)) === true);
check("apply: a no-op patch is refused", applyRepairs(text, [{ find: "The study area was described.", replace: "The study area was described." }]).refused.length === 1);
check("apply: a replacement far larger than its anchor is refused (an edit, not a rewrite)", applyRepairs(text, [{ find: "The study area was described.", replace: "x".repeat(2000) }]).refused[0]?.reason.includes("not a rewrite") === true);
check(
  "apply: later patches are validated against the already-patched text",
  applyRepairs("alpha beta gamma", [
    { find: "alpha beta gamma", replace: "alpha delta gamma" },
    { find: "alpha beta gamma", replace: "won't be found now" },
  ]).refused.length === 1,
);
check("apply: the per-call cap holds", applyRepairs("x".repeat(10_000), Array.from({ length: MAX_REPAIRS_PER_CALL + 10 }, (_, i) => ({ find: `not-there-${i}-padding`, replace: "y" }))).refused.length === MAX_REPAIRS_PER_CALL);

// ── 4. The tolerant parse ─────────────────────────────────────────────────────
eq("parse: a plain object", parseRepairs({ repairs: [{ find: "a", replace: "b" }] }), [{ find: "a", replace: "b" }]);
eq("parse: the JSON-string wrapper seen live on other tools", parseRepairs('{"repairs":[{"find":"a","replace":"b"}]}'), [{ find: "a", replace: "b" }]);
eq("parse: a bare array", parseRepairs([{ find: "a", replace: "b" }]), [{ find: "a", replace: "b" }]);
eq("parse: junk is an empty list, never a throw", parseRepairs("not json at all"), []);
eq("parse: items missing fields are dropped", parseRepairs({ repairs: [{ find: "a" }, { replace: "b" }, { find: "c", replace: "d" }] }), [{ find: "c", replace: "d" }]);

// ── 5. Settings, caps and the founder-reviewable wording ─────────────────────
eq("setting: absent means the default", repairsSettingAllowed(null), MAX_GATE_REPAIRS);
eq("setting: '0' switches repairs off", repairsSettingAllowed("0"), 0);
eq("setting: clamped to the maximum", repairsSettingAllowed("9"), MAX_GATE_REPAIRS);
check("the human re-generation cap exists and allows headroom past the automatic rewrites", MAX_CHAPTER_GENERATIONS === 6 && MAX_CHAPTER_GENERATIONS > 1 + MAX_GATE_REWRITES);
check("usage step is chapter_repair", REPAIR_STEP === "chapter_repair");
check("prompt: fixes only what the failures name", REPAIR_TEXT.system.includes("Fix ONLY what the failures name"));
check("prompt: anchors copied character for character", REPAIR_TEXT.system.includes("CHARACTER FOR CHARACTER"));
check("prompt: never invent a source", REPAIR_TEXT.system.includes("instead of inventing a source"));
check("prompt: the user block carries chapter, failures and the cap", REPAIR_TEXT.user({ chapter: 3, title: "T", lines: ["[VOICE] x"], references: ["A (2020). B"], text: "body" }).includes("VERIFIED REFERENCES"));

if (failures.length) {
  console.error(`check:repair — ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:repair — all ${passed} checks passed`);
