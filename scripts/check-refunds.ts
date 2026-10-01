/**
 * Phase 6 refund rules, no database: stage detection from the facts, the default
 * percentage and bounds per stage, the amount clamp, the worker partial from the
 * delivered chapters' shares, and the released-chapters label.
 *
 *   npm run check:refunds
 */
import {
  clampRefund,
  defaultRefundAmount,
  detectRefundStage,
  percentOf,
  refundAmountBounds,
  releasedChaptersLabel,
  releasedChaptersShare,
  STAGE_RULES,
  withinStageOneWindow,
  workerPartialDefault,
  type RefundFacts,
} from "../src/lib/finance/refund-rules";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

const now = new Date("2026-10-10T12:00:00Z");
const facts = (over: Partial<RefundFacts>): RefundFacts => ({ now, downpaymentVerifiedAt: new Date("2026-10-10T00:00:00Z"), workStarted: false, releasedChapters: [], completeReleased: false, ...over });

// ── Stage detection (most-complete wins) ──
expect("no work -> stage 1", detectRefundStage(facts({})), 1);
expect("work started, nothing released -> stage 2", detectRefundStage(facts({ workStarted: true })), 2);
expect("chapter 1 released -> stage 3", detectRefundStage(facts({ workStarted: true, releasedChapters: [1] })), 3);
expect("chapter 2 released -> stage 3", detectRefundStage(facts({ workStarted: true, releasedChapters: [2] })), 3);
expect("chapter 3 released but not 1/2 -> still stage 2 (only 1 or 2 count for stage 3)", detectRefundStage(facts({ workStarted: true, releasedChapters: [3] })), 2);
expect("complete released -> stage 4", detectRefundStage(facts({ workStarted: true, releasedChapters: [1, 2, 3], completeReleased: true })), 4);

// ── The 48-hour window ──
expect("within 48h of the downpayment", withinStageOneWindow(facts({})), true);
expect("more than 48h after the downpayment", withinStageOneWindow(facts({ downpaymentVerifiedAt: new Date("2026-10-01T00:00:00Z") })), false);
expect("no downpayment date -> not in the window", withinStageOneWindow(facts({ downpaymentVerifiedAt: null })), false);

// ── Defaults + bounds ──
expect("stage 1 default 100%", STAGE_RULES[1].defaultPercent, 100);
expect("stage 2 default 75%", STAGE_RULES[2].defaultPercent, 75);
expect("stage 3 default 50%", STAGE_RULES[3].defaultPercent, 50);
expect("stage 4 default 0%", STAGE_RULES[4].defaultPercent, 0);
expect("stage 1 default amount of 70,000", defaultRefundAmount(1, 70_000), 70_000);
expect("stage 2 default amount of 70,000", defaultRefundAmount(2, 70_000), 52_500);
expect("stage 3 default amount of 70,000", defaultRefundAmount(3, 70_000), 35_000);
expect("stage 3 bounds of 70,000", refundAmountBounds(3, 70_000), { min: 0, max: 35_000 });
expect("stage 4 bounds of 70,000 are 0..0", refundAmountBounds(4, 70_000), { min: 0, max: 0 });

// ── Clamp ──
expect("clamp above the stage max", clampRefund(3, 70_000, 60_000), 35_000);
expect("clamp a negative to 0", clampRefund(2, 70_000, -5), 0);
expect("clamp within bounds is unchanged", clampRefund(2, 70_000, 40_000), 40_000);
expect("a keep-money 0 is always allowed", clampRefund(4, 70_000, 0), 0);

// ── Worker partial (decision 7): worker leg × released shares (12/18/30/35/5) ──
expect("Ch1+2 share is 30%", releasedChaptersShare([1, 2]), 30);
expect("Ch1 only is 12%", releasedChaptersShare([1]), 12);
expect("no chapters is 0%", releasedChaptersShare([]), 0);
expect("worker partial for Ch1+2 of a 40,000 leg", workerPartialDefault(40_000, [1, 2]), 12_000);
expect("worker partial for Ch1 of a 40,000 leg", workerPartialDefault(40_000, [1]), 4_800);
expect("worker partial with nothing delivered is 0", workerPartialDefault(40_000, []), 0);

// ── Labels + percent ──
expect("one chapter label", releasedChaptersLabel([1]), "Chapter 1");
expect("two chapters label", releasedChaptersLabel([1, 2]), "Chapters 1 and 2");
expect("three chapters label", releasedChaptersLabel([1, 2, 3]), "Chapters 1, 2 and 3");
expect("no chapters label", releasedChaptersLabel([]), "no chapters");
expect("percentOf 35,000 of 70,000", percentOf(35_000, 70_000), 50);
expect("percentOf with no money in", percentOf(0, 0), 0);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("check:refunds — the refund rules hold.");
