/**
 * Checks the Command Center's pure rules with no database: the RAG status
 * rules and threshold fallbacks (src/lib/command-center/rag.ts), the WAT /
 * UTC-month / Monday-week time maths (src/lib/command-center/time.ts) on
 * fixed dates, the Ambassador Platform and Operations Platform rules it
 * mirrors (src/lib/command-center/derive.ts) and the schema check behind
 * the "requires Phase 3/4 merge" reads (sources/merge-guard.ts).
 *
 *   npm run check:cc
 *
 * Fails (exit 1) on any mismatch. Run it after touching either module.
 */
import {
  CAPACITY_BAND,
  OPS_RESERVE_ALERT_KEY,
  THRESHOLD_DEFAULTS,
  THRESHOLD_KEYS,
  fractionToPercent,
  growthStatus,
  isNairaKey,
  isRateKey,
  isThresholdKey,
  parseThresholds,
  ragStatus,
  thresholdConflict,
} from "../src/lib/command-center/rag";
import {
  MAX_CORRECTION_ROUNDS,
  contentConsistencyOf,
  currentCorrectionRound,
  deliveredOnTime,
  platinumBonusQuarter,
  previousQuarterKey,
  quarterKeyOf,
  quarterSpan,
  ratePercent,
  supervisorAccepted,
} from "../src/lib/command-center/derive";
import { WORKER_FLAGS_MAX } from "../src/lib/command-center/rag";
import { schemaHas } from "../src/lib/services/command-center/sources/merge-guard";
import {
  hoursBetween,
  lastMonths,
  monthBounds,
  monthLongLabel,
  monthShortLabel,
  pctChange,
  samePointLastMonth,
  shiftMonth,
  watDayBounds,
  watDayOfMonth,
  watMonthKey,
  weekBuckets,
} from "../src/lib/command-center/time";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}

// ── Thresholds ──────────────────────────────────────────────────────────────

expect("14 threshold keys", THRESHOLD_KEYS.length, 14);
expect("every key has a numeric default", THRESHOLD_KEYS.every((k) => Number.isFinite(Number(THRESHOLD_DEFAULTS[k]))), true);
expect("rate keys are fractions", THRESHOLD_KEYS.filter(isRateKey).every((k) => Number(THRESHOLD_DEFAULTS[k]) <= 1), true);
expect("naira keys are whole", THRESHOLD_KEYS.filter(isNairaKey).every((k) => Number.isInteger(Number(THRESHOLD_DEFAULTS[k]))), true);
expect("rate + naira keys cover every key", THRESHOLD_KEYS.every((k) => isRateKey(k) !== isNairaKey(k)), true);
expect("ops reserve alert key is a threshold key", isThresholdKey(OPS_RESERVE_ALERT_KEY), true);
expect("isThresholdKey rejects strangers", isThresholdKey("cc.ops.nothing"), false);
expect("isThresholdKey rejects non-strings", isThresholdKey(42), false);

const defaults = parseThresholds({});
expect("no rows → defaults", defaults["cc.ops.delivery_rate.target"], 0.95);
expect("no rows → naira default", defaults["cc.finance.ops_reserve_min"], 150000);
const parsed = parseThresholds({
  "cc.ops.delivery_rate.target": "0.9",
  "cc.ops.delivery_rate.amber": "abc",
  "cc.ops.qa_first_pass.target": "",
  "cc.ops.qa_first_pass.amber": "-1",
  "cc.finance.ops_reserve_min": "200000",
  "cc.finance.ops_reserve_critical": null,
});
expect("row value wins", parsed["cc.ops.delivery_rate.target"], 0.9);
expect("non-numeric row falls back", parsed["cc.ops.delivery_rate.amber"], 0.85);
expect("blank row falls back", parsed["cc.ops.qa_first_pass.target"], 0.8);
expect("negative row falls back", parsed["cc.ops.qa_first_pass.amber"], 0.72);
expect("naira row wins", parsed["cc.finance.ops_reserve_min"], 200000);
expect("null row falls back", parsed["cc.finance.ops_reserve_critical"], 80000);
expect("untouched keys keep defaults", parsed["cc.quality.tier2_pass.target"], 0.85);

// ── RAG rules ───────────────────────────────────────────────────────────────

expect("higher: at target is green", ragStatus("higher", 95, 95, 85), "green");
expect("higher: above target is green", ragStatus("higher", 99, 95, 85), "green");
expect("higher: between amber and target is amber", ragStatus("higher", 90, 95, 85), "amber");
expect("higher: at amber is amber", ragStatus("higher", 85, 95, 85), "amber");
expect("higher: below amber is red", ragStatus("higher", 80, 95, 85), "red");
expect("higher: null is neutral", ragStatus("higher", null, 95, 85), "neutral");
expect("higher: NaN is neutral", ragStatus("higher", Number.NaN, 95, 85), "neutral");

expect("lower: at target is green", ragStatus("lower", 5, 5, 10), "green");
expect("lower: zero is green", ragStatus("lower", 0, 5, 10), "green");
expect("lower: between target and amber is amber", ragStatus("lower", 7, 5, 10), "amber");
expect("lower: at amber is amber", ragStatus("lower", 10, 5, 10), "amber");
expect("lower: above amber is red", ragStatus("lower", 12, 5, 10), "red");
expect("lower: null is neutral", ragStatus("lower", null, 5, 10), "neutral");

const { low, high, tolerance } = CAPACITY_BAND;
expect("band: inside is green", ragStatus("band", 70, low, tolerance, high), "green");
expect("band: low edge is green", ragStatus("band", 60, low, tolerance, high), "green");
expect("band: high edge is green", ragStatus("band", 85, low, tolerance, high), "green");
expect("band: just under is amber", ragStatus("band", 55, low, tolerance, high), "amber");
expect("band: tolerance edge under is amber", ragStatus("band", 50, low, tolerance, high), "amber");
expect("band: just over is amber", ragStatus("band", 90, low, tolerance, high), "amber");
expect("band: tolerance edge over is amber", ragStatus("band", 95, low, tolerance, high), "amber");
expect("band: far under is red", ragStatus("band", 45, low, tolerance, high), "red");
expect("band: far over is red", ragStatus("band", 96, low, tolerance, high), "red");
expect("band: null is neutral", ragStatus("band", null, low, tolerance, high), "neutral");
expect("band: missing high edge collapses to the target", ragStatus("band", 60, 60, 10), "green");

expect("growth: up is green", growthStatus(5, 3), "green");
expect("growth: level is green", growthStatus(3, 3), "green");
expect("growth: from zero is green", growthStatus(1, 0), "green");
expect("growth: down but some is amber", growthStatus(2, 3), "amber");
expect("growth: fell to zero is red", growthStatus(0, 3), "red");
expect("growth: both zero is neutral", growthStatus(0, 0), "neutral");

// ── Months (UTC) ────────────────────────────────────────────────────────────

expect("shiftMonth back over a year end", shiftMonth("2026-01", -1), "2025-12");
expect("shiftMonth forward over a year end", shiftMonth("2026-12", 1), "2027-01");
expect("shiftMonth several", shiftMonth("2026-09", -8), "2026-01");
expect("shiftMonth zero", shiftMonth("2026-09", 0), "2026-09");
expect("monthBounds", monthBounds("2026-09"), { start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" });
expect("monthBounds December", monthBounds("2026-12"), { start: "2026-12-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z" });
expect("lastMonths(6)", lastMonths(6, new Date("2026-09-24T10:00:00Z")), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
expect("lastMonths across a year end", lastMonths(3, new Date("2026-01-15T00:00:00Z")), ["2025-11", "2025-12", "2026-01"]);
expect("lastMonths(1) is the current month", lastMonths(1, new Date("2026-09-24T10:00:00Z")), ["2026-09"]);
expect("lastMonths is UTC, like finance (23:30Z on the 30th is still September)", lastMonths(1, new Date("2026-09-30T23:30:00Z")), ["2026-09"]);
expect("monthLongLabel", monthLongLabel("2026-09"), "September 2026");
expect("monthShortLabel matches getRevenueHistory", monthShortLabel("2026-09"), "Sep 26");
expect("monthShortLabel January", monthShortLabel("2027-01"), "Jan 27");

expect("pctChange up", pctChange(150, 100), 50);
expect("pctChange down, one decimal", pctChange(100, 150), -33.3);
expect("pctChange both zero", pctChange(0, 0), 0);
expect("pctChange from zero is null", pctChange(5, 0), null);
expect("pctChange to zero", pctChange(0, 5), -100);

// ── WAT days (00:00 WAT = 23:00 UTC the day before) ─────────────────────────

expect("watDayBounds mid-afternoon", watDayBounds(new Date("2026-09-24T15:23:00Z")), {
  start: "2026-09-23T23:00:00.000Z",
  end: "2026-09-24T23:00:00.000Z",
  yesterdayStart: "2026-09-22T23:00:00.000Z",
});
expect("watDayBounds at 00:30 WAT is the new day", watDayBounds(new Date("2026-09-24T23:30:00Z")).start, "2026-09-24T23:00:00.000Z");
expect("watDayBounds at 23:59 WAT is still the old day", watDayBounds(new Date("2026-09-24T22:59:59Z")).start, "2026-09-23T23:00:00.000Z");
expect("watDayBounds exactly midnight WAT", watDayBounds(new Date("2026-09-23T23:00:00Z")).start, "2026-09-23T23:00:00.000Z");
expect("watDayOfMonth plain", watDayOfMonth(new Date("2026-09-24T15:00:00Z")), 24);
expect("watDayOfMonth rolls to the 1st at 23:30Z", watDayOfMonth(new Date("2026-09-30T23:30:00Z")), 1);
expect("watDayOfMonth the 5th at 23:30Z is the 6th", watDayOfMonth(new Date("2026-09-05T23:30:00Z")), 6);

// ── WAT weeks (Monday 00:00 WAT aligned) ────────────────────────────────────

// 24 September 2026 is a Thursday; that week's Monday is 21 September.
const thursday = new Date("2026-09-24T15:00:00Z");
const weeks = weekBuckets(3, thursday);
expect("weekBuckets count", weeks.length, 3);
expect("weekBuckets starts", weeks.map((w) => w.start.toISOString()), ["2026-09-06T23:00:00.000Z", "2026-09-13T23:00:00.000Z", "2026-09-20T23:00:00.000Z"]);
expect("weekBuckets ends", weeks.map((w) => w.end.toISOString()), ["2026-09-13T23:00:00.000Z", "2026-09-20T23:00:00.000Z", "2026-09-27T23:00:00.000Z"]);
expect("weekBuckets labels", weeks.map((w) => w.label), ["7 Sep", "14 Sep", "21 Sep"]);
expect("weekBuckets: the last bucket holds now", weeks[2].start <= thursday && thursday < weeks[2].end, true);
expect("weekBuckets: Monday 00:30 WAT starts the new week", weekBuckets(1, new Date("2026-09-20T23:30:00Z"))[0].start.toISOString(), "2026-09-20T23:00:00.000Z");
expect("weekBuckets: Sunday 23:30 WAT is still the old week", weekBuckets(1, new Date("2026-09-20T22:30:00Z"))[0].start.toISOString(), "2026-09-13T23:00:00.000Z");
expect("weekBuckets(12) spans 12 weeks", weekBuckets(12, thursday).length, 12);
expect("weekBuckets label over a month end", weekBuckets(2, new Date("2026-10-01T12:00:00Z")).map((w) => w.label), ["21 Sep", "28 Sep"]);

// ── Durations ───────────────────────────────────────────────────────────────

expect("hoursBetween", hoursBetween(new Date("2026-09-24T10:00:00Z"), new Date("2026-09-24T12:30:00Z")), 2.5);
expect("hoursBetween is signed", hoursBetween(new Date("2026-09-24T12:00:00Z"), new Date("2026-09-24T10:00:00Z")), -2);

// ── Month comparisons, WAT months, threshold hygiene ───────────────────────

expect("pctChange: recovery from a negative month is growth", pctChange(10_000, -5_000), 300);
expect("pctChange: a deeper negative month is a fall", pctChange(-20_000, -5_000), -300);
expect("pctChange: nothing last month, something now", pctChange(5_000, 0), null);
expect("pctChange: nothing last month, a refund now", pctChange(-5_000, 0), null);
expect("pctChange: both zero", pctChange(0, 0), 0);

const midOct = samePointLastMonth(new Date("2026-10-12T10:00:00Z"));
expect("samePointLastMonth: starts at last month's start", midOct.start.toISOString(), "2026-09-01T00:00:00.000Z");
expect("samePointLastMonth: same elapsed time", midOct.end.toISOString(), "2026-09-12T10:00:00.000Z");
expect(
  "samePointLastMonth: capped at a shorter month's end",
  samePointLastMonth(new Date("2026-03-30T12:00:00Z")).end.toISOString(),
  "2026-03-01T00:00:00.000Z"
);
expect(
  "samePointLastMonth: the 1st at midnight is an empty window",
  samePointLastMonth(new Date("2026-10-01T00:00:00Z")).end.toISOString(),
  "2026-09-01T00:00:00.000Z"
);

expect("watMonthKey: 23:30 UTC on 31 Oct is November in Lagos", watMonthKey(new Date("2026-10-31T23:30:00Z")), "2026-11");
expect("watMonthKey: 22:30 UTC on 31 Oct is still October", watMonthKey(new Date("2026-10-31T22:30:00Z")), "2026-10");
expect("watMonthKey: New Year in Lagos", watMonthKey(new Date("2026-12-31T23:15:00Z")), "2027-01");

expect("fractionToPercent removes float noise", fractionToPercent(0.55), 55);
expect("fractionToPercent keeps two decimals", fractionToPercent(0.555), 55.5);
expect("fractionToPercent(0.28)", fractionToPercent(0.28), 28);
expect("a 55% month meets a 0.55 target", ragStatus("higher", 55, fractionToPercent(0.55), fractionToPercent(0.5)), "green");

const current = parseThresholds({});
expect("thresholdConflict: amber above its target is refused", typeof thresholdConflict("cc.ops.delivery_rate.amber", 0.99, current), "string");
expect("thresholdConflict: target below its amber is refused", typeof thresholdConflict("cc.ops.delivery_rate.target", 0.8, current), "string");
expect("thresholdConflict: amber at its target is fine", thresholdConflict("cc.ops.delivery_rate.amber", 0.95, current), null);
expect("thresholdConflict: a sensible target is fine", thresholdConflict("cc.growth.activation_rate.target", 0.3, current), null);
expect("thresholdConflict: critical above the minimum is refused", typeof thresholdConflict("cc.finance.ops_reserve_critical", 900_000, current), "string");
expect("thresholdConflict: minimum below critical is refused", typeof thresholdConflict("cc.finance.ops_reserve_min", 50_000, current), "string");
expect("thresholdConflict: a higher minimum is fine", thresholdConflict("cc.finance.ops_reserve_min", 200_000, current), null);

// ── Phase 3 / Phase 4 rules the Command Center mirrors (derive.ts) ────────

expect("correction round: legacy only, two rounds done → round 3", currentCorrectionRound(0, 2), 3);
expect("correction round: Phase 4 row 3 open, counter 2", currentCorrectionRound(3, 2), 3);
expect("correction round: first round", currentCorrectionRound(0, 0), 1);
expect("correction round: table ahead of the counter", currentCorrectionRound(2, 0), 2);
expect("three rounds are included", MAX_CORRECTION_ROUNDS, 3);

const due = new Date("2026-09-20T22:59:00Z");
expect("on time: delivered at the deadline", deliveredOnTime(due, due), true);
expect("on time: a minute late", deliveredOnTime(new Date(due.getTime() + 60_000), due), false);
expect("on time: no internal deadline is not judged", deliveredOnTime(due, null), null);
expect("on time: not delivered is not judged", deliveredOnTime(null, due), null);

expect("accepted: clean delivery", supervisorAccepted({ status: "DELIVERED", supervisorCorrectionCount: 0, correctionRounds: 0 }), true);
expect("accepted: in corrections now", supervisorAccepted({ status: "SUPERVISOR_CORRECTIONS", supervisorCorrectionCount: 0, correctionRounds: 1 }), false);
expect("accepted: an older round on the counter", supervisorAccepted({ status: "COMPLETED", supervisorCorrectionCount: 1, correctionRounds: 0 }), false);
expect("accepted: a round in the Phase 4 table", supervisorAccepted({ status: "DELIVERED", supervisorCorrectionCount: 0, correctionRounds: 1 }), false);

expect("ratePercent rounds like the Operations report", ratePercent(2, 3), 67);
expect("ratePercent of nothing is null", ratePercent(0, 0), null);

expect("quarterKeyOf: last minute of Q3 (UTC)", quarterKeyOf(new Date("2026-09-30T23:30:00Z")), "Q3-2026");
expect("quarterKeyOf: first instant of Q4", quarterKeyOf(new Date("2026-10-01T00:00:00Z")), "Q4-2026");
expect("quarterSpan Q3", quarterSpan("Q3-2026"), {
  key: "Q3-2026",
  label: "Q3 2026",
  start: "2026-07-01T00:00:00.000Z",
  end: "2026-10-01T00:00:00.000Z",
  payoutMonth: "2026-10",
});
expect("quarterSpan Q4 pays in January", quarterSpan("Q4-2026")?.payoutMonth, "2027-01");
expect("quarterSpan rejects other keys", quarterSpan("2026-Q3"), null);
expect("previousQuarterKey over a year end", previousQuarterKey("Q1-2027"), "Q4-2026");
expect("platinum bonus key → quarter", platinumBonusQuarter("platinum:Q3-2026:amb1"), "Q3-2026");
expect("challenge bonus key is not Platinum", platinumBonusQuarter("challenge:Q3-2026:amb1"), null);
expect("no bonus key", platinumBonusQuarter(null), null);

const wk = [
  { start: new Date("2026-09-06T23:00:00Z"), end: new Date("2026-09-13T23:00:00Z") },
  { start: new Date("2026-09-13T23:00:00Z"), end: new Date("2026-09-20T23:00:00Z") },
];
const posts = [
  { contentType: "MONDAY_FLIER", postedAt: new Date("2026-09-07T08:00:00Z") },
  { contentType: "MONDAY_FLIER", postedAt: new Date("2026-09-07T18:00:00Z") },
  { contentType: "WEDS_CHECKIN", postedAt: new Date("2026-09-09T08:00:00Z") },
  { contentType: "FRIDAY_SPOTLIGHT", postedAt: new Date("2026-09-11T08:00:00Z") },
  { contentType: "MONDAY_FLIER", postedAt: new Date("2026-09-14T08:00:00Z") },
  { contentType: "OTHER", postedAt: new Date("2026-09-15T08:00:00Z") },
  { contentType: "FRIDAY_SPOTLIGHT", postedAt: new Date("2026-09-20T23:30:00Z") },
];
expect("content consistency: a second flier does not cover a missing post; OTHER and next week do not count",
  contentConsistencyOf(wk, posts), { made: 4, expected: 6, weeks: 2, rate: 67 });
expect("content consistency with no weeks", contentConsistencyOf([], posts).rate, null);

expect("worker flags: two open flags are on track", ragStatus("lower", 2, WORKER_FLAGS_MAX, WORKER_FLAGS_MAX), "green");
expect("worker flags: three are off track", ragStatus("lower", 3, WORKER_FLAGS_MAX, WORKER_FLAGS_MAX), "red");

expect("schemaHas: a model this build has", schemaHas([{ model: "Project", fields: ["projectId", "internalDeadline"] }]), true);
expect("schemaHas: an unknown field", schemaHas([{ model: "Project", fields: ["noSuchField"] }]), false);
expect("schemaHas: an unknown model", schemaHas([{ model: "NoSuchModel" }]), false);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("Command Center rules and time maths check out.");
