import { type AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/services/notifications";
import { PAID_ORDER, tierProgress, type TierProgress } from "@/lib/ambassador";
import { getCommissionRates } from "@/lib/services/settings";
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
  projects: { price: number; status: string; ambassadorCommission: number | null; ambassadorCommPaid: boolean }[]
): AmbassadorMetrics {
  const referrals = referredClientPaidProjectCounts.length;
  const payingClients = referredClientPaidProjectCounts.filter((n) => n > 0).length;
  const revenueGenerated = projects.reduce((s, p) => s + p.price, 0);
  const completed = projects.filter((p) => p.status === "COMPLETED");
  const commissionEarned = completed.reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0);
  const commissionPaid = completed
    .filter((p) => p.ambassadorCommPaid)
    .reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0);

  return {
    referrals,
    payingClients,
    payingClientRate: referrals > 0 ? Math.round((payingClients / referrals) * 100) : null,
    revenueGenerated,
    commissionEarned,
    commissionPaid,
    commissionBalance: commissionEarned - commissionPaid,
  };
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
        select: { price: true, status: true, ambassadorCommission: true, ambassadorCommPaid: true },
      },
    },
  });

  const metrics = metricsFrom(
    ambassador.referredClients.map((c) => c._count.projects),
    ambassador.projects
  );
  const progress = tierProgress(ambassador.tier, metrics.payingClients);
  const rates = await getCommissionRates();

  return {
    fullName: ambassador.fullName,
    referralCode: ambassador.referralCode,
    tier: ambassador.tier,
    rate: rates[ambassador.tier],
    metrics,
    progress,
    nextRate: progress.next ? rates[progress.next] : null,
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
  const projects = await db.project.findMany({
    where: { ambassadorId, ambassadorCommission: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      projectId: true,
      status: true,
      ambassadorCommRate: true,
      ambassadorCommission: true,
      ambassadorCommPaid: true,
      downpaymentDate: true,
      client: { select: { fullName: true } },
    },
  });

  // Match each paid commission to its OUTFLOW Payment for the paid date.
  const payments = await db.payment.findMany({
    where: {
      type: "AMBASSADOR_COMMISSION",
      direction: "OUTFLOW",
      project: { ambassadorId },
    },
    orderBy: { date: "desc" },
    select: { date: true, projectId: true },
  });
  const paidDateByProject = new Map<string, Date>();
  for (const p of payments) {
    if (p.projectId && !paidDateByProject.has(p.projectId)) {
      paidDateByProject.set(p.projectId, p.date);
    }
  }

  const projectRows = await db.project.findMany({
    where: { ambassadorId, ambassadorCommission: { not: null } },
    select: { id: true, projectId: true },
  });
  const dbIdByCode = new Map(projectRows.map((p) => [p.projectId, p.id]));

  const rows: CommissionRow[] = projects.map((p) => {
    const dbId = dbIdByCode.get(p.projectId);
    return {
      projectId: p.projectId,
      clientName: p.client.fullName,
      rate: p.ambassadorCommRate,
      amount: p.ambassadorCommission ?? 0,
      status: p.status,
      earnedOn: p.downpaymentDate?.toISOString() ?? null,
      paidOn: (dbId && paidDateByProject.get(dbId)?.toISOString()) || null,
      paid: p.ambassadorCommPaid,
    };
  });

  const completed = projects.filter((p) => p.status === "COMPLETED");
  const totalEarned = completed.reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0);
  const totalPaid = completed
    .filter((p) => p.ambassadorCommPaid)
    .reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0);

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
  const progress = tierProgress(ambassador.tier, payingClients);
  const rates = await getCommissionRates();
  return {
    profile: ambassador,
    progress,
    rate: rates[ambassador.tier],
    nextRate: progress.next ? rates[progress.next] : null,
    /** Every tier's live rate, so the ladder on screen matches Settings. */
    rates,
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
