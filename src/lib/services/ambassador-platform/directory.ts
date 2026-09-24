import { Prisma, type AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { activityStatus, buildReferralCode, calculateTier, conversionsTillNextTier, isEligibleForSubTeam, nextTier, tierProgressPercent, type ActivityStatus } from "@/lib/ambassadors/tier-utils";
import { MAX_SUB_AMBASSADORS } from "@/lib/commission";
import { nextId } from "@/lib/services/projects";
import { setAmbassadorParent, AmbassadorHierarchyError } from "@/lib/services/ambassadors";
import { currentMonthKey, monthLabel, quarterOf } from "@/lib/services/finance/surplus";
import { recountAmbassador } from "@/lib/services/ambassador-platform/conversions";
import type { CreateDirectoryAmbassadorInput, DirectoryQuery } from "@/lib/validations/ambassador-platform";

/**
 * The Ambassador Directory (Phase 3, Section 2): every ambassador with the
 * platform's view of them — tier from lifetime conversions, activity from
 * dates, Core/Sub from `parentId`. Reads are cheap: the counters are cached
 * on the row by `recountAmbassador`.
 */

export const DIRECTORY_PAGE_SIZE = 25;
const CLOSED_STATUSES = ["Suspended", "Terminated"];

export interface DirectoryRow {
  id: string;
  ambassadorId: string;
  fullName: string;
  phone: string | null;
  university: string | null;
  universityId: string;
  tier: AmbassadorTier;
  lifetimeConversions: number;
  lifetimeReferrals: number;
  activity: ActivityStatus;
  /** Account state: Active, Paused, Suspended, Terminated, Lapsed. */
  status: string;
  subCount: number;
  parent: { id: string; fullName: string } | null;
  joinedAt: string;
  lastReferralAt: string | null;
  lastConversionAt: string | null;
  referralCode: string;
}

export interface DirectoryResult {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

const ROW_SELECT = {
  id: true,
  ambassadorId: true,
  fullName: true,
  phone: true,
  universityId: true,
  university: { select: { abbreviation: true } },
  tier: true,
  status: true,
  lifetimeConversions: true,
  lifetimeReferrals: true,
  lastReferralAt: true,
  lastConversionAt: true,
  createdAt: true,
  referralCode: true,
  parentId: true,
  parent: { select: { id: true, fullName: true } },
  _count: { select: { children: true } },
} satisfies Prisma.AmbassadorSelect;

type RowSource = Prisma.AmbassadorGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(a: RowSource, now: Date): DirectoryRow {
  return {
    id: a.id,
    ambassadorId: a.ambassadorId,
    fullName: a.fullName,
    phone: a.phone,
    university: a.university?.abbreviation ?? null,
    universityId: a.universityId,
    tier: a.tier,
    lifetimeConversions: a.lifetimeConversions,
    lifetimeReferrals: a.lifetimeReferrals,
    activity: activityStatus(a, now),
    status: a.status,
    subCount: a._count.children,
    parent: a.parent,
    joinedAt: a.createdAt.toISOString(),
    lastReferralAt: a.lastReferralAt?.toISOString() ?? null,
    lastConversionAt: a.lastConversionAt?.toISOString() ?? null,
    referralCode: a.referralCode,
  };
}

function dayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * The directory rows. Tier, school, role and join date filter in the
 * database; the activity label is derived from dates, so it is filtered
 * (and sorted) in memory — the network is a few hundred rows at most.
 */
export async function listDirectory(q: DirectoryQuery, now: Date = new Date()): Promise<DirectoryResult> {
  const where: Prisma.AmbassadorWhereInput = {
    ...(q.includeClosed ? {} : { status: { notIn: CLOSED_STATUSES } }),
    ...(q.tier ? { tier: q.tier } : {}),
    ...(q.school ? { universityId: q.school } : {}),
    ...(q.role === "core" ? { parentId: null, children: { some: {} } } : q.role === "sub" ? { parentId: { not: null } } : q.role === "solo" ? { parentId: null, children: { none: {} } } : {}),
    ...(q.joinedFrom || q.joinedTo
      ? { createdAt: { ...(q.joinedFrom ? { gte: dayStart(q.joinedFrom) } : {}), ...(q.joinedTo ? { lt: new Date(dayStart(q.joinedTo).getTime() + 86_400_000) } : {}) } }
      : {}),
    ...(q.q
      ? {
          OR: [
            { fullName: { contains: q.q, mode: "insensitive" } },
            { phone: { contains: q.q, mode: "insensitive" } },
            { ambassadorId: { contains: q.q, mode: "insensitive" } },
            { referralCode: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const all = (await db.ambassador.findMany({ where, select: ROW_SELECT })).map((a) => toRow(a, now));
  const filtered = q.status ? all.filter((r) => r.activity === q.status) : all;

  const sort = q.sort ?? "conversions";
  const dir = q.dir ?? (sort === "name" ? "asc" : "desc");
  const sign = dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    let c = 0;
    if (sort === "conversions") c = a.lifetimeConversions - b.lifetimeConversions || a.fullName.localeCompare(b.fullName);
    else if (sort === "lastReferral") c = (a.lastReferralAt ?? "").localeCompare(b.lastReferralAt ?? "");
    else if (sort === "joined") c = a.joinedAt.localeCompare(b.joinedAt);
    else c = a.fullName.localeCompare(b.fullName);
    return c * sign;
  });

  const page = Math.max(1, q.page ?? 1);
  const start = (page - 1) * DIRECTORY_PAGE_SIZE;
  return {
    rows: filtered.slice(start, start + DIRECTORY_PAGE_SIZE),
    total: filtered.length,
    page,
    pageCount: Math.max(1, Math.ceil(filtered.length / DIRECTORY_PAGE_SIZE)),
    pageSize: DIRECTORY_PAGE_SIZE,
  };
}

/** The four activity labels over the whole open network, for the directory's stat row. */
export async function directoryActivityCounts(now: Date = new Date()): Promise<Record<ActivityStatus, number> & { total: number }> {
  const rows = await db.ambassador.findMany({
    where: { status: { notIn: CLOSED_STATUSES } },
    select: { lastConversionAt: true, createdAt: true, lifetimeConversions: true },
  });
  const counts = { ACTIVE: 0, DORMANT: 0, INACTIVE: 0, NEW: 0, total: rows.length };
  for (const r of rows) counts[activityStatus(r, now)] += 1;
  return counts;
}

/** Cores a new Sub could be placed under: Silver+, open, not a Sub themselves. */
export async function listCoreOptions(): Promise<{ id: string; fullName: string; tier: AmbassadorTier; subCount: number }[]> {
  const rows = await db.ambassador.findMany({
    where: { parentId: null, tier: { not: "BRONZE" }, status: { notIn: CLOSED_STATUSES } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, tier: true, _count: { select: { children: true } } },
  });
  return rows.map((c) => ({ id: c.id, fullName: c.fullName, tier: c.tier, subCount: c._count.children }));
}

export async function directoryFilterOptions(): Promise<{ schools: { id: string; abbreviation: string; name: string }[] }> {
  const schools = await db.university.findMany({ where: { ambassadors: { some: {} } }, orderBy: { abbreviation: "asc" }, select: { id: true, abbreviation: true, name: true } });
  return { schools };
}

// ── Detail ────────────────────────────────────────────────────────────────

export interface ChallengeView {
  quarter: string;
  label: string;
  actualCount: number;
  targetCount: number;
  endDate: string;
  extensionGranted: boolean;
  extensionEndDate: string | null;
  completed: boolean;
  bonusPaid: boolean;
  bonusAmount: number;
  /** IN_PROGRESS, COMPLETED, EXPIRED, NOT_STARTED */
  state: "IN_PROGRESS" | "COMPLETED" | "EXPIRED" | "NOT_STARTED";
  daysLeft: number;
}

export interface ReferralHistoryRow {
  id: string;
  submittedAt: string;
  convertedAt: string | null;
  clientName: string;
  clientId: string | null;
  projectCode: string | null;
  serviceName: string | null;
  status: string;
  source: string;
  commission: number | null;
}

export interface EarningsMonth {
  month: string;
  label: string;
  owed: number;
  paid: number;
  status: "PAID" | "PENDING" | "PARTLY";
  paidAt: string | null;
}

export interface CommissionBreakdown {
  month: string;
  label: string;
  personal: { count: number; amount: number };
  overrides: { subId: string; subName: string; subTier: AmbassadorTier; count: number; amount: number }[];
  total: number;
  unpaid: number;
}

export interface DirectoryDetail {
  id: string;
  fullName: string;
  tier: AmbassadorTier;
  activity: ActivityStatus;
  status: string;
  referralCode: string;
  recruitedBy: string | null;
  recruitedByType: string | null;
  recruiterName: string | null;
  notes: string | null;
  suspendedAt: string | null;
  performance: {
    referrals: number;
    conversions: number;
    conversionRate: number | null;
    lifetimeEarnings: number;
    nextTier: AmbassadorTier | null;
    toNext: number | null;
    percent: number;
  };
  quarter: { label: string; conversions: number; challenge: ChallengeView };
  subTeam: { id: string; ambassadorId: string; fullName: string; tier: AmbassadorTier; lifetimeConversions: number; activity: ActivityStatus }[];
  subSlotsLeft: number;
  canHaveSubs: boolean;
  parent: { id: string; fullName: string; tier: AmbassadorTier } | null;
  commission: CommissionBreakdown;
  referralHistory: ReferralHistoryRow[];
  earnings: EarningsMonth[];
}

function quarterBounds(month: string): { start: Date; end: Date; key: string; label: string } {
  const q = quarterOf(month);
  const [fy, fm] = q.months[0].split("-").map(Number);
  const [ty, tm] = q.months[q.months.length - 1].split("-").map(Number);
  const [, num] = q.key.split("-Q");
  return { start: new Date(Date.UTC(fy, fm - 1, 1)), end: new Date(Date.UTC(ty, tm, 1)), key: `Q${num}-${fy}`, label: q.label };
}

export async function getChallengeView(ambassadorId: string, month: string = currentMonthKey(), now: Date = new Date()): Promise<{ conversions: number; challenge: ChallengeView; label: string }> {
  const { start, end, key, label } = quarterBounds(month);
  const [row, conversions] = await Promise.all([
    db.ambassadorQuarterlyChallenge.findUnique({ where: { ambassadorId_quarter: { ambassadorId, quarter: key } } }),
    db.ambassadorReferral.count({ where: { ambassadorId, status: "CONVERTED", convertedAt: { gte: start, lt: end } } }),
  ]);
  const endDate = row?.extensionGranted && row.extensionEndDate ? row.extensionEndDate : (row?.endDate ?? end);
  const target = row?.targetCount ?? 10;
  const actual = row?.completed ? Math.max(row.actualCount, conversions) : conversions;
  const completed = row?.completed ?? actual >= target;
  const state: ChallengeView["state"] = completed ? "COMPLETED" : now.getTime() >= endDate.getTime() ? "EXPIRED" : actual > 0 || row ? "IN_PROGRESS" : "NOT_STARTED";
  return {
    conversions,
    label,
    challenge: {
      quarter: key,
      label,
      actualCount: actual,
      targetCount: target,
      endDate: endDate.toISOString(),
      extensionGranted: row?.extensionGranted ?? false,
      extensionEndDate: row?.extensionEndDate?.toISOString() ?? null,
      completed,
      bonusPaid: row?.bonusPaid ?? false,
      bonusAmount: row?.bonusAmount ?? 35000,
      state,
      daysLeft: Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86_400_000)),
    },
  };
}

async function commissionBreakdown(ambassadorId: string, month: string): Promise<CommissionBreakdown> {
  const rows = await db.payoutRecord.findMany({
    where: { recipientType: "AMBASSADOR", recipientId: ambassadorId, month, status: { not: "CANCELLED" } },
    select: { leg: true, amount: true, status: true, project: { select: { ambassador: { select: { id: true, fullName: true, tier: true } } } } },
  });
  const personal = rows.filter((r) => r.leg === "AMBASSADOR");
  const overrideMap = new Map<string, CommissionBreakdown["overrides"][number]>();
  for (const r of rows.filter((r) => r.leg === "PARENT")) {
    const sub = r.project?.ambassador;
    const key = sub?.id ?? "unknown";
    const cur = overrideMap.get(key) ?? { subId: key, subName: sub?.fullName ?? "Sub-ambassador", subTier: sub?.tier ?? "BRONZE", count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += r.amount;
    overrideMap.set(key, cur);
  }
  const total = Math.round(rows.reduce((s, r) => s + r.amount, 0));
  const unpaid = Math.round(rows.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0));
  return {
    month,
    label: monthLabel(month),
    personal: { count: personal.length, amount: Math.round(personal.reduce((s, r) => s + r.amount, 0)) },
    overrides: [...overrideMap.values()].map((o) => ({ ...o, amount: Math.round(o.amount) })),
    total,
    unpaid,
  };
}

async function earningsByMonth(ambassadorId: string): Promise<EarningsMonth[]> {
  const rows = await db.payoutRecord.findMany({
    where: { recipientType: "AMBASSADOR", recipientId: ambassadorId, status: { not: "CANCELLED" } },
    select: { month: true, amount: true, status: true, paidAt: true },
  });
  const map = new Map<string, EarningsMonth & { paidDates: string[] }>();
  for (const r of rows) {
    const cur = map.get(r.month) ?? { month: r.month, label: monthLabel(r.month), owed: 0, paid: 0, status: "PENDING" as const, paidAt: null, paidDates: [] };
    cur.owed += r.amount;
    if (r.status === "PAID") {
      cur.paid += r.amount;
      if (r.paidAt) cur.paidDates.push(r.paidAt.toISOString());
    }
    map.set(r.month, cur);
  }
  return [...map.values()]
    .map(({ paidDates, ...m }): EarningsMonth => ({
      ...m,
      owed: Math.round(m.owed),
      paid: Math.round(m.paid),
      status: m.paid >= m.owed ? "PAID" : m.paid > 0 ? "PARTLY" : "PENDING",
      paidAt: paidDates.length ? paidDates.sort().at(-1)! : null,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export async function getDirectoryDetail(id: string, now: Date = new Date()): Promise<DirectoryDetail | null> {
  const a = await db.ambassador.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      tier: true,
      status: true,
      referralCode: true,
      recruitedBy: true,
      recruitedByType: true,
      notes: true,
      suspendedAt: true,
      lifetimeReferrals: true,
      lifetimeConversions: true,
      lifetimeEarnings: true,
      lastConversionAt: true,
      createdAt: true,
      parent: { select: { id: true, fullName: true, tier: true } },
      children: { orderBy: { lifetimeConversions: "desc" }, select: { id: true, ambassadorId: true, fullName: true, tier: true, lifetimeConversions: true, lastConversionAt: true, createdAt: true } },
    },
  });
  if (!a) return null;
  const month = currentMonthKey(now);
  const [quarter, commission, referrals, earnings, recruiter] = await Promise.all([
    getChallengeView(id, month, now),
    commissionBreakdown(id, month),
    db.ambassadorReferral.findMany({
      where: { ambassadorId: id },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: {
        id: true,
        submittedAt: true,
        convertedAt: true,
        clientName: true,
        status: true,
        source: true,
        client: { select: { clientId: true } },
        project: { select: { id: true, projectId: true, service: { select: { serviceName: true } }, payoutRecords: { where: { leg: "AMBASSADOR", recipientId: id, status: { not: "CANCELLED" } }, select: { amount: true } } } },
      },
    }),
    earningsByMonth(id),
    a.recruitedBy && a.recruitedByType === "HOG"
      ? db.user.findUnique({ where: { id: a.recruitedBy }, select: { displayName: true, execProfile: { select: { fullName: true } } } }).then((u) => u?.execProfile?.fullName ?? u?.displayName ?? null)
      : a.recruitedBy && a.recruitedByType === "AMBASSADOR"
        ? db.ambassador.findUnique({ where: { id: a.recruitedBy }, select: { fullName: true } }).then((x) => x?.fullName ?? null)
        : Promise.resolve(null),
  ]);
  const conversions = a.lifetimeConversions;
  return {
    id: a.id,
    fullName: a.fullName,
    tier: a.tier,
    activity: activityStatus(a, now),
    status: a.status,
    referralCode: a.referralCode,
    recruitedBy: a.recruitedBy,
    recruitedByType: a.recruitedByType,
    recruiterName: recruiter,
    notes: a.notes,
    suspendedAt: a.suspendedAt?.toISOString() ?? null,
    performance: {
      referrals: a.lifetimeReferrals,
      conversions,
      conversionRate: a.lifetimeReferrals > 0 ? Math.round((conversions / a.lifetimeReferrals) * 100) : null,
      lifetimeEarnings: a.lifetimeEarnings,
      nextTier: nextTier(a.tier),
      toNext: conversionsTillNextTier(conversions),
      percent: tierProgressPercent(conversions),
    },
    quarter: { label: quarter.label, conversions: quarter.conversions, challenge: quarter.challenge },
    subTeam: a.children.map((c) => ({ id: c.id, ambassadorId: c.ambassadorId, fullName: c.fullName, tier: c.tier, lifetimeConversions: c.lifetimeConversions, activity: activityStatus(c, now) })),
    subSlotsLeft: Math.max(0, MAX_SUB_AMBASSADORS - a.children.length),
    canHaveSubs: !a.parent && isEligibleForSubTeam(a.tier),
    parent: a.parent,
    commission,
    referralHistory: referrals.map((r) => ({
      id: r.id,
      submittedAt: r.submittedAt.toISOString(),
      convertedAt: r.convertedAt?.toISOString() ?? null,
      clientName: r.clientName,
      clientId: r.client?.clientId ?? null,
      projectCode: r.project?.projectId ?? null,
      serviceName: r.project?.service.serviceName ?? null,
      status: r.status,
      source: r.source,
      commission: r.project ? Math.round(r.project.payoutRecords.reduce((s, p) => s + p.amount, 0)) || null : null,
    })),
    earnings,
  };
}

// ── Writes ────────────────────────────────────────────────────────────────

export class DirectoryError extends Error {}

/** Ambassadors a Core could take on: solo, active, not already under someone, not the Core. */
export async function listSubCandidates(coreId: string): Promise<{ id: string; ambassadorId: string; fullName: string; tier: AmbassadorTier }[]> {
  return db.ambassador.findMany({
    where: { id: { not: coreId }, parentId: null, status: { notIn: CLOSED_STATUSES }, children: { none: {} } },
    orderBy: { fullName: "asc" },
    select: { id: true, ambassadorId: true, fullName: true, tier: true },
  });
}

/**
 * "New ambassador": a Core (stands alone) or a Sub under a named Core. The
 * referral code is BLE-LAG-847 style, regenerated on a clash. Recruited by
 * the HOG who added them.
 */
export async function createDirectoryAmbassador(input: CreateDirectoryAmbassadorInput, createdById: string): Promise<{ id: string; ambassadorId: string; referralCode: string }> {
  const uni = await db.university.findUnique({ where: { id: input.universityId }, select: { id: true, abbreviation: true } });
  if (!uni) throw new DirectoryError("Pick a university from the list");
  let core: { id: string; fullName: string; tier: AmbassadorTier; parentId: string | null; status: string; _count: { children: number } } | null = null;
  if (!input.isCore) {
    core = await db.ambassador.findUnique({ where: { id: input.coreAmbassadorId || "" }, select: { id: true, fullName: true, tier: true, parentId: true, status: true, _count: { select: { children: true } } } });
    if (!core) throw new DirectoryError("Pick the Core ambassador they work under");
    if (core.parentId) throw new DirectoryError(`${core.fullName} is a Sub-ambassador — a sub-team is one level deep`);
    if (!isEligibleForSubTeam(core.tier)) throw new DirectoryError(`${core.fullName} is Bronze: a Core needs Silver or above (6 conversions) to take on Sub-ambassadors`);
    if (core._count.children >= MAX_SUB_AMBASSADORS) throw new DirectoryError(`${core.fullName} already has ${MAX_SUB_AMBASSADORS} Sub-ambassadors, the maximum`);
    if (CLOSED_STATUSES.includes(core.status)) throw new DirectoryError(`${core.fullName} is ${core.status.toLowerCase()}`);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await db.ambassador.create({
        data: {
          ambassadorId: await nextId("AMBASSADOR"),
          fullName: input.fullName,
          phone: input.phone,
          email: input.email || null,
          universityId: uni.id,
          department: input.department || null,
          level: input.level || null,
          referralCode: attempt === 0 && input.referralCode ? input.referralCode : buildReferralCode(input.fullName, uni.abbreviation),
          tier: calculateTier(0),
          status: "Active",
          notes: input.notes || null,
          recruitedBy: createdById,
          recruitedByType: "HOG",
          parentId: core?.id ?? null,
          bankName: input.bankName || null,
          accountNumber: input.accountNumber || null,
          accountName: input.accountName || null,
        },
        select: { id: true, ambassadorId: true, referralCode: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 5) continue;
      throw error;
    }
  }
  throw new DirectoryError("Could not allocate an ambassador id — try again");
}

/**
 * Suspend: no new referrals count for them and their portal login is switched
 * off — unless that same login still carries an active worker profile (one
 * login per person), in which case only the ambassador side closes. The
 * reason, if given, is appended to the HOG's notes so it is never lost.
 */
export async function suspendAmbassador(id: string, byId: string, reason?: string): Promise<void> {
  const a = await db.ambassador.findUnique({
    where: { id },
    select: { id: true, status: true, notes: true, userId: true, user: { select: { workerProfile: { select: { status: true } } } } },
  });
  if (!a) throw new DirectoryError("Ambassador not found");
  if (a.status === "Suspended") throw new DirectoryError("Already suspended");
  if (a.status === "Terminated") throw new DirectoryError("A terminated ambassador cannot be suspended");
  const workerStillActive = ["Active", "On Break"].includes(a.user?.workerProfile?.status ?? "");
  const writes: Prisma.PrismaPromise<unknown>[] = [
    db.ambassador.update({
      where: { id },
      data: {
        status: "Suspended",
        suspendedAt: new Date(),
        suspendedBy: byId,
        ...(reason ? { notes: [a.notes, `Suspended ${new Date().toISOString().slice(0, 10)}: ${reason}`].filter(Boolean).join("\n") } : {}),
      },
    }),
  ];
  if (a.userId && !workerStillActive) writes.push(db.user.update({ where: { id: a.userId }, data: { isActive: false } }));
  await db.$transaction(writes);
}

/** Reactivate a suspended, paused or lapsed ambassador and switch their login back on. */
export async function activateAmbassador(id: string): Promise<void> {
  const a = await db.ambassador.findUnique({ where: { id }, select: { id: true, status: true, userId: true } });
  if (!a) throw new DirectoryError("Ambassador not found");
  if (a.status === "Active") throw new DirectoryError("Already active");
  if (a.status === "Terminated") throw new DirectoryError("A terminated ambassador cannot be reactivated here — set their status from the profile");
  const writes: Prisma.PrismaPromise<unknown>[] = [
    db.ambassador.update({ where: { id }, data: { status: "Active", suspendedAt: null, suspendedBy: null } }),
  ];
  if (a.userId) writes.push(db.user.update({ where: { id: a.userId }, data: { isActive: true } }));
  await db.$transaction(writes);
}

/** Put `subId` under `coreId`: the Core must be Silver+ and have room; one level deep. */
export async function addSubAmbassador(coreId: string, subId: string): Promise<void> {
  const core = await db.ambassador.findUnique({ where: { id: coreId }, select: { id: true, fullName: true, tier: true, parentId: true } });
  if (!core) throw new DirectoryError("Core ambassador not found");
  if (core.parentId) throw new DirectoryError(`${core.fullName} is a Sub-ambassador themselves — a sub-team is one level deep`);
  if (!isEligibleForSubTeam(core.tier)) throw new DirectoryError(`${core.fullName} is Bronze: a Core needs Silver or above (6 conversions) before taking on Sub-ambassadors`);
  try {
    await setAmbassadorParent(subId, { parentId: coreId });
  } catch (error) {
    if (error instanceof AmbassadorHierarchyError) throw new DirectoryError(error.message);
    throw error;
  }
}

export async function removeSubAmbassador(coreId: string, subId: string): Promise<void> {
  const sub = await db.ambassador.findUnique({ where: { id: subId }, select: { id: true, parentId: true } });
  if (!sub || sub.parentId !== coreId) throw new DirectoryError("That ambassador is not in this sub-team");
  await setAmbassadorParent(subId, { parentId: null });
}

/** Recount one ambassador outside a transaction (after a link change, an admin edit, a backfill). */
export async function recount(ambassadorId: string) {
  return db.$transaction((tx) => recountAmbassador(tx, ambassadorId), { timeout: 30_000, maxWait: 10_000 });
}
