import { db } from "@/lib/db";
import { getUsdToNairaRate } from "@/lib/fx-rate";
import { getActiveCashflow } from "@/lib/services/cashflow";
import { getPotBalances } from "@/lib/services/finance/buckets";

/**
 * Tracked pots inside a bucket (Phase 4). A pot's balance is the signed sum of
 * its PotTransaction rows — the same Σ-ledger the buckets use, one level down.
 * Reads only; the writes live in buckets.ts (syncProjectBuckets for inflows,
 * syncExpenseOutflow for outflows) and expenses.ts (the Claude top-up).
 */

export interface PotView {
  key: string;
  label: string;
  parentKey: string;
  balance: number;
  isAbsorber: boolean;
  /** claude_api only: what the pot balance could buy in Anthropic credit now. */
  topUpUsd?: number;
}

/** Every tracked pot in the active structure, with its balance (and, for claude_api, the buyable USD). */
export async function listPots(): Promise<PotView[]> {
  const [active, balances, usdRate] = await Promise.all([getActiveCashflow(), getPotBalances(), getUsdToNairaRate()]);
  return active.structure.level3
    .filter((p) => p.isTrackedAsPot)
    .map((p) => ({
      key: p.key,
      label: p.label,
      parentKey: p.parentKey,
      balance: balances[p.key] ?? 0,
      isAbsorber: Boolean(p.isAbsorber),
      ...(p.key === "claude_api" ? { topUpUsd: usdRate > 0 ? Math.max(0, Math.round((balances[p.key] ?? 0) / usdRate)) : 0 } : {}),
    }));
}

export interface PotSummary {
  key: string;
  label: string;
  balance: number;
  lifetimeIn: number;
  lifetimeOut: number;
}

/** One pot's balance and lifetime in/out. */
export async function getPotSummary(potKey: string): Promise<PotSummary> {
  const [active, rows] = await Promise.all([
    getActiveCashflow(),
    db.potTransaction.findMany({ where: { potKey }, select: { amount: true } }),
  ]);
  const label = active.structure.level3.find((p) => p.key === potKey)?.label ?? potKey;
  let lifetimeIn = 0;
  let lifetimeOut = 0;
  for (const r of rows) {
    if (r.amount >= 0) lifetimeIn += r.amount;
    else lifetimeOut += -r.amount;
  }
  return { key: potKey, label, balance: Math.round(lifetimeIn - lifetimeOut), lifetimeIn: Math.round(lifetimeIn), lifetimeOut: Math.round(lifetimeOut) };
}

export interface ClaudePot {
  balanceNaira: number;
  usdRate: number;
  /** What the pot balance could buy in Anthropic credit at the current rate. */
  canTopUpUsd: number;
}

/** The Claude API pot for the AI usage tab: cash set aside for Claude, and how much credit it could buy. */
export async function getClaudePot(): Promise<ClaudePot> {
  const [balances, usdRate] = await Promise.all([getPotBalances(), getUsdToNairaRate()]);
  const balanceNaira = balances.claude_api ?? 0;
  return { balanceNaira, usdRate, canTopUpUsd: usdRate > 0 ? Math.max(0, Math.round(balanceNaira / usdRate)) : 0 };
}

export interface PotMovement {
  potKey: string;
  in: number;
  out: number;
}

/** Pot movements between two months inclusive — for the weekly/period statement (Phase 7). */
export async function potMovements(fromMonth: string, toMonth: string): Promise<PotMovement[]> {
  const rows = await db.potTransaction.groupBy({
    by: ["potKey", "type"],
    where: { month: { gte: fromMonth, lte: toMonth } },
    _sum: { amount: true },
  });
  const map = new Map<string, PotMovement>();
  for (const r of rows) {
    const cur = map.get(r.potKey) ?? { potKey: r.potKey, in: 0, out: 0 };
    const amt = Math.round(r._sum.amount ?? 0);
    if (amt >= 0) cur.in += amt;
    else cur.out += -amt;
    map.set(r.potKey, cur);
  }
  return [...map.values()];
}
