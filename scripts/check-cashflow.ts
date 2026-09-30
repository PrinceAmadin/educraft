/**
 * Proves the cashflow structure rules (src/lib/finance/cashflow-rules.ts) with
 * no database: version 1 validates clean, each rule fails exactly its code,
 * auto-balance, the diff, the hash, and the seed merge.
 *
 *   npm run check:cashflow
 */
import { DEFAULT_CASHFLOW } from "../src/lib/finance/cashflow-default";
import {
  autoBalance,
  canonicalHash,
  coreOverrideFor,
  diffStructures,
  downpaymentCeiling,
  downpaymentExposure,
  founderDistributionShareOfRevenue,
  hasErrors,
  levelTotal,
  tiersChanged,
  validateStructure,
  type Violation,
} from "../src/lib/finance/cashflow-rules";
import type { CashflowStructure, Level1Row } from "../src/lib/finance/cashflow-types";
import { cashflowStructureSchema } from "../src/lib/validations/cashflow";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  }
}
const s = DEFAULT_CASHFLOW;
const errors = (v: Violation[]) => v.filter((x) => x.severity === "error").map((x) => x.code);
const warnings = (v: Violation[]) => v.filter((x) => x.severity === "warn").map((x) => x.code);
const clone = (): CashflowStructure => JSON.parse(JSON.stringify(s));
const withL1 = (edit: (rows: Level1Row[]) => void): CashflowStructure => {
  const c = clone();
  edit(c.level1);
  return c;
};

// ── Version 1 is clean ───────────────────────────────────────────────────
expect("v1 has no errors", errors(validateStructure(s)), []);
expect("v1 warns only about the unfunded draw tiers (the founder's rule)", [...new Set(warnings(validateStructure(s)))], ["DRAW_UNFUNDED"]);
expect("v1 passes the strict zod shape", cashflowStructureSchema.safeParse(s).success, true);
expect("an unknown field is refused by the shape", cashflowStructureSchema.safeParse({ ...s, extra: 1 }).success, false);
expect("level totals", [levelTotal(s.level1), levelTotal(s.level2), levelTotal(s.level3.filter((p) => p.parentKey === "OPERATIONS_RESERVE"))], [100, 100, 100]);
expect("the inactive Growth Associate is not counted", levelTotal(s.level1.map((r) => (r.key === "growth_associate" ? { ...r, percentage: 50 } : r))), 100);

// ── X-10% ────────────────────────────────────────────────────────────────
expect("downpayment exposure is the ambassador's 15", downpaymentExposure(s), 15);
expect("ceiling is 45 − 10", downpaymentCeiling(s), 35);
expect("moving the workers to the downpayment breaks X-10%", errors(validateStructure(withL1((r) => { r.find((x) => x.key === "workers")!.trigger = "downpayment"; }))), ["X10"]);
expect("HOG at the downpayment (17.5) still fits", errors(validateStructure(withL1((r) => { r.find((x) => x.key === "hog")!.trigger = "downpayment"; }))), []);

// ── Sums ─────────────────────────────────────────────────────────────────
expect("102% at level 1 fails with the overage named", validateStructure(withL1((r) => { r.find((x) => x.key === "hog")!.percentage = 3.5; r.find((x) => x.key === "coo")!.percentage = 3.5; })).find((v) => v.code === "SUM_100")?.message, "Revenue split adds up to 102%, not 100% (over by 2%)");
expect("a bucket total of 99 fails", errors(validateStructure({ ...s, level2: s.level2.map((b) => (b.key === "GROWTH_FUND" ? { ...b, percentage: 16.5 } : b)) })), ["SUM_100"]);
expect("pots that add to 90 fail for their bucket", validateStructure({ ...s, level3: s.level3.map((p) => (p.key === "emergencies" ? { ...p, percentage: 15 } : p)) }).filter((v) => v.code === "SUM_100").map((v) => v.rowKey), ["OPERATIONS_RESERVE"]);
expect("a bucket with no pots is fine", errors(validateStructure({ ...s, level3: [] })), []);
expect("percentages over 100 or with three decimals are refused", errors(validateStructure(withL1((r) => { r.find((x) => x.key === "coo")!.percentage = 2.555; }))).includes("PERCENT_RANGE"), true);

// ── Absorbers and rows ───────────────────────────────────────────────────
expect("a person cannot absorb", errors(validateStructure(withL1((r) => { r.find((x) => x.key === "workers")!.isAbsorber = true; }))).includes("PERSON_ABSORBER"), true);
expect("EduCraft retains is required", errors(validateStructure({ ...s, level1: s.level1.filter((r) => r.key !== "educraft_retained") })).includes("RETAINED_MISSING"), true);
expect("an active custom person row needs an assignee", errors(validateStructure(withL1((r) => { const ga = r.find((x) => x.key === "growth_associate")!; ga.active = true; r.find((x) => x.key === "educraft_retained")!.percentage = 38; }))), ["ASSIGNEE_MISSING"]);
expect("an assigned, active Growth Associate at 2% with retained at 38 is clean", errors(validateStructure(withL1((r) => { const ga = r.find((x) => x.key === "growth_associate")!; ga.active = true; ga.assignedUserId = "u1"; r.find((x) => x.key === "educraft_retained")!.percentage = 38; }))), []);
expect("two rows cannot pay the COO", errors(validateStructure(withL1((r) => { r.push({ key: "coo2", label: "COO again", percentage: 0, displayOrder: 9, kind: "person", recipients: "role", role: "COO", trigger: "completion" }); }))).includes("ROLE_TWICE"), true);
expect("a duplicate key is refused", errors(validateStructure(withL1((r) => { r.push({ ...r[0], key: "workers" }); }))).includes("DUPLICATE_KEY"), true);
expect("a key with money on it cannot be deleted", errors(validateStructure({ ...s, level1: s.level1.filter((r) => r.key !== "hog").map((r) => (r.key === "educraft_retained" ? { ...r, percentage: 42.5 } : r)) }, { previous: s, keysWithRecords: ["hog"] })).includes("KEY_IN_USE"), true);

// ── Tiers and overrides ──────────────────────────────────────────────────
expect("a gap between Bronze and Silver", errors(validateStructure({ ...s, tiers: s.tiers.map((t) => (t.key === "SILVER" ? { ...t, minConversions: 8 } : t)) })), ["TIER_GAP"]);
expect("an overlap is named too", validateStructure({ ...s, tiers: s.tiers.map((t) => (t.key === "SILVER" ? { ...t, minConversions: 4 } : t)) }).find((v) => v.code === "TIER_GAP")?.message, "Bronze and Silver overlap");
expect("Platinum keeps no maximum", errors(validateStructure({ ...s, tiers: s.tiers.map((t) => (t.key === "PLATINUM" ? { ...t, maxConversions: 60 } : t)) })), ["TIER_TOP"]);
expect("the four tiers are fixed", errors(validateStructure({ ...s, tiers: s.tiers.slice(0, 3) })).includes("TIER_SET"), true);
expect("a tier rate above the ambassador total must be reconciled", errors(validateStructure({ ...s, tiers: s.tiers.map((t) => (t.key === "GOLD" ? { ...t, ratePercent: 16 } : t)) })), ["OVERRIDE_RECONCILE"]);
expect("derived overrides", [10, 12, 15, 15].map((r) => coreOverrideFor(r, s)), [5, 3, 0, 0]);
expect("raising the ambassador row to 16 raises every override by 1", [10, 12, 15].map((r) => coreOverrideFor(r, withL1((rows) => { rows.find((x) => x.key === "ambassador")!.percentage = 16; rows.find((x) => x.key === "educraft_retained")!.percentage = 39; }))), [6, 4, 1]);

// ── Draw tiers ───────────────────────────────────────────────────────────
expect("Founder Distribution is 11% of revenue", founderDistributionShareOfRevenue(s), 0.11);
expect("the ₦1M tier cannot self-fund ₦75K × 2 (warn, never block)", validateStructure(s).some((v) => v.code === "DRAW_UNFUNDED" && v.message.includes("₦1,000,000") && v.message.includes("₦110,000")), true);
expect("a self-funding tier does not warn", warnings(validateStructure({ ...s, founderDrawTiers: [{ minRevenueNgn: 0, maxRevenueNgn: null, drawPerFounderNgn: 0 }] })), []);
expect("a gap in the draw tiers", errors(validateStructure({ ...s, founderDrawTiers: s.founderDrawTiers.map((d, i) => (i === 1 ? { ...d, minRevenueNgn: 600_000 } : d)) })), ["DRAW_GAP"]);
expect("the first draw tier must start at 0", errors(validateStructure({ ...s, founderDrawTiers: s.founderDrawTiers.slice(1) })).includes("DRAW_GAP"), true);

// ── Triggers ─────────────────────────────────────────────────────────────
expect("a buffer as big as the downpayment is refused (and leaves no room under X-10%)", errors(validateStructure({ ...s, triggers: { downpaymentPercent: 45, bufferPercent: 45 } })), ["X10", "BUFFER_TOO_BIG"]);
expect("an active service below the baseline warns", warnings(validateStructure(s, { minServiceDownpayment: 40 })).includes("SERVICE_BELOW_BASELINE"), true);

// ── Auto-balance ─────────────────────────────────────────────────────────
const over = withL1((r) => { r.find((x) => x.key === "hog")!.percentage = 3.5; r.find((x) => x.key === "coo")!.percentage = 3.5; });
const balanced = autoBalance(over, { level: "level1" });
expect("auto-balance moves the 2% off EduCraft retains", balanced.ok && [balanced.structure.level1.find((r) => r.key === "educraft_retained")!.percentage, balanced.moved, balanced.absorberKey], [38, -2, "educraft_retained"]);
expect("balanced structure is clean", balanced.ok ? errors(validateStructure(balanced.structure)) : ["not ok"], []);
expect("nothing to move when already 100", (() => { const r = autoBalance(s, { level: "level1" }); return r.ok && r.moved; })(), 0);
expect("auto-balance refuses when the absorber would go negative", (() => { const r = autoBalance(withL1((rows) => { rows.find((x) => x.key === "workers")!.percentage = 90; }), { level: "level1" }); return r.ok ? "ok" : r.error.includes("below 0"); })(), true);
expect("auto-balance refuses without an absorber", (() => { const r = autoBalance({ ...s, level2: s.level2.map((b) => ({ ...b, isAbsorber: false, percentage: b.key === "GROWTH_FUND" ? 18 : b.percentage })) }, { level: "level2" }); return r.ok ? "ok" : r.error; })(), "Choose a default absorber first");
expect("a pot level balances on its absorber", (() => { const r = autoBalance({ ...s, level3: s.level3.map((p) => (p.key === "claude_api" ? { ...p, percentage: 50 } : p)) }, { level: "level3", bucket: "OPERATIONS_RESERVE" }); return r.ok && r.structure.level3.find((p) => p.key === "emergencies")!.percentage; })(), 15);
expect("auto-balance refuses a person absorber", (() => { const r = autoBalance(withL1((rows) => { rows.find((x) => x.key === "educraft_retained")!.isAbsorber = false; rows.find((x) => x.key === "workers")!.isAbsorber = true; rows.find((x) => x.key === "hog")!.percentage = 3; }), { level: "level1" }); return r.ok ? "ok" : r.error.includes("person"); })(), true);

// ── Diff, hash ───────────────────────────────────────────────────────────
const v2 = withL1((r) => { r.find((x) => x.key === "hog")!.percentage = 3; r.find((x) => x.key === "educraft_retained")!.percentage = 39.5; });
expect("the diff names the two changed rows", diffStructures(s, v2).map((d) => `${d.label}: ${d.from} → ${d.to}`), ["Head of Growth: 2.5% · completion → 3% · completion", "EduCraft retains: 40% · absorber → 39.5% · absorber"]);
expect("a new pot shows as added", diffStructures(s, { ...s, level3: [...s.level3, { key: "legal", label: "Legal", parentKey: "REINVESTMENT_FUND", percentage: 100, isTrackedAsPot: true }] }).map((d) => [d.label, d.from, d.to]), [["Legal", null, "100% of reinvestment fund"]]);
expect("tier changes are detected for the recount", [tiersChanged(s, v2), tiersChanged(s, { ...s, tiers: s.tiers.map((t) => (t.key === "SILVER" ? { ...t, ratePercent: 13 } : t)) })], [false, true]);
expect("the hash ignores key order and is stable", [canonicalHash(s) === canonicalHash(JSON.parse(JSON.stringify(s))), canonicalHash(s) === canonicalHash(v2), canonicalHash(s).length], [true, false, 16]);

// ── The seed's merge of a live Settings override ─────────────────────────
const merged: CashflowStructure = { ...s, tiers: s.tiers.map((t) => (t.key === "SILVER" ? { ...t, ratePercent: 13 } : t)) };
expect("a Silver override of 13% still validates", errors(validateStructure(merged)), []);
expect("…and its override is 2", coreOverrideFor(13, merged), 2);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`Cashflow structure rules hold (${hasErrors(validateStructure(s)) ? "v1 has errors!" : "v1 clean"}).`);
