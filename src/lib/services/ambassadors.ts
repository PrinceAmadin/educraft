import { Prisma, type AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId, TransitionError } from "@/lib/services/projects";
import { generateReferralCode, tierProgress } from "@/lib/ambassador";
import { getCommissionRates } from "@/lib/services/settings";
import type { CreateAmbassadorInput } from "@/lib/validations/ambassadors";

export const AMBASSADOR_PAGE_SIZE = 20;

interface AmbassadorProjectFacts {
  price: number;
  status: string;
  ambassadorCommission: number | null;
  ambassadorCommPaid: boolean;
}

interface AmbassadorMetrics {
  referrals: number;
  conversions: number;
  conversionRate: number | null;
  revenueGenerated: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionBalance: number;
}

function computeMetrics(
  referredClientProjectCounts: number[],
  projects: AmbassadorProjectFacts[]
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

// ── List ─────────────────────────────────────────────────────

export interface AmbassadorListRow {
  id: string;
  ambassadorId: string;
  fullName: string;
  university: string | null;
  tier: AmbassadorTier;
  status: string;
  rate: number;
  referrals: number;
  conversions: number;
  revenueGenerated: number;
  commissionBalance: number;
}

export interface AmbassadorListResult {
  rows: AmbassadorListRow[];
  total: number;
  page: number;
  pageCount: number;
}

const listSelect = {
  id: true,
  ambassadorId: true,
  fullName: true,
  tier: true,
  status: true,
  university: { select: { abbreviation: true } },
  referredClients: { select: { _count: { select: { projects: true } } } },
  projects: {
    select: { price: true, status: true, ambassadorCommission: true, ambassadorCommPaid: true },
  },
} satisfies Prisma.AmbassadorSelect;

export async function listAmbassadors(params: {
  university?: string;
  tier?: AmbassadorTier;
  status?: string;
  q?: string;
  page?: number;
}): Promise<AmbassadorListResult> {
  const page = Math.max(1, params.page ?? 1);

  const where: Prisma.AmbassadorWhereInput = {
    ...(params.university ? { universityId: params.university } : {}),
    ...(params.tier ? { tier: params.tier } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.q?.trim()
      ? {
          OR: [
            { fullName: { contains: params.q.trim(), mode: "insensitive" } },
            { phone: { contains: params.q.trim(), mode: "insensitive" } },
            { ambassadorId: { contains: params.q.trim(), mode: "insensitive" } },
            { referralCode: { contains: params.q.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [ambassadors, total] = await db.$transaction([
    db.ambassador.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AMBASSADOR_PAGE_SIZE,
      take: AMBASSADOR_PAGE_SIZE,
      select: listSelect,
    }),
    db.ambassador.count({ where }),
  ]);

  const rates = await getCommissionRates();
  const rows: AmbassadorListRow[] = ambassadors.map((a) => {
    const m = computeMetrics(
      a.referredClients.map((c) => c._count.projects),
      a.projects
    );
    return {
      id: a.id,
      ambassadorId: a.ambassadorId,
      fullName: a.fullName,
      university: a.university?.abbreviation ?? null,
      tier: a.tier,
      status: a.status,
      rate: rates[a.tier],
      referrals: m.referrals,
      conversions: m.conversions,
      revenueGenerated: m.revenueGenerated,
      commissionBalance: m.commissionBalance,
    };
  });

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / AMBASSADOR_PAGE_SIZE)) };
}

// ── Detail ───────────────────────────────────────────────────

const detailSelect = {
  id: true,
  ambassadorId: true,
  fullName: true,
  phone: true,
  email: true,
  userId: true,
  department: true,
  level: true,
  referralCode: true,
  tier: true,
  status: true,
  bankName: true,
  accountNumber: true,
  accountName: true,
  createdAt: true,
  university: { select: { name: true, abbreviation: true } },
  referredClients: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientId: true,
      fullName: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  },
  projects: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      status: true,
      price: true,
      ambassadorCommission: true,
      ambassadorCommRate: true,
      ambassadorCommPaid: true,
      createdAt: true,
    },
  },
} satisfies Prisma.AmbassadorSelect;

export type AmbassadorDetail = Prisma.AmbassadorGetPayload<{ select: typeof detailSelect }>;

export async function getAmbassadorDetail(id: string) {
  const ambassador = await db.ambassador.findUnique({ where: { id }, select: detailSelect });
  if (!ambassador) return null;

  const metrics = computeMetrics(
    ambassador.referredClients.map((c) => c._count.projects),
    ambassador.projects
  );

  const payouts = await db.payment.findMany({
    where: {
      type: "AMBASSADOR_COMMISSION",
      direction: "OUTFLOW",
      project: { ambassadorId: ambassador.id },
    },
    orderBy: { date: "desc" },
    select: { id: true, paymentId: true, amount: true, reference: true, status: true, date: true },
  });

  return {
    ambassador,
    metrics,
    progress: tierProgress(ambassador.tier, metrics.conversions),
    payouts,
  };
}

// ── Schools coverage ─────────────────────────────────────────

export interface SchoolCoverageRow {
  id: string;
  name: string;
  abbreviation: string;
  total: number;
  active: number;
  revenueGenerated: number;
}

export async function getSchoolCoverage(): Promise<SchoolCoverageRow[]> {
  const universities = await db.university.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      ambassadors: {
        select: {
          status: true,
          projects: { select: { price: true } },
        },
      },
    },
  });

  return universities
    .map((u) => {
      const total = u.ambassadors.length;
      const active = u.ambassadors.filter((a) => a.status === "Active").length;
      const revenueGenerated = u.ambassadors.reduce(
        (s, a) => s + a.projects.reduce((ps, p) => ps + p.price, 0),
        0
      );
      return { id: u.id, name: u.name, abbreviation: u.abbreviation, total, active, revenueGenerated };
    })
    .sort((a, b) => b.total - a.total || b.revenueGenerated - a.revenueGenerated);
}

// ── Mutations ────────────────────────────────────────────────

export async function createAmbassador(input: CreateAmbassadorInput) {
  // Single write. Regenerate the code / id and retry on a unique clash (P2002).
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.ambassador.create({
        data: {
          ambassadorId: await nextId("AMBASSADOR"),
          fullName: input.fullName,
          phone: input.phone,
          email: input.email || null,
          universityId: input.universityId,
          department: input.department || null,
          level: input.level || null,
          referralCode: generateReferralCode(input.fullName),
          tier: "BRONZE",
          status: "Active",
          bankName: input.bankName || null,
          accountNumber: input.accountNumber || null,
          accountName: input.accountName || null,
        },
        select: { id: true, ambassadorId: true, referralCode: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < 3
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new TransitionError("Could not allocate an ambassador id — try again");
}

export async function updateAmbassador(
  id: string,
  data: { status?: string; tier?: AmbassadorTier }
) {
  const ambassador = await db.ambassador.findUnique({ where: { id }, select: { id: true } });
  if (!ambassador) throw new TransitionError("Ambassador not found");

  return db.ambassador.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.tier ? { tier: data.tier } : {}),
    },
    select: { status: true, tier: true },
  });
}
