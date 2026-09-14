import type { AmbassadorTier, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  AMBASSADOR_COMMISSION_CATEGORY,
  MAX_COMMISSION_RATE,
  MIN_COMMISSION_RATE,
  commissionFor,
  isValidCommissionRate,
} from "@/lib/commission";
import { commissionEmail } from "@/lib/emails/commission";
import { sendMail } from "@/lib/mailer";
import { notifyUsers } from "@/lib/services/notifications";
import { getCommissionRates } from "@/lib/services/settings";
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
 * Cancelling or refunding the job releases the commission and its expense.
 * Paying the commission out later (Payouts) records the cash leaving but does
 * not deduct it a second time — the expense already did.
 */

export class CommissionError extends Error {}

type Tx = Prisma.TransactionClient;

const INACTIVE_STATUSES = ["Suspended", "Terminated"];
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

function workerPayoutOf(project: { price: number; workerPayout: number | null; workerPayoutRate: number }) {
  return project.workerPayout ?? Math.round((project.price * (project.workerPayoutRate || 40)) / 100);
}

// ── Expense bookkeeping ──────────────────────────────────────────────────

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
  const description = `${entry.ambassadorName} — ${entry.rate}% of ${entry.projectCode}`;
  const existing = await tx.expense.findFirst({
    where: { projectId: entry.projectDbId, category: AMBASSADOR_COMMISSION_CATEGORY },
    select: { id: true },
  });

  if (existing) {
    // Keep the original date: the commission belongs to the month the job was
    // first allocated, even if it's later moved to another ambassador.
    await tx.expense.update({
      where: { id: existing.id },
      data: { description, amount: entry.commission },
    });
    return;
  }

  await tx.expense.create({
    data: {
      category: AMBASSADOR_COMMISSION_CATEGORY,
      description,
      amount: entry.commission,
      date: entry.date,
      recurring: false,
      projectId: entry.projectDbId,
    },
  });
}

async function removeCommissionExpense(tx: Tx, projectDbId: string): Promise<void> {
  await tx.expense.deleteMany({
    where: { projectId: projectDbId, category: AMBASSADOR_COMMISSION_CATEGORY },
  });
}

/**
 * A cancelled or refunded job earns no commission: clear it off the job and
 * delete its expense. The ambassador stays linked as the referrer. Called
 * inside the status-change transaction.
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
    },
  });
  if (!project || project.ambassadorCommPaid || project.ambassadorCommission == null) return;

  await tx.project.update({
    where: { id: projectDbId },
    data: {
      ambassadorCommRate: null,
      ambassadorCommission: null,
      ambassadorAllocatedAt: null,
      educraftRevenue: project.price - workerPayoutOf(project),
    },
  });
  await removeCommissionExpense(tx, projectDbId);
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
 * The downpayment on a referred job was just verified — if its ambassador
 * hasn't been emailed yet (a public-intake referral, an earlier send that
 * failed, or an allocation saved without emailing), email them now.
 */
export async function emailPendingCommission(projectDbId: string): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectDbId },
    select: { ambassadorId: true, ambassadorCommission: true, ambassadorNotifiedAt: true },
  });
  if (!project?.ambassadorId || project.ambassadorCommission == null || project.ambassadorNotifiedAt) return;
  await emailCommission(projectDbId, { inApp: false });
}

// ── Allocate / remove ────────────────────────────────────────────────────

export interface AllocationResult {
  ambassadorName: string;
  rate: number;
  commission: number;
  email: CommissionEmailStatus | null;
  /** Not emailed now; they will be once the downpayment is verified. */
  emailLater: boolean;
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
      downpaymentStatus: true,
      client: { select: { id: true, referredById: true } },
    },
  });
  if (!project) throw new CommissionError("Project not found");
  if (project.ambassadorCommPaid) {
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
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        ambassadorId: ambassador.id,
        ambassadorCommRate: ambassador.rate,
        ambassadorCommission: commission,
        educraftRevenue: project.price - workerPayoutOf(project) - commission,
        ambassadorAllocatedAt: now,
        // A new ambassador hasn't been told yet; the same one keeps their stamp.
        ambassadorNotifiedAt: sameAmbassador ? project.ambassadorNotifiedAt : null,
      },
    });

    // The ambassador brought this client in — record it so the job counts as
    // a conversion toward their tier. An existing referrer is left alone.
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
  });

  const email = input.notify ? await emailCommission(project.id) : null;
  const emailLater = !email?.sent && project.downpaymentStatus !== "Verified";

  return { ambassadorName: ambassador.fullName, rate: ambassador.rate, commission, email, emailLater };
}

/** "None" — no ambassador referred this job. */
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
        educraftRevenue: project.price - workerPayoutOf(project),
      },
    });
    await removeCommissionExpense(tx, project.id);
  });
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
}

export async function listAllocatableAmbassadors(): Promise<AllocatableAmbassador[]> {
  const [rows, rates] = await Promise.all([
    db.ambassador.findMany({
      where: { status: { notIn: INACTIVE_STATUSES } },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        ambassadorId: true,
        fullName: true,
        tier: true,
        email: true,
        university: { select: { abbreviation: true } },
      },
    }),
    getCommissionRates(),
  ]);
  return rows.map((a) => ({
    id: a.id,
    code: a.ambassadorId,
    name: a.fullName,
    university: a.university?.abbreviation ?? null,
    tier: a.tier,
    tierRate: rates[a.tier],
    email: a.email,
  }));
}
