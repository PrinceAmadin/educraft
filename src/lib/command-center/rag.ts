import type { RagStatus } from "./types";

/**
 * RAG (red / amber / green) rules and the threshold settings behind them
 * (Phase 5). Pure: no database. The 14 `cc.*` Setting keys come from the
 * Command Center spec; their defaults are the spec's seed values. Rates are
 * stored as fractions ("0.95"), naira as whole numbers ("150000").
 * `src/lib/services/command-center/settings.ts` reads and writes the rows.
 */

export const THRESHOLD_KEYS = [
  "cc.ops.delivery_rate.target",
  "cc.ops.delivery_rate.amber",
  "cc.ops.qa_first_pass.target",
  "cc.ops.qa_first_pass.amber",
  "cc.ops.supervisor_accept.target",
  "cc.ops.supervisor_accept.amber",
  "cc.growth.activation_rate.target",
  "cc.growth.activation_rate.amber",
  "cc.growth.content_consistency.target",
  "cc.growth.content_consistency.amber",
  "cc.finance.ops_reserve_min",
  "cc.finance.ops_reserve_critical",
  "cc.quality.tier2_pass.target",
  "cc.quality.tier2_pass.amber",
] as const;

export type ThresholdKey = (typeof THRESHOLD_KEYS)[number];

export const THRESHOLD_DEFAULTS: Record<ThresholdKey, string> = {
  "cc.ops.delivery_rate.target": "0.95",
  "cc.ops.delivery_rate.amber": "0.85",
  "cc.ops.qa_first_pass.target": "0.80",
  "cc.ops.qa_first_pass.amber": "0.72",
  "cc.ops.supervisor_accept.target": "0.95",
  "cc.ops.supervisor_accept.amber": "0.87",
  "cc.growth.activation_rate.target": "0.25",
  "cc.growth.activation_rate.amber": "0.20",
  "cc.growth.content_consistency.target": "1.00",
  "cc.growth.content_consistency.amber": "0.85",
  "cc.finance.ops_reserve_min": "150000",
  "cc.finance.ops_reserve_critical": "80000",
  "cc.quality.tier2_pass.target": "0.85",
  "cc.quality.tier2_pass.amber": "0.78",
};

export function isThresholdKey(v: unknown): v is ThresholdKey {
  return typeof v === "string" && (THRESHOLD_KEYS as readonly string[]).includes(v);
}

/** A rate key holds a fraction 0..1 (`*.target` / `*.amber`). */
export function isRateKey(key: ThresholdKey): boolean {
  return key.endsWith(".target") || key.endsWith(".amber");
}

/** A naira key holds a whole, non-negative amount (`cc.finance.ops_reserve_*`). */
export function isNairaKey(key: ThresholdKey): boolean {
  return key.startsWith("cc.finance.ops_reserve_");
}

/** Parsed numbers: fractions for rate keys, naira for the reserve keys. */
export type ThresholdMap = Record<ThresholdKey, number>;

/**
 * The number a stored value stands for, or null when the value is missing,
 * blank, not a number or negative — in which case the default applies.
 */
export function parseThresholdValue(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * A settings fraction as the percent the metrics are in, rounded to 0.01 so
 * float noise never moves a verdict (0.55 * 100 is 55.00000000000001, and a
 * 55% month must meet a 55% target).
 */
export function fractionToPercent(fraction: number): number {
  return Math.round(fraction * 10000) / 100;
}

/** The largest naira threshold a PATCH may set (₦1 billion — the annual target). */
export const NAIRA_THRESHOLD_MAX = 1_000_000_000;

/**
 * Why a new value would contradict its sibling, or null when it is fine. A
 * watch level above its target (or a critical reserve above the minimum)
 * leaves no amber band at all, and Today would then alert on rates that meet
 * their target. Checked in the settings PATCH against the current values.
 */
export function thresholdConflict(key: ThresholdKey, value: number, current: ThresholdMap): string | null {
  const pct = (n: number) => `${fractionToPercent(n)}%`;
  if (key.endsWith(".target")) {
    const amberKey = key.replace(/\.target$/, ".amber");
    if (isThresholdKey(amberKey) && value < current[amberKey]) {
      return `The target cannot be below its watch level (${pct(current[amberKey])}); lower that first.`;
    }
  }
  if (key.endsWith(".amber")) {
    const targetKey = key.replace(/\.amber$/, ".target");
    if (isThresholdKey(targetKey) && value > current[targetKey]) {
      return `The watch level cannot be above its target (${pct(current[targetKey])}); raise that first.`;
    }
  }
  if (key === "cc.finance.ops_reserve_critical" && value > current["cc.finance.ops_reserve_min"]) {
    return `The critical level cannot be above the minimum (₦${current["cc.finance.ops_reserve_min"].toLocaleString("en-NG")}); raise that first.`;
  }
  if (key === "cc.finance.ops_reserve_min" && value < current["cc.finance.ops_reserve_critical"]) {
    return `The minimum cannot be below the critical level (₦${current["cc.finance.ops_reserve_critical"].toLocaleString("en-NG")}); lower that first.`;
  }
  return null;
}

/** Setting rows (key → value) merged over the defaults. Unusable values fall back. */
export function parseThresholds(rows: Record<string, string | null | undefined>): ThresholdMap {
  const out = {} as ThresholdMap;
  for (const key of THRESHOLD_KEYS) {
    out[key] = parseThresholdValue(rows[key]) ?? Number(THRESHOLD_DEFAULTS[key]);
  }
  return out;
}

// ── Targets the spec does not put in settings ────────────────────

/** Worker capacity utilisation band (percent): 60–85% is healthy, within 10pp of it is amber. */
export const CAPACITY_BAND = { low: 60, high: 85, tolerance: 10 } as const;

/** Share of active projects sitting in supervisor corrections (percent): lower is better. */
export const CORRECTIONS_SHARE = { target: 5, amber: 10 } as const;

/**
 * Open Tier 2 reference flags across every worker in the last 30 days: two
 * or fewer is on track (the spec's "≤2"); more is off track — a count has
 * no 10% band to be amber in.
 */
export const WORKER_FLAGS_MAX = 2;

/** Expected Claude spend per project, naira. */
export const AI_COST_PER_PROJECT = { min: 520, max: 1200 } as const;

/**
 * The CRITICAL "Operations Reserve low" alert fires below this setting. The
 * spec prose says ₦200K but its seed says ₦150K — the setting wins, and the
 * founder can PATCH it.
 */
export const OPS_RESERVE_ALERT_KEY = "cc.finance.ops_reserve_min" satisfies ThresholdKey;

// ── Status rules ─────────────────────────────────────────────────

export type RagKind = "higher" | "lower" | "band";

/**
 * - "higher": actual >= target green, >= amber amber, else red (rates, balances).
 * - "lower": actual <= target green, <= amber amber, else red (outstanding, corrections share).
 * - "band": target is the low edge and `bandHigh` the high edge; inside is
 *   green, within `amber` points outside the band is amber, else red.
 * A null (or non-finite) actual is "neutral": not yet tracked / no data.
 */
export function ragStatus(
  kind: RagKind,
  actual: number | null,
  target: number,
  amber: number,
  bandHigh?: number
): RagStatus {
  if (actual === null || !Number.isFinite(actual)) return "neutral";
  switch (kind) {
    case "higher":
      return actual >= target ? "green" : actual >= amber ? "amber" : "red";
    case "lower":
      return actual <= target ? "green" : actual <= amber ? "amber" : "red";
    case "band": {
      const low = target;
      const high = bandHigh ?? target;
      if (actual >= low && actual <= high) return "green";
      if (actual >= low - amber && actual <= high + amber) return "amber";
      return "red";
    }
  }
}

/**
 * "Growing" counts (conversions, schools): green when the current period is
 * at least the comparison period, amber when lower but still above zero, red
 * when it fell to zero while the comparison had some, neutral when both are
 * zero. Callers compare like with like (month so far vs the same point last
 * month, or two rolling windows), never a part-month with a whole one.
 */
export function growthStatus(current: number, previous: number): RagStatus {
  if (current === 0 && previous === 0) return "neutral";
  if (current === 0) return "red";
  return current >= previous ? "green" : "amber";
}

// ── Target labels ────────────────────────────────────────────────

/** "≥95%" from a fraction target (or "≤5%" for lower-is-better). */
export function rateTargetLabel(fraction: number, kind: "higher" | "lower" = "higher"): string {
  return `${kind === "higher" ? "≥" : "≤"}${Math.round(fraction * 100)}%`;
}

/** "60–85%" */
export function bandTargetLabel(band: { low: number; high: number } = CAPACITY_BAND): string {
  return `${band.low}–${band.high}%`;
}
