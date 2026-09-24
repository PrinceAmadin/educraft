import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { calculateTier } from "@/lib/ambassadors/tier-utils";

/**
 * The counters on an Ambassador are a cache of their referrals and payout
 * records. `recountAmbassador` recomputes them from the rows — so every
 * path that changes a referral, a payout or a link calls it, and a replay
 * can never double-count. The tier is derived here and nowhere else.
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

export async function recountAmbassador(tx: Db, ambassadorId: string): Promise<RecountResult | null> {
  const ambassador = await tx.ambassador.findUnique({ where: { id: ambassadorId }, select: { id: true, tier: true } });
  if (!ambassador) return null;

  const [referrals, converted, lastConversion, lastReferral, earnings] = await Promise.all([
    tx.ambassadorReferral.count({ where: { ambassadorId, status: { not: "CANCELLED" } } }),
    tx.ambassadorReferral.count({ where: { ambassadorId, status: "CONVERTED" } }),
    tx.ambassadorReferral.findFirst({ where: { ambassadorId, status: "CONVERTED" }, orderBy: { convertedAt: "desc" }, select: { convertedAt: true } }),
    tx.ambassadorReferral.findFirst({ where: { ambassadorId, status: { not: "CANCELLED" } }, orderBy: { submittedAt: "desc" }, select: { submittedAt: true } }),
    tx.payoutRecord.aggregate({ where: { recipientType: "AMBASSADOR", recipientId: ambassadorId, status: { not: "CANCELLED" } }, _sum: { amount: true } }),
  ]);

  const tier = calculateTier(converted);
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
