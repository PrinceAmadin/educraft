/**
 * The ₦/$ rate HQ applies when it converts Claude's USD costs to naira.
 *
 * The effective rate is `base × (1 + margin/100)`, where the base is the manual
 * override (if the founder pinned one) or the most recent auto-fetched
 * mid-market rate (see `fx-fetch.ts` + `/api/cron/refresh-fx-rate`). Anthropic
 * marks the market rate up by ~2–3 % when converting USD to naira on top-up,
 * so a small margin keeps our figures honest. Margin is clamped to [0, 20] %
 * so a typo cannot tank the ledger.
 *
 * Old `AiUsageLog` rows are never revalued — their `costNaira` is what the
 * Operations Reserve expense was posted at. Only new calls and the credit
 * balance card read the current effective rate.
 */

import { db } from "@/lib/db";
import { usdToNairaRate as envUsdToNairaRate } from "@/lib/ai-pricing";

export const FX_RATE_SETTING_KEYS = {
  auto: "ai.fxRateAuto",
  autoFetchedAt: "ai.fxRateAutoFetchedAt",
  autoSource: "ai.fxRateAutoSource",
  manualOverride: "ai.fxRateManualOverride",
  manualOverrideSetAt: "ai.fxRateManualOverrideSetAt",
  marginPercent: "ai.fxRateMarginPercent",
} as const;

export const DEFAULT_FX_MARGIN_PERCENT = 3;
export const FX_MARGIN_MIN = 0;
export const FX_MARGIN_MAX = 20;

export type FxRateSource = "manual" | "auto" | "env" | "default";

export interface FxRateSnapshot {
  /** The base rate before margin — the manual override or the auto value. */
  baseRate: number;
  /** Clamped to [FX_MARGIN_MIN, FX_MARGIN_MAX]. */
  marginPercent: number;
  /** `baseRate × (1 + marginPercent / 100)` — what HQ actually multiplies by. */
  effectiveRate: number;
  /** Which layer supplied the base. */
  source: FxRateSource;
  /** When the auto value was last fetched, if `source === "auto"`. */
  fetchedAt: string | null;
  /** Where the auto value came from (e.g. `open.er-api.com`), if any. */
  autoSource: string | null;
  /** True when a manual override is winning over the auto value. */
  overridden: boolean;
}

/** Pure: the maths the resolver and the form's live preview both use. */
export function computeEffective(base: number, marginPercent: number): number {
  const clamped = clampMargin(marginPercent);
  const value = base * (1 + clamped / 100);
  return Math.round(value * 100) / 100;
}

export function clampMargin(marginPercent: number): number {
  if (!Number.isFinite(marginPercent)) return DEFAULT_FX_MARGIN_PERCENT;
  return Math.min(FX_MARGIN_MAX, Math.max(FX_MARGIN_MIN, marginPercent));
}

/** Reads the six Setting rows once and resolves the effective rate in memory. */
export async function resolveFxRate(): Promise<FxRateSnapshot> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(FX_RATE_SETTING_KEYS) } },
  });
  const val = (k: string) => rows.find((r) => r.key === k)?.value;

  const manualRaw = val(FX_RATE_SETTING_KEYS.manualOverride);
  const manual = Number(manualRaw);
  const hasManual = manualRaw != null && manualRaw !== "" && Number.isFinite(manual) && manual > 0;

  const autoRaw = val(FX_RATE_SETTING_KEYS.auto);
  const auto = Number(autoRaw);
  const hasAuto = autoRaw != null && Number.isFinite(auto) && auto > 0;

  const marginRaw = val(FX_RATE_SETTING_KEYS.marginPercent);
  const marginPercent = clampMargin(
    marginRaw != null && marginRaw !== "" ? Number(marginRaw) : DEFAULT_FX_MARGIN_PERCENT,
  );

  const fetchedAt = val(FX_RATE_SETTING_KEYS.autoFetchedAt) ?? null;
  const autoSource = val(FX_RATE_SETTING_KEYS.autoSource) ?? null;

  let baseRate: number;
  let source: FxRateSource;
  if (hasManual) {
    baseRate = manual;
    source = "manual";
  } else if (hasAuto) {
    baseRate = auto;
    source = "auto";
  } else {
    const env = envUsdToNairaRate();
    baseRate = env;
    // envUsdToNairaRate returns 1500 when USD_NGN_RATE is missing.
    source = process.env.USD_NGN_RATE && Number.isFinite(Number(process.env.USD_NGN_RATE)) ? "env" : "default";
  }

  return {
    baseRate,
    marginPercent,
    effectiveRate: computeEffective(baseRate, marginPercent),
    source,
    fetchedAt: source === "auto" ? fetchedAt : null,
    autoSource: source === "auto" ? autoSource : null,
    overridden: source === "manual",
  };
}

/** Convenience for consumers that only need the number. */
export async function getUsdToNairaRate(): Promise<number> {
  const snap = await resolveFxRate();
  return snap.effectiveRate;
}
