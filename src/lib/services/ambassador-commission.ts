import type { AmbassadorTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  AMBASSADOR_COMMISSION_CATEGORY,
  MAX_COMMISSION_RATE,
  MIN_COMMISSION_RATE,
  PARENT_ACTIVATION_TIERS,
  PARENT_COMMISSION_CATEGORY,
  commissionFor,
  isValidCommissionRate,
} from "@/lib/commission";
import { commissionEmail } from "@/lib/emails/commission";
import { parentCommissionEmail } from "@/lib/emails/parent-commission";
import { sendMail } from "@/lib/mailer";
import { notifyUsers } from "@/lib/services/notifications";
import { getCommissionRates, getDefaultParentCommissionRate } from "@/lib/services/settings";
import { syncPaymentAmbassadorSnapshot, syncProjectBuckets } from "@/lib/services/finance/buckets";
import { reconcileProjectPayouts } from "@/lib/services/finance/payouts-engine";
import { COMMISSION_RATES } from "@/lib/finance/commission-config";
import { formatNaira } from "@/lib/utils";

/**
 * Allocating a job to the ambassador who brought it in.
 *
 * One allocation = one commission, logged the moment it's made:
 *   - the job's ambassador, rate, commission and EduCraft revenue are set —
 *     the commission comes straight off the job price;
 *   - an "Ambassador commission" expense is written (one per job, linked by
 *     projectId), which is how the finance dashboard counts it;
 *   - the ambassador is emailed, the way the original panel's Tracking "Log"
 *     did. A referral that arrives through the public intake form is emailed
 *     only once its downpayment is verified, so a stray form submission never
 *     tells an ambassador they've earned money.
 *   - if that ambassador has a parent (Core) who has reached Silver, the
 *     parent's own cut — a second, independent rate, admin-set — comes off
 *     the same job, is logged as its own expense, and the parent is emailed
 *     too, on the same deferred-until-verified rule.
 * Cancelling or refunding the job releases both commissions and their
 * expenses. Paying a commission out later (Payouts) records the cash leaving
 * but does not deduct it a second time — the expense already did.
 */

export class CommissionError extends Error {}

type Tx = Prisma.TransactionClient;

/** "Lapsed" is a provisional slot that ran out — they can no longer be allocated a job. */
const INACTIVE_STATUSES = ["Suspended", "Terminated", "Lapsed"];
/** Jobs that no longer earn a commission. */
const DEAD_STATUSES = ["CANCELLED", "REFUNDED"] as const;

// ── Rate resolution ──────────────────────────────────────────────────────

/**
 * An active ambassador plus the rate to allocate at: the one the admin chose,
 * or their tier rate from Settings.
 */
export async function resolveAmbassadorRate(
  ambassadorId: string,
  rate?: number | null
): Promise<{ id: string; fullName: string; rate: number }> {
  const ambassador = await db.ambassador.findUnique({
    where: { id: ambassadorId },
    select: { id: true, fullName: true, tier: true, status: true },
  });
  if (!ambassador) throw new CommissionError("Ambassador not found");
  if (INACTIVE_STATUSES.includes(ambassador.status)) {
    throw new CommissionError(
      `${ambassador.fullName} is ${ambassador.status.toLowerCase()} and can't be allocated jobs.`
    );
  }

  const resolved = rate ?? (await getCommissionRates())[ambassador.tier];
  if (!isValidCommissionRate(resolved)) {
    throw new CommissionError(
      `Commission must be between ${MIN_COMMISSION_RATE}% and ${MAX_COMMISSION_RATE}%.`
    );
  }
  return { id: ambassador.id, fullName: ambassador.fullName, rate: resolved };
}

export interface ResolvedParent {
  id: string;
  fullName: string;
  rate: number;
}

/**
 * The ambassador's parent (Core), if one is linked, active, and has reached
 * Silver — CLAUDE.md's "requires Silver tier to activate". Returns null
 * otherwise; allocation just proceeds without a parent commission, never an
 * error, since the child ambassador is still perfectly valid on their own.
 *
 * v2.0 (Phase 2): EduCraft pays 15% in total on a referred job, so the Core
 * earns 15 minus the sub's own rate on this job (a Bronze sub at 10% leaves
 * 5%; a Gold sub at 15% leaves nothing). An admin override on the link can
 * only lower that, never raise it.
 */
export async function resolveParentCommission(childId: string, childRatePercent: number): Promise<ResolvedParent | null> {
  const child = await db.ambassador.findUnique({
    where: { id: childId },
    select: {
      parentCommRate: true,
      parentCommRateIsOverride: true,
      parent: { select: { id: true, fullName: true, tier: true, status: true } },
    },
  });
  const parent = child?.parent;
  if (!parent) return null;
  if (INACTIVE_STATUSES.includes(parent.status)) return null;
  if (!(PARENT_ACTIVATION_TIERS as readonly string[]).includes(parent.tier)) return null;

  const standard = Math.max(0, Math.round((COMMISSION_RATES.ambassador * 100 - childRatePercent) * 100) / 100);
  const rate = child.parentCommRateIsOverride && child.parentCommRate != null ? Math.min(child.parentCommRate, standard) : standard;
  if (rate <= 0) return null;
  return { id: parent.id, fullName: parent.fullName, rate };
}

function workerPayoutOf(project: { price: number; workerPayout: number | null; workerPayoutRate: number }) {
  return project.workerPayout ?? Math.round((project.price * (project.workerPayoutRate || 40)) / 100);
}

// ── Expense bookkeeping ──────────────────────────────────────────────────

async function upsertExpense(
  tx: Tx,
  entry: { projectDbId: string; category: string; description: string; amount: number; date: Date }
): Promise<void> {
  const existing = await tx.expense.findFirst({
    where: { projectId: entry.projectDbId, category: entry.category },
    select: { id: true },
  });
  if (existing) {
    // Keep the original date: the commission belongs to the month the job was
    // first allocated, even if it's later moved to another ambassador.
    await tx.expense.update({
      where: { id: existing.id },
      data: { description: entry.description, amount: entry.amount },
    });
    return;
  }
  await tx.expense.create({
    data: {
      category: entry.category,
      description: entry.description,
      amount: entry.amount,
      date: entry.date,
      recurring: false,
      projectId: entry.projectDbId,
    },
  });
}

export async function upsertCommissionExpense(
  tx: Tx,
  entry: {
    projectDbId: string;
    projectCode: string;
    ambassadorName: string;
    rate: number;
    commission: number;
    date: Date;
  }
): Promise<void> {
  await upsertExpense(tx, {
    projectDbId: entry.projectDbId,
    category: AMBASSADOR_COMMISSION_CATEGORY,
    description: `${entry.ambassadorName} — ${entry.rate}% of ${entry.projectCode}`,
    amount: entry.commission,
    date: entry.date,
  });
}

export async function upsertParentCommissionExpense(
  tx: Tx,
  entry: {
    projectDbId: string;
    projectCode: string;
    parentName: string;
    subName: string;
    rate: number;
    commission: number;
    date: Date;
  }
): Promise<void> {
  await upsertExpense(tx, {
    projectDbId: entry.projectDbId,
    category: PARENT_COMMISSION_CATEGORY,
    description: `${entry.parentName} — ${entry.rate}% of ${entry.projectCode} (parent of ${entry.subName})`,
    amount: entry.commission,
    date: entry.date,
  });
}

async function removeCommissionExpense(tx: Tx, projectDbId: string): Promise<void> {
  await tx.expense.deleteMany({
    where: { projectId: projectDbId, category: AMBASSADOR_COMMISSION_CATEGORY },
  });
}

async function removeParentCommissionExpense(tx: Tx, projectDbId: string): Promise<void> {
  await tx.expense.deleteMany({
    where: { projectId: projectDbId, category: PARENT_COMMISSION_CATEGORY },
  });
}

/**
 * A cancelled or refunded job earns no commission: clear both legs off the
 * job and delete their expenses. The ambassador stays linked as the referrer.
 * Called inside the status-change transaction.
 */
export async function releaseCommission(tx: Tx, projectDbId: string): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectDbId },
    select: {
      price: true,
      workerPayout: true,
      workerPayoutRate: true,
      ambassadorCommission: true,
      ambassadorCommPaid: true,
      parentCommission: true,
      parentCommPaid: true,
    },
  });
  if (!project) return;

  const releaseAmbassador = project.ambassadorCommission != null && !project.ambassadorCommPaid;
  const releaseParent = project.parentCommission != null && !project.parentCommPaid;
  if (!releaseAmbassador && !releaseParent) return;

  await tx.project.update({
    where: { id: projectDbId },
    data: {
      ...(releaseAmbassador
        ? { ambassadorCommRate: null, ambassadorCommission: null, ambassadorAllocatedAt: null }
        : {}),
      ...(releaseParent
        ? { parentAmbassadorId: null, parentCommRate: null, parentCommission: null, parentNotifiedAt: null }
        : {}),
      educraftRevenue:
        project.price -
        workerPayoutOf(project) -
        (releaseAmbassador ? 0 : (project.ambassadorCommission ?? 0)) -
        (releaseParent ? 0 : (project.parentCommission ?? 0)),
    },
  });
  if (releaseAmbassador) await removeCommissionExpense(tx, projectDbId);
  if (releaseParent) await removeParentCommissionExpense(tx, projectDbId);
}

// ── Email ────────────────────────────────────────────────────────────────

export interface CommissionEmailStatus {
  sent: boolean;
  to: string | null;
  error?: string;
}

/**
 * Emails the ambassador about one job's commission (and, unless told not to,
 * drops an in-app notification if they have a portal login). Stamps
 * `ambassadorNotifiedAt` on success. Never throws — a mail failure must not
 * undo the allocation.
 */
export async function emailCommission(
  projectDbId: string,
  { inApp = true }: { inApp?: boolean } = {}
): Promise<CommissionEmailStatus | null> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectDbId },
      select: {
        projectId: true,
        price: true,
        projectTitle: true,
        ambassadorCommRate: true,
        ambassadorCommission: true,
        service: { select: { serviceName: true } },
        ambassador: { select: { fullName: true, email: true, userId: true } },
      },
    });
    if (!project?.ambassador || project.ambassadorCommission == null || project.ambassadorCommRate == null) {
      return null;
    }
    const { ambassador } = project;
    const rate = project.ambassadorCommRate;
    const commission = project.ambassadorCommission;

    if (inApp && ambassador.userId) {
      await notifyUsers([ambassador.userId], {
        title: "New commission",
        message: `${formatNaira(commission)} (${rate}%) on ${project.projectId}.`,
        type: "success",
        link: "/ambassador/commissions",
      }).catch(() => {});
    }

    if (!ambassador.email) return { sent: false, to: null, error: "No email address on file" };

    const title = project.projectTitle?.trim();
    const message = commissionEmail({
      ambassadorName: ambassador.fullName,
      projectCode: project.projectId,
      jobDescription: title ? `${project.service.serviceName} — ${title}` : project.service.serviceName,
      jobAmount: project.price,
      rate,
      commission,
    });
    const result = await sendMail({ to: ambassador.email, ...message });
    if (result.ok) {
      await db.project.update({ where: { id: projectDbId }, data: { ambassadorNotifiedAt: new Date() } });
    }
    return { sent: result.ok, to: ambassador.email, error: result.error };
  } catch (error) {
    console.error("[emailCommission]", error);
    return { sent: false, to: null, error: "Could not send the email" };
  }
}

/**
 * Emails the parent (Core) ambassador about the commission they earned from
 * a sub's job. Same shape as {@link emailCommission}, stamping
 * `parentNotifiedAt` instead. Never throws.
 */
export async function emailParentCommission(
  projectDbId: string,
  { inApp = true }: { inApp?: boolean } = {}
): Promise<CommissionEmailStatus | null> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectDbId },
      select: {
        projectId: true,
        price: true,
        projectTitle: true,
        parentCommRate: true,
        parentCommission: true,
        service: { select: { serviceName: true } },
        ambassador: { select: { fullName: true } },
        parentAmbassador: { select: { fullName: true, email: true, userId: true } },
      },
    });
    if (
      !project?.parentAmbassador ||
      !project.ambassador ||
      project.parentCommission == null ||
      project.parentCommRate == null
    ) {
      return null;
    }
    const parent = project.parentAmbassador;
    const rate = project.parentCommRate;
    const commission = project.parentCommission;

    if (inApp && parent.userId) {
      await notifyUsers([parent.userId], {
        title: "New parent commission",
        message: `${formatNaira(commission)} (${rate}%) on ${project.projectId}, via ${project.ambassador.fullName}.`,
        type: "success",
        link: "/ambassador/commissions",
      }).catch(() => {});
    }

    if (!parent.email) return { sent: false, to: null, error: "No email address on file" };

    const title = project.projectTitle?.trim();
    const message = parentCommissionEmail({
      parentName: parent.fullName,
      subName: project.ambassador.fullName,
      projectCode: project.projectId,
      jobDescription: title ? `${project.service.serviceName} — ${title}` : project.service.serviceName,
      jobAmount: project.price,
      rate,
      commission,
    });
    const result = await sendMail({ to: parent.email, ...message });
    if (result.ok) {
      await db.project.update({ where: { id: projectDbId }, data: { parentNotifiedAt: new Date() } });
    }
    return { sent: result.ok, to: parent.email, error: result.error };
  } catch (error) {
    console.error("[emailParentCommission]", error);
    return { sent: false, to: null, error: "Could not send the email" };
  }
}

/**
 * The downpayment on a referred job was just verified — email the ambassador
 * and, if there is one, the parent, whichever of them hasn't been emailed yet
 * (a public-intake referral, an earlier send that failed, or an allocation
 * saved without emailing).
 */
export async function emailPendingCommission(projectDbId: string): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: {
      ambassadorId: true,
      ambassadorCommission: true,
      ambassadorNotifiedAt: true,
      parentAmbassadorId: true,
      parentCommission: true,
      parentNotifiedAt: true,
    },
  });
  if (!project) return;
  if (project.ambassadorId && project.ambassadorCommission != null && !project.ambassadorNotifiedAt) {
    await emailCommission(projectDbId, { inApp: false });
  }
  if (project.parentAmbassadorId && project.parentCommission != null && !project.parentNotifiedAt) {
    await emailParentCommission(projectDbId, { inApp: false });
  }
  // The money is in: a provisional slot becomes permanent here. This is the one
  // place all three commission paths (admin allocation, public ?ref= intake,
  // manual project) meet after a downpayment is confirmed.
  if (project.ambassadorId) await graduateProvisional(project.ambassadorId);
}

/**
 * Their first confirmed order: the slot is theirs for good.
 *
 * Keyed on a confirmed downpayment, the same event that makes a referred
 * client a paying client for the tier ladder — this is what they agreed to
 * when they applied, and it is what the money says.
 */
export async function graduateProvisional(ambassadorId: string): Promise<void> {
  const claimed = await db.ambassador.updateMany({
    where: { id: ambassadorId, activatedAt: null, provisionalUntil: { not: null } },
    data: { activatedAt: new Date(), provisionalUntil: null, provisionalWarnedAt: null },
  });
  if (claimed.count === 0) return;

  const ambassador = await db.ambassador.findUnique({
    where: { id: ambassadorId },
    select: { userId: true, fullName: true },
  });
  if (!ambassador?.userId) return;
  await notifyUsers([ambassador.userId], {
    title: "Your slot is confirmed",
    message: "Your first referred order has been paid, so your ambassador slot is now permanently yours.",
    type: "success",
    link: "/ambassador",
  });
}

// ── Allocate / remove ────────────────────────────────────────────────────

export interface ParentAllocation {
  parentName: string;
  rate: number;
  commission: number;
  email: CommissionEmailStatus | null;
  emailLater: boolean;
}

export interface AllocationResult {
  ambassadorName: string;
  rate: number;
  commission: number;
  email: CommissionEmailStatus | null;
  /** Not emailed now; they will be once the downpayment is verified. */
  emailLater: boolean;
  /** Set when the ambassador has an activated parent — their cut, off the same job. */
  parent: ParentAllocation | null;
}

async function loadProject(idOrCode: string) {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      price: true,
      status: true,
      workerPayout: true,
      workerPayoutRate: true,
      ambassadorId: true,
      ambassadorCommPaid: true,
      ambassadorNotifiedAt: true,
      parentCommPaid: true,
      downpaymentStatus: true,
      client: { select: { id: true, referredById: true } },
    },
  });
  if (!project) throw new CommissionError("Project not found");
  if (project.ambassadorCommPaid || project.parentCommPaid) {
    throw new CommissionError(
      "This job's commission has already been paid out, so its ambassador can't be changed."
    );
  }
  return project;
}

export async function allocateAmbassador(input: {
  project: string;
  ambassadorId: string;
  rate?: number;
  notify: boolean;
}): Promise<AllocationResult> {
  const project = await loadProject(input.project);
  if ((DEAD_STATUSES as readonly string[]).includes(project.status)) {
    throw new CommissionError("Cancelled or refunded jobs don't earn a commission.");
  }

  const ambassador = await resolveAmbassadorRate(input.ambassadorId, input.rate);
  const commission = commissionFor(project.price, ambassador.rate);
  const sameAmbassador = project.ambassadorId === ambassador.id;
  const parentInfo = await resolveParentCommission(ambassador.id, ambassador.rate);
  const parentCommission = parentInfo ? commissionFor(project.price, parentInfo.rate) : null;
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        ambassadorId: ambassador.id,
        ambassadorCommRate: ambassador.rate,
        ambassadorCommission: commission,
        educraftRevenue: project.price - workerPayoutOf(project) - commission - (parentCommission ?? 0),
        ambassadorAllocatedAt: now,
        // A new ambassador hasn't been told yet; the same one keeps their stamp.
        ambassadorNotifiedAt: sameAmbassador ? project.ambassadorNotifiedAt : null,
        parentAmbassadorId: parentInfo?.id ?? null,
        parentCommRate: parentInfo?.rate ?? null,
        parentCommission,
        parentNotifiedAt: null,
      },
    });

    // The ambassador brought this client in — record it so the client counts
    // toward their tier once the downpayment is verified. An existing referrer
    // is left alone.
    if (!project.client.referredById) {
      await tx.client.update({
        where: { id: project.client.id },
        data: { referredById: ambassador.id },
      });
    }

    await upsertCommissionExpense(tx, {
      projectDbId: project.id,
      projectCode: project.projectId,
      ambassadorName: ambassador.fullName,
      rate: ambassador.rate,
      commission,
      date: now,
    });

    if (parentInfo && parentCommission != null) {
      await upsertParentCommissionExpense(tx, {
        projectDbId: project.id,
        projectCode: project.projectId,
        parentName: parentInfo.fullName,
        subName: ambassador.fullName,
        rate: parentInfo.rate,
        commission: parentCommission,
        date: now,
      });
    } else {
      await removeParentCommissionExpense(tx, project.id);
    }
    // The legs changed: EduCraft's retained share of any money already in changes with them.
    await syncPaymentAmbassadorSnapshot(tx, project.id);
    await syncProjectBuckets(tx, project.id, { reason: "REALLOCATION" });
    // A completed job's payout records follow its legs.
    await reconcileProjectPayouts(tx, project.id);
  }, { timeout: 20_000, maxWait: 10_000 });

  const email = input.notify ? await emailCommission(project.id) : null;
  const emailLater = !email?.sent && project.downpaymentStatus !== "Verified";

  let parent: ParentAllocation | null = null;
  if (parentInfo && parentCommission != null) {
    const parentEmail = input.notify ? await emailParentCommission(project.id) : null;
    parent = {
      parentName: parentInfo.fullName,
      rate: parentInfo.rate,
      commission: parentCommission,
      email: parentEmail,
      emailLater: !parentEmail?.sent && project.downpaymentStatus !== "Verified",
    };
  }

  return { ambassadorName: ambassador.fullName, rate: ambassador.rate, commission, email, emailLater, parent };
}

/** "None" — no ambassador referred this job. Clears any parent commission too. */
export async function removeAllocation(projectIdOrCode: string): Promise<void> {
  const project = await loadProject(projectIdOrCode);

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        ambassadorId: null,
        ambassadorCommRate: null,
        ambassadorCommission: null,
        ambassadorAllocatedAt: null,
        ambassadorNotifiedAt: null,
        parentAmbassadorId: null,
        parentCommRate: null,
        parentCommission: null,
        parentNotifiedAt: null,
        educraftRevenue: project.price - workerPayoutOf(project),
      },
    });
    await removeCommissionExpense(tx, project.id);
    await removeParentCommissionExpense(tx, project.id);
    await syncPaymentAmbassadorSnapshot(tx, project.id);
    await syncProjectBuckets(tx, project.id, { reason: "REALLOCATION" });
    // A completed job's payout records follow its legs.
    await reconcileProjectPayouts(tx, project.id);
  }, { timeout: 20_000, maxWait: 10_000 });
}

// ── Picker data ──────────────────────────────────────────────────────────

export interface AllocatableAmbassador {
  id: string;
  code: string;
  name: string;
  university: string | null;
  tier: AmbassadorTier;
  /** Default rate for their tier, from Settings. */
  tierRate: number;
  email: string | null;
  /** Their parent (Core), when linked, active, Silver+, and rated above 0. */
  parent: { id: string; name: string; rate: number } | null;
}

export async function listAllocatableAmbassadors(): Promise<AllocatableAmbassador[]> {
  const [rows, rates, defaultParentRate] = await Promise.all([
    db.ambassador.findMany({
      where: { status: { notIn: INACTIVE_STATUSES } },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        ambassadorId: true,
        fullName: true,
        tier: true,
        email: true,
        parentCommRate: true,
        parent: { select: { id: true, fullName: true, tier: true, status: true } },
        university: { select: { abbreviation: true } },
      },
    }),
    getCommissionRates(),
    getDefaultParentCommissionRate(),
  ]);
  return rows.map((a) => {
    const parentQualifies =
      a.parent != null &&
      !INACTIVE_STATUSES.includes(a.parent.status) &&
      (PARENT_ACTIVATION_TIERS as readonly string[]).includes(a.parent.tier);
    const parentRate = parentQualifies ? (a.parentCommRate ?? defaultParentRate) : 0;
    return {
      id: a.id,
      code: a.ambassadorId,
      name: a.fullName,
      university: a.university?.abbreviation ?? null,
      tier: a.tier,
      tierRate: rates[a.tier],
      email: a.email,
      parent:
        parentQualifies && parentRate > 0 && a.parent
          ? { id: a.parent.id, name: a.parent.fullName, rate: parentRate }
          : null,
    };
  });
}
