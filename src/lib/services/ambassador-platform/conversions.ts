import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ambassadorTier, TOP_TIER, topTierMinConversions, type TierLadder } from "@/lib/ambassadors/tier-utils";
import { execForRecord } from "@/lib/executive-identity";
import { getActiveCashflow } from "@/lib/services/cashflow";
import { emailEquals, loadExecIndex } from "@/lib/services/executives";

/**
 * The counters on an Ambassador are a cache of their referrals and payout
 * records. `recountAmbassador` recomputes them from the rows — so every
 * path that changes a referral, a payout or a link calls it, and a replay
 * can never double-count. The tier is derived here and nowhere else: by
 * count against the ladder of the cashflow structure in force, except that
 * an executive's record is always Platinum.
 */

type Db = Prisma.TransactionClient | typeof db;

export interface RecountResult {
  lifetimeReferrals: number;
  lifetimeConversions: number;
  lifetimeEarnings: number;
  tier: string;
  previousTier: string;
  tierChanged: boolean;
}

/** Recount one ambassador; pass `tiers` when the caller already holds the ladder (one read fewer inside a transaction). */
export async function recountAmbassador(tx: Db, ambassadorId: string, tiers?: TierLadder): Promise<RecountResult | null> {
  const ambassador = await tx.ambassador.findUnique({
    where: { id: ambassadorId },
    select: { id: true, tier: true, email: true, user: { select: { email: true, role: true } } },
  });
  if (!ambassador) return null;

  // The executive lookup and the ladder run alongside the counts, so they add
  // no round trip to the downpayment confirmations that call this inside their transaction.
  const [referrals, converted, lastConversion, lastReferral, earnings, execIndex, ladder] = await Promise.all([
    tx.ambassadorReferral.count({ where: { ambassadorId, status: { not: "CANCELLED" } } }),
    tx.ambassadorReferral.count({ where: { ambassadorId, status: "CONVERTED" } }),
    tx.ambassadorReferral.findFirst({ where: { ambassadorId, status: "CONVERTED" }, orderBy: { convertedAt: "desc" }, select: { convertedAt: true } }),
    tx.ambassadorReferral.findFirst({ where: { ambassadorId, status: { not: "CANCELLED" } }, orderBy: { submittedAt: "desc" }, select: { submittedAt: true } }),
    tx.payoutRecord.aggregate({ where: { recipientType: "AMBASSADOR", recipientId: ambassadorId, status: { not: "CANCELLED" } }, _sum: { amount: true } }),
    loadExecIndex(tx),
    tiers ? Promise.resolve(tiers) : getActiveCashflow().then((v) => v.structure.tiers),
  ]);

  const tier = ambassadorTier(converted, execForRecord(execIndex, ambassador) != null, ladder);
  const tierChanged = tier !== ambassador.tier;
  await tx.ambassador.update({
    where: { id: ambassadorId },
    data: {
      lifetimeReferrals: referrals,
      lifetimeConversions: converted,
      lifetimeEarnings: Math.round(earnings._sum.amount ?? 0),
      lastConversionAt: lastConversion?.convertedAt ?? null,
      lastReferralAt: lastReferral?.submittedAt ?? null,
      tier,
    },
  });
  if (tierChanged) {
    await tx.ambassadorTierLog.create({ data: { ambassadorId, fromTier: ambassador.tier, toTier: tier, conversions: converted } });
  }
  return { lifetimeReferrals: referrals, lifetimeConversions: converted, lifetimeEarnings: Math.round(earnings._sum.amount ?? 0), tier, previousTier: ambassador.tier, tierChanged };
}

/**
 * Re-derive the tier of every ambassador an executive change can move: those
 * on an executive's email now (promoted to Platinum) and those at Platinum
 * without the conversions for it (an executive until now, dropped back to
 * their count). Called after Team & roles edits; each recount is idempotent.
 */
export async function refreshExecutiveTiers(): Promise<{ checked: number; changed: { ambassadorId: string; from: string; to: string }[] }> {
  const [index, active] = await Promise.all([loadExecIndex(), getActiveCashflow()]);
  const tiers = active.structure.tiers;
  const match = emailEquals([...index.keys()]);
  const candidates = await db.ambassador.findMany({
    where: {
      OR: [
        { tier: TOP_TIER, lifetimeConversions: { lt: topTierMinConversions(tiers) } },
        ...match.map((email) => ({ user: { email } })),
        ...match.map((email) => ({ userId: null, email })),
      ],
    },
    select: { id: true, ambassadorId: true },
  });
  const changed: { ambassadorId: string; from: string; to: string }[] = [];
  for (const a of candidates) {
    const r = await recountAmbassador(db, a.id, tiers);
    if (r?.tierChanged) changed.push({ ambassadorId: a.ambassadorId, from: r.previousTier, to: r.tier });
  }
  return { checked: candidates.length, changed };
}

/**
 * Re-derive EVERY ambassador's tier under the ladder in force — after a
 * cashflow version with new thresholds is published. Each recount is
 * idempotent and logs its own tier change.
 */
export async function refreshAllTiers(): Promise<{ checked: number; changed: { ambassadorId: string; from: string; to: string }[] }> {
  const tiers = (await getActiveCashflow()).structure.tiers;
  const all = await db.ambassador.findMany({ select: { id: true, ambassadorId: true }, orderBy: { createdAt: "asc" } });
  const changed: { ambassadorId: string; from: string; to: string }[] = [];
  for (const a of all) {
    const r = await recountAmbassador(db, a.id, tiers);
    if (r?.tierChanged) changed.push({ ambassadorId: a.ambassadorId, from: r.previousTier, to: r.tier });
  }
  return { checked: all.length, changed };
}

/**
 * `refreshExecutiveTiers` for a Team & roles edit: logged, never fails the edit
 * it follows. Tried three times, because a dropped database connection would
 * otherwise leave the tier wrong until the ambassador's next recount; each try
 * is idempotent.
 */
export async function refreshExecutiveTiersQuietly(context: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await refreshExecutiveTiers();
      if (r.changed.length) console.log(`[exec-tier] ${context}: ${r.changed.map((c) => `${c.ambassadorId} ${c.from} -> ${c.to}`).join(", ")}`);
      return;
    } catch (err) {
      console.error(`[exec-tier] ${context}: tier refresh failed (try ${attempt} of 3)`, err);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
}
