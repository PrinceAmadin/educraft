import { type AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/services/notifications";
import { PAID_ORDER } from "@/lib/ambassador";
import { tierLadderRows, tierProgress, type TierProgress } from "@/lib/ambassadors/tier-utils";
import { ratePercentForTier } from "@/lib/finance/commission-config";
import { NOT_OWED, isPaid } from "@/lib/finance/payout-status";
import { TIER_KEYS } from "@/lib/finance/cashflow-types";
import { getActiveCashflow } from "@/lib/services/cashflow";
import type { ReferralFilter } from "@/lib/validations/ambassador";

export async function getAmbassadorByUserId(userId: string) {
  return db.ambassador.findUnique({ where: { userId } });
}

// ── Metrics ──────────────────────────────────────────────────

interface AmbassadorMetrics {
  referrals: number;
  /**
   * Referred clients who have paid a downpayment on at least one order — the
   * count the tier ladder runs on, and what the portal calls "paying clients
   * referred". A referred client who only placed an unpaid order is not one.
   */
  payingClients: number;
  /** payingClients / referrals as a percentage. null until they have referrals. */
  payingClientRate: number | null;
  revenueGenerated: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionBalance: number;
}

function metricsFrom(
  referredClientPaidProjectCounts: number[],
  projects: { price: number }[],
  commission: { earned: number; paid: number }
): AmbassadorMetrics {
  const referrals = referredClientPaidProjectCounts.length;
  const payingClients = referredClientPaidProjectCounts.filter((n) => n > 0).length;
  const revenueGenerated = projects.reduce((s, p) => s + p.price, 0);

  return {
    referrals,
    payingClients,
    payingClientRate: referrals > 0 ? Math.round((payingClients / referrals) * 100) : null,
    revenueGenerated,
    commissionEarned: commission.earned,
    commissionPaid: commission.paid,
    commissionBalance: commission.earned - commission.paid,
  };
}

/**
 * What an ambassador is owed and has been paid, from the payout ledger: their
 * own referral commissions (AMBASSADOR), any Core override they earn from a Sub
 * (PARENT) and their quarterly / Platinum bonuses (BONUS) — every record under
 * their recipientType, so this agrees exactly with the lifetime-earnings figure
 * the recount stores. A commission is owed the moment the referred downpayment
 * is confirmed, not at completion.
 */
async function ledgerCommission(ambassadorId: string): Promise<{ earned: number; paid: number }> {
  const rows = await db.payoutRecord.findMany({
    where: { recipientType: "AMBASSADOR", recipientId: ambassadorId, status: { notIn: [...NOT_OWED] } },
    select: { amount: true, status: true },
  });
  const earned = Math.round(rows.reduce((s, r) => s + r.amount, 0));
  const paid = Math.round(rows.filter((r) => isPaid(r.status)).reduce((s, r) => s + r.amount, 0));
  return { earned, paid };
}

// ── Dashboard ────────────────────────────────────────────────

export interface AmbassadorDashboard {
  fullName: string;
  referralCode: string;
  tier: AmbassadorTier;
  rate: number;
  metrics: AmbassadorMetrics;
  progress: TierProgress;
  /** Commission rate of the next tier up, for "…and earn 12%". null at the top. */
  nextRate: number | null;
}

export async function getAmbassadorDashboard(ambassadorId: string): Promise<AmbassadorDashboard> {
  const ambassador = await db.ambassador.findUniqueOrThrow({
    where: { id: ambassadorId },
    select: {
      fullName: true,
      referralCode: true,
      tier: true,
      referredClients: { select: { _count: { select: { projects: { where: PAID_ORDER } } } } },
      projects: {
        select: { price: true },
      },
    },
  });

  const metrics = metricsFrom(
    ambassador.referredClients.map((c) => c._count.projects),
    ambassador.projects,
    await ledgerCommission(ambassadorId)
  );
  const { tiers } = (await getActiveCashflow()).structure;
  const progress = tierProgress(ambassador.tier, metrics.payingClients, tiers);

  return {
    fullName: ambassador.fullName,
    referralCode: ambassador.referralCode,
    tier: ambassador.tier,
    rate: ratePercentForTier(ambassador.tier, tiers),
    metrics,
    progress,
    nextRate: progress.next ? ratePercentForTier(progress.next, tiers) : null,
  };
}

// ── Referrals ────────────────────────────────────────────────

export interface ReferralRow {
  id: string;
  clientId: string;
  clientName: string;
  joinedAt: string;
  projectCount: number;
  /** They paid the downpayment on at least one order. */
  paying: boolean;
  latestService: string | null;
  latestStatus: string | null;
  commissionEarned: number;
}

export async function listReferrals(
  ambassadorId: string,
  filter: ReferralFilter = "all"
): Promise<ReferralRow[]> {
  const clients = await db.client.findMany({
    where: { referredById: ambassadorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientId: true,
      fullName: true,
      createdAt: true,
      projects: {
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          downpaymentStatus: true,
          ambassadorCommission: true,
          service: { select: { serviceName: true } },
        },
      },
    },
  });

  const rows: ReferralRow[] = clients.map((c) => {
    const paying = c.projects.some((p) => p.downpaymentStatus === "Verified");
    return {
      id: c.id,
      clientId: c.clientId,
      clientName: c.fullName,
      joinedAt: c.createdAt.toISOString(),
      projectCount: c.projects.length,
      paying,
      latestService: c.projects[0]?.service.serviceName ?? null,
      latestStatus: c.projects[0]?.status ?? null,
      commissionEarned: c.projects.reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0),
    };
  });

  if (filter === "paying") return rows.filter((r) => r.paying);
  if (filter === "waiting") return rows.filter((r) => !r.paying);
  return rows;
}

// ── Commissions ──────────────────────────────────────────────

export interface CommissionRow {
  projectId: string;
  clientName: string;
  rate: number | null;
  amount: number;
  status: string;
  earnedOn: string | null;
  paidOn: string | null;
  paid: boolean;
}

export interface AmbassadorCommissions {
  totalEarned: number;
  totalPaid: number;
  balance: number;
  rows: CommissionRow[];
}

export async function getAmbassadorCommissions(
  ambassadorId: string
): Promise<AmbassadorCommissions> {
  // The payout ledger is the source of truth: a personal referral commission (AMBASSADOR), a Core
  // override from a Sub (PARENT), or a quarterly / Platinum bonus (BONUS) — every record owed to this
  // ambassador, owed the moment it accrues and paid when finance records the transfer. Cancelled and
  // reversed rows are left out. This matches the lifetime-earnings figure exactly.
  const records = await db.payoutRecord.findMany({
    where: { recipientType: "AMBASSADOR", recipientId: ambassadorId, status: { notIn: [...NOT_OWED] } },
    orderBy: [{ accruedAt: "desc" }, { createdAt: "desc" }],
    select: {
      leg: true,
      amount: true,
      status: true,
      ratePercent: true,
      basis: true,
      accruedAt: true,
      createdAt: true,
      paidAt: true,
      project: { select: { projectId: true, status: true, client: { select: { fullName: true } } } },
    },
  });

  const rows: CommissionRow[] = records.map((r) => ({
    projectId: r.project?.projectId ?? "—",
    clientName:
      r.project?.client.fullName ?? (r.leg === "PARENT" ? "Sub-ambassador override" : r.leg === "BONUS" ? "Quarterly bonus" : "—"),
    rate: r.leg === "BONUS" ? null : r.ratePercent ?? (Number(/^([\d.]+)%/.exec(r.basis)?.[1]) || null),
    amount: r.amount,
    status: r.project?.status ?? "",
    earnedOn: (r.accruedAt ?? r.createdAt)?.toISOString() ?? null,
    paidOn: r.paidAt?.toISOString() ?? null,
    paid: isPaid(r.status),
  }));

  const totalEarned = Math.round(records.reduce((s, r) => s + r.amount, 0));
  const totalPaid = Math.round(records.filter((r) => isPaid(r.status)).reduce((s, r) => s + r.amount, 0));

  return { totalEarned, totalPaid, balance: totalEarned - totalPaid, rows };
}

// ── Profile ──────────────────────────────────────────────────

export async function getAmbassadorProfile(ambassadorId: string) {
  const ambassador = await db.ambassador.findUniqueOrThrow({
    where: { id: ambassadorId },
    select: {
      ambassadorId: true,
      fullName: true,
      phone: true,
      email: true,
      department: true,
      level: true,
      referralCode: true,
      tier: true,
      status: true,
      createdAt: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      weeklyEmailOptOut: true,
      university: { select: { name: true, abbreviation: true } },
      referredClients: { select: { _count: { select: { projects: { where: PAID_ORDER } } } } },
    },
  });

  const payingClients = ambassador.referredClients.filter((c) => c._count.projects > 0).length;
  const { tiers } = (await getActiveCashflow()).structure;
  const progress = tierProgress(ambassador.tier, payingClients, tiers);
  const rates = Object.fromEntries(TIER_KEYS.map((t) => [t, ratePercentForTier(t, tiers)])) as Record<AmbassadorTier, number>;
  return {
    profile: ambassador,
    progress,
    rate: rates[ambassador.tier],
    nextRate: progress.next ? rates[progress.next] : null,
    /** Every tier's live rate, so the ladder on screen matches Settings. */
    rates,
    /** The ladder as published: threshold and rate per tier. */
    ladder: tierLadderRows(tiers),
  };
}

export async function updateAmbassadorBank(
  ambassadorId: string,
  input: { bankName?: string; accountNumber?: string; accountName?: string }
) {
  const result = await db.ambassador.update({
    where: { id: ambassadorId },
    data: {
      bankName: input.bankName?.trim() || null,
      accountNumber: input.accountNumber?.trim() || null,
      accountName: input.accountName?.trim() || null,
    },
    select: { fullName: true, bankName: true, accountNumber: true, accountName: true },
  });

  await notifyAdmins({
    title: "Ambassador bank details updated",
    message: `${result.fullName} changed their commission payout details.`,
    type: "info",
  });

  return result;
}
