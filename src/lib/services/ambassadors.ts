import { Prisma, type AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId, TransitionError } from "@/lib/services/projects";
import { generateReferralCode, isProvisional, provisionalDeadline, tierProgress } from "@/lib/ambassador";
import { getCommissionRates } from "@/lib/services/settings";
import {
  MAX_SUB_AMBASSADORS,
  PARENT_ACTIVATION_TIERS,
  isValidParentRate,
} from "@/lib/commission";
import type { CreateAmbassadorInput, UpdateAmbassadorInput } from "@/lib/validations/ambassadors";
import type { SetParentInput } from "@/lib/validations/commission";

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
  /** Still inside their 30-day window, so the slot isn't theirs yet. */
  provisional: boolean;
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
  provisionalUntil: true,
  activatedAt: true,
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
      provisional: isProvisional(a),
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
  universityId: true,
  fullName: true,
  phone: true,
  email: true,
  userId: true,
  legacySlotId: true,
  weeklyEmailOptOut: true,
  department: true,
  level: true,
  referralCode: true,
  tier: true,
  status: true,
  provisionalUntil: true,
  activatedAt: true,
  provisionalWarnedAt: true,
  bankName: true,
  accountNumber: true,
  accountName: true,
  createdAt: true,
  parentId: true,
  parentCommRate: true,
  parent: { select: { id: true, ambassadorId: true, fullName: true, tier: true } },
  children: {
    orderBy: { fullName: "asc" },
    select: { id: true, ambassadorId: true, fullName: true, tier: true, parentCommRate: true },
  },
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

export interface ParentCommissionSummary {
  totalEarned: number;
  totalPaid: number;
  balance: number;
  /** Per sub-ambassador, how much they've generated for this parent. */
  bySub: { id: string; ambassadorId: string; fullName: string; amount: number }[];
}

/** What this ambassador has earned as a parent, from their subs' completed jobs. */
async function getParentCommissionSummary(ambassadorId: string): Promise<ParentCommissionSummary> {
  const projects = await db.project.findMany({
    where: { parentAmbassadorId: ambassadorId, parentCommission: { not: null } },
    select: {
      status: true,
      parentCommission: true,
      parentCommPaid: true,
      ambassador: { select: { id: true, ambassadorId: true, fullName: true } },
    },
  });
  const completed = projects.filter((p) => p.status === "COMPLETED");
  const totalEarned = completed.reduce((s, p) => s + (p.parentCommission ?? 0), 0);
  const totalPaid = completed
    .filter((p) => p.parentCommPaid)
    .reduce((s, p) => s + (p.parentCommission ?? 0), 0);

  const bySubMap = new Map<string, { id: string; ambassadorId: string; fullName: string; amount: number }>();
  for (const p of completed) {
    if (!p.ambassador) continue;
    const row = bySubMap.get(p.ambassador.id) ?? {
      id: p.ambassador.id,
      ambassadorId: p.ambassador.ambassadorId,
      fullName: p.ambassador.fullName,
      amount: 0,
    };
    row.amount += p.parentCommission ?? 0;
    bySubMap.set(p.ambassador.id, row);
  }

  return {
    totalEarned,
    totalPaid,
    balance: totalEarned - totalPaid,
    bySub: [...bySubMap.values()].sort((a, b) => b.amount - a.amount),
  };
}

export async function getAmbassadorDetail(id: string) {
  const ambassador = await db.ambassador.findUnique({ where: { id }, select: detailSelect });
  if (!ambassador) return null;

  const metrics = computeMetrics(
    ambassador.referredClients.map((c) => c._count.projects),
    ambassador.projects
  );

  const [payouts, parentCommission] = await Promise.all([
    db.payment.findMany({
      where: {
        type: "AMBASSADOR_COMMISSION",
        direction: "OUTFLOW",
        project: { ambassadorId: ambassador.id },
      },
      orderBy: { date: "desc" },
      select: { id: true, paymentId: true, amount: true, reference: true, status: true, date: true },
    }),
    ambassador.children.length > 0 ? getParentCommissionSummary(ambassador.id) : Promise.resolve(null),
  ]);

  return {
    ambassador,
    metrics,
    progress: tierProgress(ambassador.tier, metrics.conversions),
    payouts,
    parentCommission,
  };
}

// ── Parent / sub-ambassador hierarchy ───────────────────────────────────

export class AmbassadorHierarchyError extends Error {}

export interface ParentCandidate {
  id: string;
  code: string;
  name: string;
  tier: AmbassadorTier;
  childrenCount: number;
  /** False (and disabled in the picker) once they already have 5 subs. */
  hasRoom: boolean;
  /** Parent-commission only pays out once they reach Silver+ (CLAUDE.md). */
  activated: boolean;
}

/**
 * Who this ambassador could be linked under: not themselves, not already a
 * sub-ambassador themselves (max 1 level deep), not suspended/terminated.
 * Full ones are still listed — greyed out — so the admin sees why.
 */
export async function listParentCandidates(excludeId: string): Promise<ParentCandidate[]> {
  const rows = await db.ambassador.findMany({
    where: { id: { not: excludeId }, parentId: null, status: { notIn: ["Suspended", "Terminated"] } },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      ambassadorId: true,
      fullName: true,
      tier: true,
      _count: { select: { children: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    code: a.ambassadorId,
    name: a.fullName,
    tier: a.tier,
    childrenCount: a._count.children,
    hasRoom: a._count.children < MAX_SUB_AMBASSADORS,
    activated: (PARENT_ACTIVATION_TIERS as readonly string[]).includes(a.tier),
  }));
}

/**
 * Link (or unlink) `childId` under a parent. Enforces: no self-parenting, one
 * level deep (a parent can't itself have a parent; a child can't already have
 * subs of its own), and max {@link MAX_SUB_AMBASSADORS} per parent. The rate
 * — 0 allowed, linked but unpaid — lives on the child; omitted means the
 * global default in Settings applies at allocation time, live.
 */
export async function setAmbassadorParent(childId: string, input: SetParentInput) {
  const child = await db.ambassador.findUnique({
    where: { id: childId },
    select: { id: true, fullName: true, parentId: true, _count: { select: { children: true } } },
  });
  if (!child) throw new AmbassadorHierarchyError("Ambassador not found");

  if (input.parentId === null) {
    await db.ambassador.update({ where: { id: childId }, data: { parentId: null, parentCommRate: null } });
    return;
  }

  if (input.parentId === childId) {
    throw new AmbassadorHierarchyError("An ambassador can't be their own parent.");
  }
  if (input.rate != null && !isValidParentRate(input.rate)) {
    throw new AmbassadorHierarchyError("Enter a valid commission rate.");
  }
  if (child._count.children > 0) {
    throw new AmbassadorHierarchyError(
      `${child.fullName} already has sub-ambassadors of their own — the hierarchy is only one level deep.`
    );
  }

  const parent = await db.ambassador.findUnique({
    where: { id: input.parentId },
    select: {
      id: true,
      fullName: true,
      parentId: true,
      status: true,
      _count: { select: { children: true } },
    },
  });
  if (!parent) throw new AmbassadorHierarchyError("Parent ambassador not found");
  if (["Suspended", "Terminated"].includes(parent.status)) {
    throw new AmbassadorHierarchyError(`${parent.fullName} is ${parent.status.toLowerCase()}.`);
  }
  if (parent.parentId) {
    throw new AmbassadorHierarchyError(
      `${parent.fullName} is a sub-ambassador themselves — the hierarchy is only one level deep.`
    );
  }
  const existingChildren = parent._count.children - (child.parentId === parent.id ? 1 : 0);
  if (existingChildren >= MAX_SUB_AMBASSADORS) {
    throw new AmbassadorHierarchyError(
      `${parent.fullName} already has ${MAX_SUB_AMBASSADORS} sub-ambassadors — the maximum.`
    );
  }

  await db.ambassador.update({
    where: { id: childId },
    data: { parentId: parent.id, parentCommRate: input.rate ?? null },
  });
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

/** A refused edit or delete the admin can act on (shown in the dialog as-is). */
export class AmbassadorEditError extends Error {}

const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

/**
 * Status/tier change, or an admin correcting the profile. Not editable here:
 * the referral code and slot (shared links depend on them — the Manage tab
 * owns slots), parent (ParentAssignment) and the weekly-email opt-out, which
 * is the ambassador's own choice.
 *
 * A name change is copied to their roster slot, since the slot's name is what
 * the shared /EduCraftA links show. An email change is copied to their
 * sign-in when that login still uses the old address — the set-password code
 * only goes to a login whose own email matches the record, so leaving them
 * apart would lock the ambassador out of resetting their password.
 */
export async function updateAmbassador(id: string, input: UpdateAmbassadorInput) {
  const ambassador = await db.ambassador.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      legacySlotId: true,
      user: { select: { id: true, email: true, workerProfile: { select: { id: true, email: true } } } },
    },
  });
  if (!ambassador) throw new TransitionError("Ambassador not found");

  const data: Prisma.AmbassadorUncheckedUpdateInput = {};
  if (input.status) data.status = input.status;
  // Founder override on the provisional window. Reinstating starts a fresh 30
  // days but does not take a slot back — the old one may already be filled, so
  // it is reassigned from Manage.
  if (input.slotAction === "confirm") {
    data.activatedAt = new Date();
    data.provisionalUntil = null;
    data.provisionalWarnedAt = null;
  }
  if (input.slotAction === "reinstate") {
    data.status = "Active";
    data.activatedAt = null;
    data.provisionalUntil = provisionalDeadline();
    data.provisionalWarnedAt = null;
  }
  if (input.tier) data.tier = input.tier;
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phone !== undefined) data.phone = blank(input.phone);
  if (input.universityId !== undefined) {
    const uni = await db.university.findUnique({ where: { id: input.universityId }, select: { id: true } });
    if (!uni) throw new AmbassadorEditError("Pick a university from the list");
    data.universityId = input.universityId;
  }
  if (input.department !== undefined) data.department = blank(input.department);
  if (input.level !== undefined) data.level = blank(input.level);
  if (input.bankName !== undefined) data.bankName = blank(input.bankName);
  if (input.accountNumber !== undefined) data.accountNumber = blank(input.accountNumber);
  if (input.accountName !== undefined) data.accountName = blank(input.accountName);

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const oldEmail = ambassador.email?.trim().toLowerCase() ?? null;
  const newEmail = input.email === undefined ? undefined : input.email.trim() || null;

  if (newEmail !== undefined && newEmail?.toLowerCase() !== oldEmail) {
    const user = ambassador.user;
    if (user && !newEmail) {
      throw new AmbassadorEditError("They sign in with this email, so it can't be removed. Change it instead.");
    }
    data.email = newEmail;
    const loginUsesOld = user && oldEmail && user.email.toLowerCase() === oldEmail;
    if (user && newEmail && loginUsesOld) {
      const taken = await db.user.findFirst({
        where: { email: { equals: newEmail, mode: "insensitive" }, id: { not: user.id } },
        select: { id: true },
      });
      if (taken) throw new AmbassadorEditError("Another HQ login already uses that email.");
      writes.push(db.user.update({ where: { id: user.id }, data: { email: newEmail.toLowerCase() } }));
      // Same person's worker profile, when it carried the same old address.
      const worker = user.workerProfile;
      if (worker && worker.email?.trim().toLowerCase() === oldEmail) {
        writes.push(db.worker.update({ where: { id: worker.id }, data: { email: newEmail } }));
      }
    }
  }

  if (input.fullName !== undefined && ambassador.legacySlotId) {
    writes.push(
      db.ambassadorSlot.updateMany({
        where: { code: ambassador.legacySlotId, vacant: false },
        data: { name: input.fullName },
      })
    );
  }

  const [updated] = await db.$transaction([
    db.ambassador.update({ where: { id }, data, select: { status: true, tier: true } }),
    ...writes,
  ]);
  return updated;
}

/**
 * Removes an ambassador outright — for a duplicate, a test record or someone
 * added by mistake. Refused once they have any history (jobs, commissions,
 * referred clients, sub-ambassadors): deleting would wipe commission records
 * and orphan those rows, so Terminate is the answer there. Their slot is
 * emptied for the next applicant, click history is kept (detached, as a
 * vacant slot's would be), and the login is deactivated, not deleted, unless
 * it still carries an active worker profile.
 */
export async function deleteAmbassador(id: string): Promise<void> {
  const ambassador = await db.ambassador.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      legacySlotId: true,
      _count: { select: { projects: true, subReferredProjects: true, referredClients: true, children: true } },
    },
  });
  if (!ambassador) throw new TransitionError("Ambassador not found");

  const c = ambassador._count;
  const history = [
    c.projects + c.subReferredProjects > 0 ? `${c.projects + c.subReferredProjects} job(s)` : null,
    c.referredClients > 0 ? `${c.referredClients} referred client(s)` : null,
    c.children > 0 ? `${c.children} sub-ambassador(s)` : null,
  ].filter(Boolean);
  if (history.length > 0) {
    throw new AmbassadorEditError(
      `They have ${history.join(", ")} on record, and deleting would erase that history. Set their status to Terminated instead.`
    );
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [
    db.ambassadorApplication.updateMany({ where: { ambassadorId: id }, data: { ambassadorId: null } }),
    db.ambassador.delete({ where: { id } }),
  ];
  if (ambassador.legacySlotId) {
    // The ambassador row goes with it, so only the slot side needs emptying.
    writes.push(
      db.ambassadorSlot.updateMany({ where: { code: ambassador.legacySlotId }, data: { name: "", vacant: true } })
    );
  }
  if (ambassador.userId) {
    const activeWorker = await db.worker.count({
      where: { userId: ambassador.userId, status: { in: ["Active", "On Break"] } },
    });
    if (activeWorker === 0) {
      writes.push(db.user.update({ where: { id: ambassador.userId }, data: { isActive: false } }));
    }
  }
  await db.$transaction(writes);
}
