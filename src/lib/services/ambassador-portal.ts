import { type AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/services/notifications";
import { tierProgress, type TierProgress } from "@/lib/ambassador";
import { TIER_COMMISSION_RATE } from "@/lib/constants";

export async function getAmbassadorByUserId(userId: string) {
  return db.ambassador.findUnique({ where: { userId } });
}

// ── Metrics ──────────────────────────────────────────────────

interface AmbassadorMetrics {
  referrals: number;
  conversions: number;
  conversionRate: number | null;
  revenueGenerated: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionBalance: number;
}

function metricsFrom(
  referredClientProjectCounts: number[],
  projects: { price: number; status: string; ambassadorCommission: number | null; ambassadorCommPaid: boolean }[]
): AmbassadorMetrics {
  const referrals = referredClientProjectCounts.length;
  const conversions = referredClientProjectCounts.filter((n) => n > 0).length;
  const revenueGenerated = projects.reduce((s, p) => s + p.price, 0);
  const completed = projects.filter((p) => p.status === "COMPLETED");
  const commissionEarned = completed.reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0);
  const commissionPaid = completed
    .filter((p) => p.ambassadorCommPaid)
    .reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0);

  return {
    referrals,
    conversions,
    conversionRate: referrals > 0 ? Math.round((conversions / referrals) * 100) : null,
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
}

export async function getAmbassadorDashboard(ambassadorId: string): Promise<AmbassadorDashboard> {
  const ambassador = await db.ambassador.findUniqueOrThrow({
    where: { id: ambassadorId },
    select: {
      fullName: true,
      referralCode: true,
      tier: true,
      referredClients: { select: { _count: { select: { projects: true } } } },
      projects: {
        select: { price: true, status: true, ambassadorCommission: true, ambassadorCommPaid: true },
      },
    },
  });

  const metrics = metricsFrom(
    ambassador.referredClients.map((c) => c._count.projects),
    ambassador.projects
  );

  return {
    fullName: ambassador.fullName,
    referralCode: ambassador.referralCode,
    tier: ambassador.tier,
    rate: TIER_COMMISSION_RATE[ambassador.tier] ?? 10,
    metrics,
    progress: tierProgress(ambassador.tier, metrics.conversions),
  };
}

// ── Referrals ────────────────────────────────────────────────

export interface ReferralRow {
  id: string;
  clientId: string;
  clientName: string;
  joinedAt: string;
  projectCount: number;
  converted: boolean;
  latestService: string | null;
  latestStatus: string | null;
  commissionEarned: number;
}

export async function listReferrals(
  ambassadorId: string,
  filter: "all" | "converted" | "pending" = "all"
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
          ambassadorCommission: true,
          service: { select: { serviceName: true } },
        },
      },
    },
  });

  const rows: ReferralRow[] = clients.map((c) => {
    const converted = c.projects.length > 0;
    return {
      id: c.id,
      clientId: c.clientId,
      clientName: c.fullName,
      joinedAt: c.createdAt.toISOString(),
      projectCount: c.projects.length,
      converted,
      latestService: c.projects[0]?.service.serviceName ?? null,
      latestStatus: c.projects[0]?.status ?? null,
      commissionEarned: c.projects.reduce((s, p) => s + (p.ambassadorCommission ?? 0), 0),
    };
  });

  if (filter === "converted") return rows.filter((r) => r.converted);
  if (filter === "pending") return rows.filter((r) => !r.converted);
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

// ── Leaderboard ──────────────────────────────────────────────

export interface LeaderboardRow {
  rank: number;
  name: string;
  university: string | null;
  conversions: number;
  isMe: boolean;
}

export interface Leaderboard {
  top: LeaderboardRow[];
  me: { rank: number; conversions: number; inTop: boolean } | null;
}

export async function getLeaderboard(ambassadorId: string): Promise<Leaderboard> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // A monthly conversion = a project placed this month by a referred client.
  const grouped = await db.project.groupBy({
    by: ["ambassadorId"],
    where: { ambassadorId: { not: null }, createdAt: { gte: monthStart } },
    _count: { _all: true },
  });

  const ids = grouped
    .map((g) => g.ambassadorId)
    .filter((x): x is string => x != null);
  const ambassadors = await db.ambassador.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, university: { select: { abbreviation: true } } },
  });
  const byId = new Map(ambassadors.map((a) => [a.id, a]));

  const ranked = grouped
    .map((g) => ({
      id: g.ambassadorId as string,
      conversions: g._count._all,
      name: byId.get(g.ambassadorId as string)?.fullName ?? "Unknown",
      university: byId.get(g.ambassadorId as string)?.university?.abbreviation ?? null,
    }))
    .sort((a, b) => b.conversions - a.conversions);

  const top: LeaderboardRow[] = ranked.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    university: r.university,
    conversions: r.conversions,
    isMe: r.id === ambassadorId,
  }));

  const myIndex = ranked.findIndex((r) => r.id === ambassadorId);
  const me =
    myIndex >= 0
      ? { rank: myIndex + 1, conversions: ranked[myIndex].conversions, inTop: myIndex < 10 }
      : null;

  return { top, me };
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
      university: { select: { name: true, abbreviation: true } },
      referredClients: { select: { _count: { select: { projects: true } } } },
    },
  });

  const conversions = ambassador.referredClients.filter((c) => c._count.projects > 0).length;
  return {
    profile: ambassador,
    progress: tierProgress(ambassador.tier, conversions),
    rate: TIER_COMMISSION_RATE[ambassador.tier] ?? 10,
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
