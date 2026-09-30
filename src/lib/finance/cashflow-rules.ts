import type { AmbassadorTier, BucketType } from "@prisma/client";
import {
  BUCKET_KEYS,
  LEVEL1,
  TIER_KEYS,
  TIER_LABELS,
  isActiveRow,
  level1Row,
  potsOf,
  retainedFraction,
  type BucketRow,
  type CashflowStructure,
  type Level1Row,
  type PotRow,
} from "@/lib/finance/cashflow-types";

/**
 * The rules a cashflow structure must satisfy before it can be published.
 * Pure: the settings form runs them on every keystroke, the publish route
 * runs them again, and `npm run check:cashflow` proves each one.
 *
 * "error" blocks publishing; "warn" is shown and allowed.
 */

export type Severity = "error" | "warn";
export type ViolationLevel = "level1" | "level2" | "level3" | "tiers" | "overrides" | "bonuses" | "draws" | "triggers" | "structure";

export interface Violation {
  code: string;
  level: ViolationLevel;
  severity: Severity;
  message: string;
  rowKey?: string;
}

export interface ValidationContext {
  /** The version being replaced: keys may not be renamed or dropped while money references them. */
  previous?: CashflowStructure | null;
  /** The lowest downpayment % among ACTIVE services (a service below the baseline weakens the X-10% rule). */
  minServiceDownpayment?: number | null;
  /** Level-1 keys that PayoutRecords already reference (a row with money on it cannot be deleted). */
  keysWithRecords?: readonly string[];
}

/** Percentages carry at most two decimals: 33.333 is a typo, 12.5 is not. */
const TOLERANCE = 0.005;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function levelTotal(rows: readonly { percentage: number; active?: boolean }[]): number {
  return round2(rows.filter(isActiveRow).reduce((s, r) => s + r.percentage, 0));
}

function validPercent(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

/** Σ of the people rows owed at the downpayment — what the X-10% rule measures. */
export function downpaymentExposure(s: CashflowStructure): number {
  return round2(s.level1.filter((r) => r.kind === "person" && isActiveRow(r) && r.trigger === "downpayment").reduce((sum, r) => sum + r.percentage, 0));
}

/** The ceiling the downpayment-triggered rows must stay under. */
export function downpaymentCeiling(s: CashflowStructure): number {
  return round2(s.triggers.downpaymentPercent - s.triggers.bufferPercent);
}

/** What the Core earns on a Sub's job at this tier rate: the ambassador total less the Sub's rate, never negative. */
export function coreOverrideFor(subTierRatePercent: number, s: CashflowStructure): number {
  const total = level1Row(s, LEVEL1.ambassador);
  const ambassadorPercent = total && isActiveRow(total) ? total.percentage : 0;
  return round2(Math.max(0, ambassadorPercent - subTierRatePercent));
}

/** Founder Distribution's share of a project's price: its share of the retained share (27.5% × 40% = 11%). */
export function founderDistributionShareOfRevenue(s: CashflowStructure): number {
  const fd = s.level2.find((b) => b.key === "FOUNDER_DISTRIBUTION");
  return fd ? round2((fd.percentage / 100) * retainedFraction(s) * 100) / 100 : 0;
}

export function validateStructure(s: CashflowStructure, ctx: ValidationContext = {}): Violation[] {
  const out: Violation[] = [];
  const err = (code: string, level: ViolationLevel, message: string, rowKey?: string) => out.push({ code, level, severity: "error", message, rowKey });
  const warn = (code: string, level: ViolationLevel, message: string, rowKey?: string) => out.push({ code, level, severity: "warn", message, rowKey });

  // ── Shape ──
  if (s.schemaVersion !== 1) err("SCHEMA_VERSION", "structure", "Unknown structure version");
  for (const [level, rows] of [["level1", s.level1], ["level2", s.level2], ["level3", s.level3]] as const) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!/^[a-z][a-z0-9_]{1,39}$/i.test(row.key)) err("BAD_KEY", level, `"${row.key}" is not a valid key (letters, numbers and underscores)`, row.key);
      if (seen.has(row.key)) err("DUPLICATE_KEY", level, `Two rows share the key "${row.key}"`, row.key);
      seen.add(row.key);
      if (!row.label?.trim()) err("MISSING_LABEL", level, `Row "${row.key}" needs a name`, row.key);
      if (!validPercent(row.percentage)) err("PERCENT_RANGE", level, `${row.label || row.key}: the percentage must be between 0 and 100 (two decimals at most)`, row.key);
    }
  }

  // ── Level 1 ──
  const retained = level1Row(s, LEVEL1.retained);
  if (!retained || retained.kind !== "fund") err("RETAINED_MISSING", "level1", 'The "EduCraft retains" row is required');
  const funds = s.level1.filter((r) => r.kind === "fund");
  if (funds.length > 1) err("ONE_FUND_ROW", "level1", "Level 1 holds one fund row (EduCraft retains); other rows are people");
  for (const row of s.level1) {
    if (row.kind !== "person") continue;
    if (!row.recipients) err("RECIPIENTS_MISSING", "level1", `${row.label}: say who this row pays`, row.key);
    if (!row.trigger) err("TRIGGER_MISSING", "level1", `${row.label}: choose when it becomes owed`, row.key);
    if (row.recipients === "role" && !row.role) err("ROLE_MISSING", "level1", `${row.label}: pick the executive role`, row.key);
    if (row.recipients === "user" && isActiveRow(row) && !row.assignedUserId) err("ASSIGNEE_MISSING", "level1", `${row.label}: assign the person this row pays`, row.key);
    if (row.isAbsorber) err("PERSON_ABSORBER", "level1", `${row.label} is a person's commission and cannot absorb the balance`, row.key);
  }
  const l1Total = levelTotal(s.level1);
  if (Math.abs(l1Total - 100) > TOLERANCE) err("SUM_100", "level1", `Revenue split adds up to ${l1Total}%, not 100%${l1Total > 100 ? ` (over by ${round2(l1Total - 100)}%)` : ` (short by ${round2(100 - l1Total)}%)`}`);
  if (s.level1.filter((r) => r.recipients === "workers").length !== 1) err("WORKERS_ROW", "level1", "Exactly one row pays the workers");
  if (s.level1.filter((r) => r.recipients === "ambassadors").length !== 1) err("AMBASSADOR_ROW", "level1", "Exactly one row pays the ambassadors");
  for (const role of ["HOG", "COO"] as const) {
    if (s.level1.filter((r) => r.recipients === "role" && r.role === role).length > 1) err("ROLE_TWICE", "level1", `Two rows pay the ${role}`);
  }

  // ── X-10% ──
  const exposure = downpaymentExposure(s);
  const ceiling = downpaymentCeiling(s);
  if (exposure > ceiling + TOLERANCE) {
    err("X10", "triggers", `Downpayment-triggered commissions (${exposure}%) exceed the safety limit (${ceiling}%). Move some to full payment or completion, or reduce percentages.`);
  }

  // ── Level 2 ──
  const l2Keys = s.level2.map((b) => b.key);
  for (const key of BUCKET_KEYS) if (!l2Keys.includes(key)) err("BUCKET_MISSING", "level2", `The ${key.replace(/_/g, " ").toLowerCase()} bucket is required`);
  for (const key of l2Keys) if (!BUCKET_KEYS.includes(key)) err("BUCKET_UNKNOWN", "level2", `"${key}" is not one of the four buckets`, key);
  const l2Total = levelTotal(s.level2);
  if (Math.abs(l2Total - 100) > TOLERANCE) err("SUM_100", "level2", `Bucket allocation adds up to ${l2Total}% of the retained share, not 100%${l2Total > 100 ? ` (over by ${round2(l2Total - 100)}%)` : ` (short by ${round2(100 - l2Total)}%)`}`);

  // ── Level 3 ──
  for (const pot of s.level3) {
    if (!BUCKET_KEYS.includes(pot.parentKey)) err("POT_PARENT", "level3", `${pot.label}: its bucket "${pot.parentKey}" does not exist`, pot.key);
  }
  for (const bucket of BUCKET_KEYS) {
    const pots = potsOf(s, bucket);
    if (pots.length === 0) continue;
    const total = levelTotal(pots);
    if (Math.abs(total - 100) > TOLERANCE) {
      const label = s.level2.find((b) => b.key === bucket)?.label ?? bucket;
      err("SUM_100", "level3", `${label}'s pots add up to ${total}%, not 100%${total > 100 ? ` (over by ${round2(total - 100)}%)` : ` (short by ${round2(100 - total)}%)`}`, bucket);
    }
  }

  // ── Tiers ──
  const tiers = [...s.tiers].sort((a, b) => a.minConversions - b.minConversions);
  if (tiers.length !== TIER_KEYS.length || TIER_KEYS.some((k) => !tiers.find((t) => t.key === k))) err("TIER_SET", "tiers", "The four tiers (Bronze, Silver, Gold, Platinum) are fixed; only their thresholds and rates change");
  for (const [i, t] of tiers.entries()) {
    if (!Number.isInteger(t.minConversions) || t.minConversions < 0) err("TIER_MIN", "tiers", `${TIER_LABELS[t.key]}: the minimum must be a whole number of conversions`, t.key);
    if (t.maxConversions != null && (!Number.isInteger(t.maxConversions) || t.maxConversions < t.minConversions)) err("TIER_MAX", "tiers", `${TIER_LABELS[t.key]}: the maximum must be at least the minimum`, t.key);
    if (!validPercent(t.ratePercent)) err("PERCENT_RANGE", "tiers", `${TIER_LABELS[t.key]}: the rate must be between 0 and 100`, t.key);
    const next = tiers[i + 1];
    if (i === 0 && t.minConversions !== 0) err("TIER_GAP", "tiers", `${TIER_LABELS[t.key]} must start at 0 conversions`, t.key);
    if (next) {
      if (t.maxConversions == null) err("TIER_OPEN", "tiers", `${TIER_LABELS[t.key]} needs a maximum, since ${TIER_LABELS[next.key]} comes after it`, t.key);
      else if (next.minConversions !== t.maxConversions + 1) {
        err("TIER_GAP", "tiers", next.minConversions > t.maxConversions + 1 ? `Gap between ${TIER_LABELS[t.key]} (to ${t.maxConversions}) and ${TIER_LABELS[next.key]} (from ${next.minConversions})` : `${TIER_LABELS[t.key]} and ${TIER_LABELS[next.key]} overlap`, next.key);
      }
    } else if (t.maxConversions != null) err("TIER_TOP", "tiers", `${TIER_LABELS[t.key]} is the top tier and has no maximum`, t.key);
    if (t.key === "PLATINUM" && tiers[tiers.length - 1]?.key !== "PLATINUM") err("TIER_ORDER", "tiers", "Platinum must be the top tier");
  }
  // Tier order by key must match order by threshold.
  const byKey = TIER_KEYS.map((k) => tiers.findIndex((t) => t.key === k));
  if (byKey.some((idx, i) => idx !== i) && !out.some((v) => v.code === "TIER_SET")) err("TIER_ORDER", "tiers", "Tiers must rise in the order Bronze, Silver, Gold, Platinum");

  // ── Overrides (derived from tiers + the ambassador total) ──
  const ambassadorRow = level1Row(s, LEVEL1.ambassador);
  const ambassadorPercent = ambassadorRow && isActiveRow(ambassadorRow) ? ambassadorRow.percentage : 0;
  for (const t of s.tiers) {
    if (t.ratePercent > ambassadorPercent + TOLERANCE) {
      err("OVERRIDE_RECONCILE", "overrides", `${TIER_LABELS[t.key]} earns ${t.ratePercent}%, more than the ${ambassadorPercent}% EduCraft pays ambassadors in total. Raise the Ambassador row or lower the tier rate.`, t.key);
    }
  }

  // ── Bonuses ──
  const bonusKeys = new Set<string>();
  for (const b of s.bonuses) {
    if (!/^[a-z][a-z0-9_]{1,39}$/i.test(b.key)) err("BAD_KEY", "bonuses", `"${b.key}" is not a valid key`, b.key);
    if (bonusKeys.has(b.key)) err("DUPLICATE_KEY", "bonuses", `Two bonuses share the key "${b.key}"`, b.key);
    bonusKeys.add(b.key);
    if (!b.label?.trim()) err("MISSING_LABEL", "bonuses", `Bonus "${b.key}" needs a name`, b.key);
    if (!Number.isFinite(b.amountNgn) || b.amountNgn < 0 || !Number.isInteger(b.amountNgn)) err("AMOUNT", "bonuses", `${b.label || b.key}: the amount must be whole naira, 0 or more`, b.key);
    if (b.target != null && (!Number.isInteger(b.target) || b.target < 1)) err("TARGET", "bonuses", `${b.label || b.key}: the target must be a whole number of clients`, b.key);
  }

  // ── Draw tiers ──
  const draws = [...s.founderDrawTiers].sort((a, b) => a.minRevenueNgn - b.minRevenueNgn);
  if (draws.length === 0) err("DRAWS_EMPTY", "draws", "At least one draw tier is needed");
  for (const [i, d] of draws.entries()) {
    if (!Number.isFinite(d.minRevenueNgn) || d.minRevenueNgn < 0) err("DRAW_MIN", "draws", `Draw tier ${i + 1}: the revenue floor must be 0 or more`);
    if (d.maxRevenueNgn != null && d.maxRevenueNgn < d.minRevenueNgn) err("DRAW_MAX", "draws", `Draw tier ${i + 1}: the ceiling must be at least the floor`);
    if (!Number.isFinite(d.drawPerFounderNgn) || d.drawPerFounderNgn < 0 || !Number.isInteger(d.drawPerFounderNgn)) err("DRAW_AMOUNT", "draws", `Draw tier ${i + 1}: the draw must be whole naira, 0 or more`);
    if (i === 0 && d.minRevenueNgn !== 0) err("DRAW_GAP", "draws", "The first draw tier must start at ₦0");
    const next = draws[i + 1];
    if (next) {
      if (d.maxRevenueNgn == null) err("DRAW_OPEN", "draws", `Draw tier ${i + 1} needs a ceiling, since another tier comes after it`);
      else if (next.minRevenueNgn !== d.maxRevenueNgn + 1) err("DRAW_GAP", "draws", next.minRevenueNgn > d.maxRevenueNgn + 1 ? `Gap between draw tiers ${i + 1} and ${i + 2}` : `Draw tiers ${i + 1} and ${i + 2} overlap`);
    } else if (d.maxRevenueNgn != null) err("DRAW_TOP", "draws", "The top draw tier has no ceiling");
    // Founder's rule (30 Sept 2026): warn when a tier's floor cannot fund the two draws.
    const share = founderDistributionShareOfRevenue(s);
    if (d.drawPerFounderNgn > 0 && d.minRevenueNgn * share < 2 * d.drawPerFounderNgn) {
      warn("DRAW_UNFUNDED", "draws", `At ₦${d.minRevenueNgn.toLocaleString("en-NG")} revenue Founder Distribution receives ₦${Math.round(d.minRevenueNgn * share).toLocaleString("en-NG")}, less than the two draws of ₦${d.drawPerFounderNgn.toLocaleString("en-NG")} each.`);
    }
  }

  // ── Triggers ──
  if (!validPercent(s.triggers.downpaymentPercent) || s.triggers.downpaymentPercent <= 0) err("PERCENT_RANGE", "triggers", "The downpayment percent must be between 0 and 100");
  if (!validPercent(s.triggers.bufferPercent)) err("PERCENT_RANGE", "triggers", "The safety buffer must be between 0 and 100");
  if (s.triggers.bufferPercent >= s.triggers.downpaymentPercent) err("BUFFER_TOO_BIG", "triggers", "The safety buffer must be smaller than the downpayment percent");
  if (ctx.minServiceDownpayment != null && ctx.minServiceDownpayment < s.triggers.downpaymentPercent) {
    warn("SERVICE_BELOW_BASELINE", "triggers", `An active service takes a ${ctx.minServiceDownpayment}% downpayment, below the ${s.triggers.downpaymentPercent}% this rule assumes.`);
  }

  // ── Against the previous version: keys are immutable while money references them ──
  if (ctx.previous) {
    for (const row of ctx.previous.level1) {
      if (row.kind !== "person") continue;
      const still = level1Row(s, row.key);
      if (!still && ctx.keysWithRecords?.includes(row.key)) err("KEY_IN_USE", "level1", `"${row.label}" has payout records and cannot be deleted; make it inactive instead`, row.key);
    }
    if (ctx.previous.level1.some((r) => r.key === LEVEL1.retained) && !retained) err("RETAINED_MISSING", "level1", 'The "EduCraft retains" row cannot be removed');
  }

  return out;
}

export function hasErrors(violations: readonly Violation[]): boolean {
  return violations.some((v) => v.severity === "error");
}

// ── Auto-balance ─────────────────────────────────────────────────────────

export type BalanceTarget = { level: "level1" } | { level: "level2" } | { level: "level3"; bucket: BucketType };

export type BalanceResult = { ok: true; structure: CashflowStructure; absorberKey: string; moved: number } | { ok: false; error: string };

/**
 * Subtract the overage (or add the shortfall) on the level's absorber row so
 * the level sums to 100%. Refuses a person absorber, an absorber that would
 * go below 0, and a Level-1 change that would breach the X-10% rule.
 */
export function autoBalance(s: CashflowStructure, target: BalanceTarget): BalanceResult {
  type Row = Level1Row | BucketRow | PotRow;
  const rows: Row[] = target.level === "level1" ? s.level1 : target.level === "level2" ? s.level2 : potsOf(s, target.bucket);
  const absorber = rows.find((r) => r.isAbsorber && isActiveRow(r as { active?: boolean }));
  if (!absorber) return { ok: false, error: "Choose a default absorber first" };
  if ("kind" in absorber && absorber.kind === "person") return { ok: false, error: `${absorber.label} is a person's commission and cannot absorb the balance` };
  const total = levelTotal(rows as { percentage: number; active?: boolean }[]);
  const moved = round2(100 - total);
  if (moved === 0) return { ok: true, structure: s, absorberKey: absorber.key, moved: 0 };
  const newPercent = round2(absorber.percentage + moved);
  if (newPercent < 0) return { ok: false, error: `${absorber.label} would go below 0% (it holds ${absorber.percentage}%, the overage is ${round2(-moved)}%)` };
  if (newPercent > 100) return { ok: false, error: `${absorber.label} would go above 100%` };
  const key = absorber.key;
  const next: CashflowStructure =
    target.level === "level1"
      ? { ...s, level1: s.level1.map((r) => (r.key === key ? { ...r, percentage: newPercent } : r)) }
      : target.level === "level2"
        ? { ...s, level2: s.level2.map((r) => (r.key === key ? { ...r, percentage: newPercent } : r)) }
        : { ...s, level3: s.level3.map((p) => (p.key === key && p.parentKey === target.bucket ? { ...p, percentage: newPercent } : p)) };
  if (target.level === "level1" && downpaymentExposure(next) > downpaymentCeiling(next) + TOLERANCE) {
    return { ok: false, error: `Balancing would push downpayment-triggered commissions to ${downpaymentExposure(next)}%, over the ${downpaymentCeiling(next)}% limit` };
  }
  return { ok: true, structure: next, absorberKey: absorber.key, moved };
}

// ── Diff ─────────────────────────────────────────────────────────────────

export interface DiffLine {
  section: ViolationLevel;
  label: string;
  from: string | null;
  to: string | null;
}

const pct = (n: number) => `${round2(n)}%`;
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function rowDiffs<T extends { key: string; label: string }>(section: ViolationLevel, before: readonly T[], after: readonly T[], describe: (row: T) => string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const b of before) {
    const a = after.find((r) => r.key === b.key);
    if (!a) lines.push({ section, label: b.label, from: describe(b), to: null });
    else if (describe(a) !== describe(b) || a.label !== b.label) lines.push({ section, label: a.label, from: describe(b), to: describe(a) });
  }
  for (const a of after) if (!before.find((r) => r.key === a.key)) lines.push({ section, label: a.label, from: null, to: describe(a) });
  return lines;
}

/** The human-readable changes between two structures, for the publish modal and the audit log. */
export function diffStructures(before: CashflowStructure, after: CashflowStructure): DiffLine[] {
  const l1 = (r: Level1Row) => `${pct(r.percentage)}${r.kind === "person" ? ` · ${r.trigger ?? "?"}` : ""}${isActiveRow(r) ? "" : " · inactive"}${r.recipients === "user" ? ` · ${r.assignedUserId ? "assigned" : "unassigned"}` : ""}${r.isAbsorber ? " · absorber" : ""}`;
  const l2 = (r: BucketRow) => `${pct(r.percentage)} of retained${r.isAbsorber ? " · absorber" : ""}`;
  const l3 = (r: PotRow) => `${pct(r.percentage)} of ${r.parentKey.replace(/_/g, " ").toLowerCase()}${r.isTrackedAsPot ? "" : " · not tracked"}${r.isAbsorber ? " · absorber" : ""}`;
  const lines = [
    ...rowDiffs("level1", before.level1, after.level1, l1),
    ...rowDiffs("level2", before.level2, after.level2, l2),
    ...rowDiffs("level3", before.level3, after.level3, l3),
  ];
  for (const key of TIER_KEYS) {
    const b = before.tiers.find((t) => t.key === key);
    const a = after.tiers.find((t) => t.key === key);
    const d = (t: typeof b) => (t ? `${t.minConversions}–${t.maxConversions ?? "∞"} conversions · ${pct(t.ratePercent)}` : null);
    if (d(a) !== d(b)) lines.push({ section: "tiers", label: TIER_LABELS[key], from: d(b), to: d(a) });
  }
  lines.push(...rowDiffs("bonuses", before.bonuses, after.bonuses, (b) => `${naira(b.amountNgn)}${b.perClient ? " per client" : ""} · ${b.cadence}${b.target ? ` · target ${b.target}` : ""}`));
  const drawText = (list: readonly { minRevenueNgn: number; maxRevenueNgn: number | null; drawPerFounderNgn: number }[]) =>
    [...list].sort((x, y) => x.minRevenueNgn - y.minRevenueNgn).map((d) => `${naira(d.minRevenueNgn)}${d.maxRevenueNgn == null ? "+" : `–${naira(d.maxRevenueNgn)}`} → ${naira(d.drawPerFounderNgn)}`).join("; ");
  if (drawText(before.founderDrawTiers) !== drawText(after.founderDrawTiers)) lines.push({ section: "draws", label: "Founder draw tiers", from: drawText(before.founderDrawTiers), to: drawText(after.founderDrawTiers) });
  if (before.triggers.downpaymentPercent !== after.triggers.downpaymentPercent) lines.push({ section: "triggers", label: "Downpayment %", from: pct(before.triggers.downpaymentPercent), to: pct(after.triggers.downpaymentPercent) });
  if (before.triggers.bufferPercent !== after.triggers.bufferPercent) lines.push({ section: "triggers", label: "Safety buffer %", from: pct(before.triggers.bufferPercent), to: pct(after.triggers.bufferPercent) });
  return lines;
}

/** Tier thresholds or rates changed: every ambassador is recounted after publishing. */
export function tiersChanged(before: CashflowStructure, after: CashflowStructure): boolean {
  return canonicalJson(before.tiers) !== canonicalJson(after.tiers);
}

// ── Canonical form and hash ──────────────────────────────────────────────

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** FNV-1a (64-bit, as hex) of the canonical JSON — the same in the browser and on the server, no crypto needed. */
export function canonicalHash(s: CashflowStructure): string {
  const text = canonicalJson(s);
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** The tier a count of conversions earns under this ladder (the lowest tier when the ladder is empty). */
export function tierForCount(conversions: number, tiers: readonly { key: AmbassadorTier; minConversions: number }[]): AmbassadorTier {
  const n = Math.max(0, Math.floor(conversions));
  let tier: AmbassadorTier = "BRONZE";
  for (const t of [...tiers].sort((a, b) => a.minConversions - b.minConversions)) if (n >= t.minConversions) tier = t.key;
  return tier;
}
