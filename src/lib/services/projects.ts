import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { sqlTable } from "@/lib/db-schema";
import { getCommissionRates } from "@/lib/services/settings";
import {
  CommissionError,
  emailCommission,
  emailParentCommission,
  emailPendingCommission,
  releaseCommission,
  resolveAmbassadorRate,
  resolveParentCommission,
  upsertCommissionExpense,
  upsertParentCommissionExpense,
} from "@/lib/services/ambassador-commission";
import { commissionFor } from "@/lib/commission";
import { computePrice, computeSplit } from "@/lib/pricing";
import { formatNaira } from "@/lib/utils";
import { proBonoFinancials } from "@/lib/pro-bono";
import {
  MAX_REVISIONS,
  TRANSITIONS,
  allowedTransitions,
  canHold,
  finalAwaitingRelease,
  type AdminHold,
  type TransitionCandidate,
} from "@/lib/pipeline";
import { notifyAdmins, notifyFinance, notifyRole, notifyUsers } from "@/lib/services/notifications";
import { monthKeyOf, projectNetInflow, syncPaymentAmbassadorSnapshot, syncProjectBuckets } from "@/lib/services/finance/buckets";
import { reconcileProjectPayouts } from "@/lib/services/finance/payouts-engine";
import { cancelProjectReferral, ensureProjectReferral, recordConversion } from "@/lib/services/ambassador-platform/referrals";
import { ID_FORMAT, formatId, type IdKind } from "@/lib/id-format";
import { statusFeedEntry } from "@/lib/client-updates";
import { recordUpdate } from "@/lib/services/client-updates";
import { notifyClient } from "@/lib/services/client-notify";
import { loginForEmail } from "@/lib/services/account-links";
import type { CreateProjectInput } from "@/lib/validations/projects";

export { TRANSITIONS, allowedTransitions } from "@/lib/pipeline";
export type { TransitionRule, TransitionCandidate } from "@/lib/pipeline";

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

export const PAGE_SIZE = 20;

export type PaymentFilter = "Unpaid" | "Partial" | "Paid";
export type ProjectFlag = "at-risk" | "overdue" | "revision-escalated";

export interface ProjectListFilters {
  status?: ProjectStatus;
  serviceId?: string;
  universityId?: string;
  /** A worker id, or the literal "unassigned". */
  workerId?: string;
  payment?: PaymentFilter;
  from?: string;
  to?: string;
  q?: string;
  flag?: ProjectFlag;
  page?: number;
}

const OPEN_STATUSES: ProjectStatus[] = [
  "NEW",
  "DOWNPAYMENT_VERIFIED",
  "REQUIREMENTS_CONFIRMED",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "SUBMITTED",
  "IN_QA_REVIEW",
  "REVISION_NEEDED",
  "APPROVED",
  "BALANCE_VERIFIED",
  "DELIVERED",
  "SUPERVISOR_CORRECTIONS",
];

function paymentWhere(payment: PaymentFilter): Prisma.ProjectWhereInput {
  switch (payment) {
    case "Unpaid":
      return { downpaymentStatus: "Unpaid" };
    case "Partial":
      return {
        downpaymentStatus: { in: ["Paid", "Verified"] },
        NOT: { balanceStatus: "Verified" },
      };
    case "Paid":
      return { balanceStatus: "Verified" };
  }
}

function buildWhere(filters: ProjectListFilters, now: Date): Prisma.ProjectWhereInput {
  const and: Prisma.ProjectWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.serviceId) and.push({ serviceId: filters.serviceId });
  if (filters.universityId) and.push({ client: { universityId: filters.universityId } });

  if (filters.workerId === "unassigned") and.push({ workerId: null });
  else if (filters.workerId) and.push({ workerId: filters.workerId });

  if (filters.payment) and.push(paymentWhere(filters.payment));

  if (filters.from) and.push({ createdAt: { gte: new Date(filters.from) } });
  if (filters.to) {
    // treat `to` as an inclusive calendar day
    const end = new Date(filters.to);
    end.setHours(23, 59, 59, 999);
    and.push({ createdAt: { lte: end } });
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { projectId: { contains: q, mode: "insensitive" } },
        { projectTitle: { contains: q, mode: "insensitive" } },
        { client: { fullName: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const threeDays = new Date(now.getTime() + 3 * 86_400_000);
  if (filters.flag === "at-risk") {
    and.push({ status: "IN_PROGRESS", internalDeadline: { lt: threeDays } });
  } else if (filters.flag === "overdue") {
    and.push({ status: { in: OPEN_STATUSES }, internalDeadline: { lt: now } });
  } else if (filters.flag === "revision-escalated") {
    and.push({ status: { in: OPEN_STATUSES }, revisionCount: { gte: 3 } });
  }

  return and.length ? { AND: and } : {};
}

const listSelect = {
  id: true,
  projectId: true,
  status: true,
  projectTitle: true,
  price: true,
  isProBono: true,
  downpaymentStatus: true,
  balanceStatus: true,
  clientDeadline: true,
  internalDeadline: true,
  createdAt: true,
  client: { select: { id: true, fullName: true, university: { select: { abbreviation: true } } } },
  service: { select: { serviceName: true } },
  worker: { select: { id: true, fullName: true } },
} satisfies Prisma.ProjectSelect;

export type ProjectListRow = Prisma.ProjectGetPayload<{ select: typeof listSelect }>;

export interface ProjectListResult {
  rows: ProjectListRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listProjects(
  filters: ProjectListFilters,
  now: Date = new Date()
): Promise<ProjectListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const where = buildWhere(filters, now);

  const [rows, total] = await db.$transaction([
    db.project.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.project.count({ where }),
  ]);

  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export interface FilterFacets {
  services: { id: string; name: string }[];
  universities: { id: string; name: string; abbreviation: string }[];
  workers: { id: string; name: string }[];
}

export async function getFilterFacets(): Promise<FilterFacets> {
  const [services, universities, workers] = await db.$transaction([
    db.service.findMany({ orderBy: { serviceName: "asc" }, select: { id: true, serviceName: true } }),
    db.university.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, abbreviation: true },
    }),
    db.worker.findMany({
      where: { status: { not: "Terminated" } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return {
    services: services.map((s) => ({ id: s.id, name: s.serviceName })),
    universities,
    workers: workers.map((w) => ({ id: w.id, name: w.fullName })),
  };
}

// ─────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────

const detailInclude = {
  client: { include: { university: true, referredBy: { select: { fullName: true, ambassadorId: true } } } },
  service: true,
  worker: true,
  ambassador: { select: { fullName: true, ambassadorId: true, tier: true } },
  files: { orderBy: { createdAt: "desc" } },
  statusLog: {
    orderBy: { createdAt: "asc" },
    include: { changedBy: { select: { displayName: true, email: true } } },
  },
  payments: { orderBy: { date: "desc" } },
  // For the delivery guard (see toCandidate): has a complete document been uploaded, and released?
  deliverables: {
    where: { kind: "FINAL", archivedAt: null },
    select: { versions: { select: { releaseNo: true } } },
  },
} satisfies Prisma.ProjectInclude;

export type ProjectDetail = Prisma.ProjectGetPayload<{ include: typeof detailInclude }>;

/** Accepts either the cuid `id` or the human `EC-XXXXX` code. */
export async function getProjectDetail(idOrCode: string): Promise<ProjectDetail | null> {
  return db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    include: detailInclude,
  });
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export class TransitionError extends Error {}

interface TransitionOptions {
  note?: string;
  /** Null for moves the system makes on its own (e.g. a release that delivers). */
  changedById: string | null;
}

/** What the client hears about a status change (in-app always; email for the ones that need them). */
async function notifyClientOfStatus(
  projectDbId: string,
  code: string,
  from: ProjectStatus,
  to: ProjectStatus,
  deliveryUnlocked: boolean
): Promise<void> {
  if (to === "IN_PROGRESS" && from === "ASSIGNED") {
    await notifyClient(projectDbId, { title: "Work started", message: `Your specialist has started on ${code}.` });
  } else if (to === "AWAITING_CLIENT_INPUT") {
    await notifyClient(projectDbId, {
      title: "We need something from you",
      message: `Your specialist needs something from you to continue ${code}.`,
      type: "warning",
      tab: "messages",
      email: {
        kind: "awaiting-input",
        heading: "We need something from you",
        lines: [
          "Your specialist needs something from you to keep going. Open your project to see what, and reply there or on WhatsApp.",
          "Your delivery date waits while we wait for you.",
        ],
        ctaLabel: "Open your project",
      },
    });
  } else if (to === "APPROVED") {
    await notifyClient(projectDbId, {
      title: "Quality check passed",
      message: deliveryUnlocked
        ? `${code} passed our quality check. We're preparing your delivery.`
        : `${code} passed our quality check. Pay your balance to unlock delivery.`,
      type: "success",
      tab: deliveryUnlocked ? "progress" : "payments",
      email: deliveryUnlocked
        ? undefined
        : {
            kind: "balance-due",
            heading: "Your project passed our quality check",
            lines: ["Pay your balance to unlock delivery. You can pay from the Payments tab of your dashboard."],
            ctaLabel: "Pay your balance",
          },
    });
  } else if (to === "DELIVERED") {
    await notifyClient(projectDbId, {
      title: from === "SUPERVISOR_CORRECTIONS" ? "Corrections delivered" : "Your project has been delivered",
      message: `${code} has been delivered.`,
      type: "success",
      email: {
        kind: "delivered",
        heading: from === "SUPERVISOR_CORRECTIONS" ? "Your corrections are done" : "Your project has been delivered",
        lines: ["Thank you for choosing EduCraft. Your dashboard keeps everything for this project."],
        ctaLabel: "Open your project",
      },
    });
  } else if (to === "SUPERVISOR_CORRECTIONS" || to === "COMPLETED" || to === "CANCELLED" || to === "REFUNDED") {
    const feed = statusFeedEntry(from, to);
    if (feed) await notifyClient(projectDbId, { title: feed.title, message: feed.body ?? `${code}: ${feed.title.toLowerCase()}.` });
  }
}

/**
 * Move a project to `to`, enforcing {@link TRANSITIONS} and writing a
 * ProjectStatusLog in the same transaction. Side effects for specific
 * targets (delivery date, deadline resume) are applied here too, and the
 * client's feed line (client wording only) is written with it.
 */
export async function transitionProject(
  idOrCode: string,
  to: ProjectStatus,
  { note, changedById }: TransitionOptions
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      workerId: true,
      workerAccepted: true,
      downpaymentStatus: true,
      balanceStatus: true,
      qaStatus: true,
      projectTitle: true,
      serviceId: true,
      specialInstructions: true,
      departmentOutline: true,
      additionalData: true,
      revisionCount: true,
      isProBono: true,
      deadlinePausedAt: true,
      internalDeadline: true,
      expectedDeliveryAt: true,
      worker: { select: { userId: true } },
      files: { where: { category: "from_worker" }, select: { id: true } },
      _count: { select: { files: true } },
      deliverables: {
        where: { kind: "FINAL", archivedAt: null },
        select: { versions: { select: { releaseNo: true } } },
      },
    },
  });

  if (!project) throw new TransitionError("Project not found");

  const hasRequirementDetail =
    Boolean(project.specialInstructions?.trim()) ||
    Boolean(project.departmentOutline?.trim()) ||
    (project.additionalData != null &&
      typeof project.additionalData === "object" &&
      Object.keys(project.additionalData as object).length > 0);

  const candidate: TransitionCandidate = {
    status: project.status,
    workerId: project.workerId,
    workerAccepted: project.workerAccepted,
    downpaymentStatus: project.downpaymentStatus,
    balanceStatus: project.balanceStatus,
    qaStatus: project.qaStatus,
    projectTitle: project.projectTitle,
    serviceId: project.serviceId,
    hasRequirementDetail,
    workerFileCount: project.files.length,
    finalAwaitingRelease: finalAwaitingRelease(project.deliverables),
  };

  const rule = allowedTransitions(candidate).find((r) => r.to === to);
  if (!rule) {
    throw new TransitionError(`Cannot move from ${project.status} to ${to}`);
  }

  const blocked = rule.guard?.(candidate);
  if (blocked) throw new TransitionError(blocked);

  const data: Prisma.ProjectUpdateManyMutationInput = { status: to };
  const now = new Date();

  // A brief is optional: many projects have nothing beyond the client's
  // details, and the department's rules cover the rest at report time. If the
  // admin does type a note here on a project with no brief, keep it as the
  // instructions rather than only logging it.
  if (to === "REQUIREMENTS_CONFIRMED" && !hasRequirementDetail && note?.trim()) {
    data.specialInstructions = note.trim();
  }

  if (to === "DELIVERED") data.deliveryDate = now;
  if (to === "COMPLETED") data.finalCompletionDate = now;
  if (to === "APPROVED") data.qaStatus = "Passed";

  // Nothing left to collect at approval: a pro bono job has no balance, and a
  // client may have paid the balance early (Chapters 3+ need it). Delivery
  // unlocks straight away, logged as its own step so the timeline stays honest.
  const balanceAlreadyPaid = project.balanceStatus === "Verified";
  const skipBalance = to === "APPROVED" && (project.isProBono || balanceAlreadyPaid);
  if (skipBalance) data.status = "BALANCE_VERIFIED";

  let flaggedForFounder = false;
  if (to === "REVISION_NEEDED") {
    data.revisionCount = { increment: 1 };
    if (project.revisionCount + 1 >= MAX_REVISIONS) flaggedForFounder = true;
  }

  if (project.status === "SUPERVISOR_CORRECTIONS" && to === "DELIVERED") {
    data.supervisorCorrectionCount = { increment: 1 };
    data.supervisorCorrectionStatus = "Resolved";
  }
  if (to === "SUPERVISOR_CORRECTIONS") {
    data.supervisorCorrections = true;
    data.supervisorCorrectionStatus = "Pending";
    if (note) data.supervisorCorrectionDetails = note;
  }

  // Deadline clock: pause on the way into AWAITING_CLIENT_INPUT, and on the
  // way out add the paused span back onto the internal deadline.
  if (to === "AWAITING_CLIENT_INPUT") {
    data.deadlinePausedAt = now;
  } else if (project.status === "AWAITING_CLIENT_INPUT" && project.deadlinePausedAt) {
    const pausedDays = Math.ceil(
      (now.getTime() - project.deadlinePausedAt.getTime()) / 86_400_000
    );
    data.deadlinePausedAt = null;
    data.deadlinePausedDays = { increment: pausedDays };
    if (project.internalDeadline && pausedDays > 0) {
      data.internalDeadline = new Date(
        project.internalDeadline.getTime() + pausedDays * 86_400_000
      );
    }
    // The client's date waits for them too.
    if (project.expectedDeliveryAt && pausedDays > 0) {
      data.expectedDeliveryAt = new Date(project.expectedDeliveryAt.getTime() + pausedDays * 86_400_000);
    }
  }

  const feed = statusFeedEntry(project.status, to);

  await db.$transaction(
    async (tx) => {
      // Compare-and-set: only move a project still in the status we read. A
      // double click or a webhook racing an admin can then never apply a move
      // twice (or on top of a move someone else just made).
      const moved = await tx.project.updateMany({ where: { id: project.id, status: project.status }, data });
      if (moved.count !== 1) {
        throw new TransitionError("This project changed while you were working on it. Refresh and try again.");
      }
      const log = await tx.projectStatusLog.create({
        data: {
          projectId: project.id,
          fromStatus: project.status,
          toStatus: to,
          changedById,
          notes: note ?? rule.action,
        },
        select: { id: true },
      });
      // Completed: every leg owed (worker, ambassador, Core, HOG, COO) becomes a payout record for the month.
      if (to === "COMPLETED") await reconcileProjectPayouts(tx, project.id, { month: monthKeyOf(now) });
      if (skipBalance) {
        await tx.projectStatusLog.create({
          data: {
            projectId: project.id,
            fromStatus: "APPROVED",
            toStatus: "BALANCE_VERIFIED",
            changedById,
            notes: project.isProBono ? "Pro bono: no balance to collect" : "Balance already paid",
          },
        });
      }
      if (feed) {
        await recordUpdate(tx, {
          projectId: project.id,
          kind: "STATUS",
          title: feed.title,
          body: feed.body,
          dedupeKey: `status:${log.id}`,
        });
      }
      // A revision sends the uploaded complete document back to the worker with the note.
      if (to === "REVISION_NEEDED") {
        const returned = await tx.deliverableVersion.updateMany({
          where: { status: "SUBMITTED", deliverable: { projectId: project.id, kind: "FINAL" } },
          data: {
            status: "RETURNED",
            reviewNote: note?.trim() || "Returned by the quality check.",
            reviewedById: changedById,
            reviewedAt: now,
          },
        });
        if (returned.count > 0) {
          await tx.projectDeliverable.updateMany({
            where: { projectId: project.id, kind: "FINAL", status: "IN_REVIEW" },
            data: { status: "CHANGES_REQUESTED" },
          });
        }
      }
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  // ── Notifications ──
  const adminLink = `/admin/projects/${project.projectId}`;
  if (flaggedForFounder) {
    await notifyAdmins({
      title: "Revision cap reached",
      message: `${project.projectId} has hit ${MAX_REVISIONS} revisions and needs founder review.`,
      type: "urgent",
      link: adminLink,
    });
  }
  // Every submission needs a reviewer, including a resubmission after a revision.
  if (to === "SUBMITTED") {
    await notifyAdmins({
      title: project.status === "REVISION_NEEDED" ? "Revised work submitted" : "Work submitted",
      message: `${project.projectId} has been submitted and needs a QA reviewer.`,
      type: "info",
      link: "/admin/qa",
    });
  }
  if (to === "REVISION_NEEDED") {
    await notifyUsers([project.worker?.userId], {
      title: "Revision needed",
      message: `QA sent ${project.projectId} back${note ? `: ${note}` : "."}`,
      type: "warning",
      link: "/worker/projects",
    });
  }
  if (to === "APPROVED") {
    await notifyUsers([project.worker?.userId], {
      title: "QA passed",
      message: `${project.projectId} passed QA review.`,
      type: "success",
      link: "/worker/projects",
    });
  }

  await notifyClientOfStatus(project.id, project.projectId, project.status, to, skipBalance);

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

// ── Admin holds ──────────────────────────────────────────────

export async function holdProject(
  idOrCode: string,
  to: AdminHold,
  note: string,
  changedById: string,
  /** REFUNDED: what went back to the client — defaults to everything they paid. */
  opts: { refundAmount?: number } = {}
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, status: true, client: { select: { fullName: true } } },
  });
  if (!project) throw new TransitionError("Project not found");
  if (!canHold(project.status, to)) {
    throw new TransitionError(`Cannot ${to.toLowerCase()} a project that is ${project.status}`);
  }

  // Money in on this job: a refund gives it back (its own OUTFLOW row, so the
  // month's revenue is what was actually kept); a cancellation with money in
  // is a decision for finance, not something to reverse automatically.
  const moneyIn = to === "CANCELLED" || to === "REFUNDED" ? await projectNetInflow(db, project.id) : 0;
  const refund = to === "REFUNDED" ? Math.round(opts.refundAmount ?? moneyIn) : 0;
  if (to === "REFUNDED" && refund > moneyIn) {
    throw new TransitionError(`A refund can't exceed what the client paid (${formatNaira(moneyIn)})`);
  }
  const refundPaymentId = refund > 0 ? await nextId("PAYMENT") : null;
  const now = new Date();

  const feed = statusFeedEntry(project.status, to);
  await db.$transaction(
    async (tx) => {
      await tx.project.update({ where: { id: project.id }, data: { status: to } });
      const log = await tx.projectStatusLog.create({
        data: { projectId: project.id, fromStatus: project.status, toStatus: to, changedById, notes: note },
        select: { id: true },
      });
      // A cancelled or refunded job earns no commission — drop it and its expense.
      if (to === "CANCELLED" || to === "REFUNDED") {
        await releaseCommission(tx, project.id);
        await reconcileProjectPayouts(tx, project.id);
        // The referral no longer counts toward the ambassador's tier.
        await cancelProjectReferral(tx, project.id, to === "REFUNDED" ? `Project ${project.projectId} refunded` : `Project ${project.projectId} cancelled`);
      }
      if (refundPaymentId) {
        await tx.payment.create({
          data: {
            paymentId: refundPaymentId,
            type: "REFUND",
            direction: "OUTFLOW",
            projectId: project.id,
            personName: project.client.fullName,
            personRole: "Client",
            amount: refund,
            confirmedById: changedById,
            status: "Confirmed",
            source: "MANUAL",
            notes: note,
            date: now,
          },
        });
      }
      if (to === "CANCELLED" || to === "REFUNDED") {
        // The legs (and the money in) changed: the buckets follow.
        await syncPaymentAmbassadorSnapshot(tx, project.id);
        await syncProjectBuckets(tx, project.id, {
          reason: to === "REFUNDED" ? "REFUND" : "REALLOCATION",
          month: monthKeyOf(now),
          recordedById: changedById,
        });
      }
      if (feed) {
        await recordUpdate(tx, { projectId: project.id, kind: "STATUS", title: feed.title, body: feed.body, dedupeKey: `status:${log.id}` });
      }
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
  if (feed) await notifyClient(project.id, { title: feed.title, message: `${project.projectId}: ${feed.title.toLowerCase()}.` });
  if (to === "REFUNDED" && refund > 0) {
    await notifyFinance({
      title: "Refund recorded",
      message: `${project.projectId}: ${formatNaira(refund)} refunded to the client. The buckets have given it back.`,
      type: "warning",
      link: "/admin/finance/revenue",
    });
  } else if (to === "CANCELLED" && moneyIn > 0) {
    await notifyFinance({
      title: "Decision needed: cancelled with money in",
      message: `${project.projectId} was cancelled with ${formatNaira(moneyIn)} paid. Refund it (Mark refunded) or keep it — nothing was reversed.`,
      type: "urgent",
      link: "/admin/finance/revenue",
    });
  }

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

/** Lift ON_HOLD / DISPUTED back to the status the project was in before. */
export async function resumeFromHold(
  idOrCode: string,
  changedById: string
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, status: true },
  });
  if (!project) throw new TransitionError("Project not found");
  if (project.status !== "ON_HOLD" && project.status !== "DISPUTED") {
    throw new TransitionError("This project is not on hold");
  }

  const lastHold = await db.projectStatusLog.findFirst({
    where: { projectId: project.id, toStatus: project.status },
    orderBy: { createdAt: "desc" },
    select: { fromStatus: true },
  });
  const back = lastHold?.fromStatus ?? "NEW";

  await db.$transaction([
    db.project.update({ where: { id: project.id }, data: { status: back } }),
    db.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: project.status,
        toStatus: back,
        changedById,
        notes: "Resumed from hold",
      },
    }),
  ]);

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

interface VerifyPaymentOptions {
  leg: "downpayment" | "balance";
  changedById: string;
  paymentMethod?: string;
  reference?: string;
  /** ISO date (YYYY-MM-DD) the client actually paid; defaults to now. */
  paymentDate?: string;
  notes?: string;
  /** The Revenue Tracker's row to confirm (the MANUAL Pending row mark-as-paid created). */
  pendingPaymentId?: string;
}

/**
 * Verify a client payment leg that is marked "Paid". Sets the leg to
 * "Verified", confirms the Pending row that mark-as-paid created (or records
 * a confirmed inbound Payment for a leg marked before that row existed),
 * allocates EduCraft's retained share to the buckets, and — when the project
 * is sitting at the status that leg unblocks — advances it and logs the move.
 * Verifying is a finance act: the route admits the founder and the CFO.
 */
export async function verifyPayment(
  idOrCode: string,
  { leg, changedById, paymentMethod, reference, paymentDate, notes, pendingPaymentId }: VerifyPaymentOptions
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      client: { select: { fullName: true } },
      ambassadorId: true,
      ambassador: { select: { userId: true } },
      downpaymentStatus: true,
      downpaymentAmount: true,
      balanceStatus: true,
      balanceAmount: true,
    },
  });

  if (!project) throw new TransitionError("Project not found");

  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") throw new TransitionError("That payment is already verified");
  if (legStatus !== "Paid") throw new TransitionError("That payment is not marked paid yet");

  const now = new Date();
  const paidOn = paymentDate ? new Date(paymentDate) : now;
  const amount = leg === "downpayment" ? project.downpaymentAmount : project.balanceAmount;
  const paymentType = leg === "downpayment" ? ("CLIENT_DOWNPAYMENT" as const) : ("CLIENT_BALANCE" as const);

  const data: Prisma.ProjectUpdateManyMutationInput =
    leg === "downpayment"
      ? {
          downpaymentStatus: "Verified",
          downpaymentDate: paidOn,
          downpaymentReference: reference || null,
        }
      : {
          balanceStatus: "Verified",
          balanceDate: paidOn,
          balanceReference: reference || null,
        };

  const advance =
    leg === "downpayment" && project.status === "NEW"
      ? ("DOWNPAYMENT_VERIFIED" as const)
      : leg === "balance" && project.status === "APPROVED"
        ? ("BALANCE_VERIFIED" as const)
        : null;

  if (advance) data.status = advance;

  const paymentId = await nextId("PAYMENT");
  const legLabel = leg === "downpayment" ? "downpayment" : "balance";

  await db.$transaction(
    async (tx) => {
      // Claim the leg: only one verifier can move it from "Paid", so two admins
      // (or an admin and a Paystack confirmation) can never record it twice.
      const claimed = await tx.project.updateMany({
        where: {
          id: project.id,
          ...(leg === "downpayment" ? { downpaymentStatus: "Paid" } : { balanceStatus: "Paid" }),
          ...(advance ? { status: project.status } : {}),
        },
        data,
      });
      if (claimed.count !== 1) {
        throw new TransitionError("That payment was just verified by someone else. Refresh the page.");
      }

      // Confirm exactly the row mark-as-paid created — never a live Paystack
      // checkout (source PAYSTACK). A leg marked before that row existed gets
      // its Confirmed row created here, as before.
      const pendingRows = await tx.payment.findMany({
        where: pendingPaymentId
          ? { id: pendingPaymentId, projectId: project.id, type: paymentType, status: "Pending", source: "MANUAL" }
          : { projectId: project.id, type: paymentType, status: "Pending", source: "MANUAL" },
        orderBy: { createdAt: "desc" },
        select: { id: true, paymentMethod: true, reference: true, notes: true },
      });
      if (pendingPaymentId && pendingRows.length === 0) {
        throw new TransitionError("That payment row is no longer awaiting verification. Refresh the page.");
      }
      let payment: { id: string };
      if (pendingRows.length > 0) {
        const [row, ...stale] = pendingRows;
        const confirmed = await tx.payment.updateMany({
          where: { id: row.id, status: "Pending" },
          data: {
            status: "Confirmed",
            amount,
            paymentMethod: paymentMethod || row.paymentMethod,
            reference: reference || row.reference,
            notes: notes || row.notes,
            confirmedById: changedById,
            ambassadorId: project.ambassadorId,
            isAmbassadorDriven: project.ambassadorId != null,
            date: paidOn,
          },
        });
        if (confirmed.count !== 1) {
          throw new TransitionError("That payment was just verified by someone else. Refresh the page.");
        }
        if (stale.length > 0) {
          await tx.payment.updateMany({
            where: { id: { in: stale.map((s) => s.id) }, status: "Pending" },
            data: { status: "Rejected", notes: "Superseded: the leg was confirmed on another row" },
          });
        }
        payment = { id: row.id };
      } else {
        payment = await tx.payment.create({
          data: {
            paymentId,
            type: paymentType,
            direction: "INFLOW",
            projectId: project.id,
            personName: project.client.fullName,
            personRole: "Client",
            amount,
            paymentMethod: paymentMethod || null,
            reference: reference || null,
            notes: notes || null,
            confirmedById: changedById,
            status: "Confirmed",
            source: "MANUAL",
            ambassadorId: project.ambassadorId,
            isAmbassadorDriven: project.ambassadorId != null,
            date: paidOn,
          },
          select: { id: true },
        });
      }
      // EduCraft's retained share of this money goes into the four buckets.
      await syncProjectBuckets(tx, project.id, {
        reason: "PAYMENT",
        paymentId: payment.id,
        month: monthKeyOf(paidOn),
        recordedById: changedById,
      });
      // A confirmed downpayment on a referred job is the ambassador's conversion (Phase 3).
      if (leg === "downpayment") await recordConversion(tx, project.id, { paymentId: payment.id, paidOn });
      if (advance) {
        await tx.projectStatusLog.create({
          data: {
            projectId: project.id,
            fromStatus: project.status,
            toStatus: advance,
            changedById,
            notes: `${leg === "downpayment" ? "Downpayment" : "Balance"} verified`,
          },
        });
      }
      await recordUpdate(tx, {
        projectId: project.id,
        kind: "PAYMENT",
        title: "Payment received",
        body: `Your ${legLabel} of ${formatNaira(amount)} is confirmed.`,
        dedupeKey: `payment:${payment.id}`,
      });
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  await notifyClient(project.id, {
    title: "Payment received",
    message: `Your ${legLabel} for ${project.projectId} is confirmed.`,
    type: "success",
    tab: "payments",
    email: {
      kind: "payment",
      heading: "Payment received",
      lines: [`Your ${legLabel} of ${formatNaira(amount)} is confirmed. Thank you.`, "Your receipt is in the Payments tab of your dashboard."],
      ctaLabel: "View your receipt",
    },
  });

  // A verified downpayment is what turns a referred client into a paying one.
  if (leg === "downpayment" && project.ambassador?.userId) {
    await notifyUsers([project.ambassador.userId], {
      title: "A client you referred has paid",
      message: `They paid their downpayment on ${project.projectId}. That is one more paying client toward your next level.`,
      type: "success",
      link: "/ambassador/commissions",
    });
  }
  // The job is now confirmed — email its ambassador if they haven't been yet
  // (a public-intake referral, or an allocation saved without emailing).
  if (leg === "downpayment") await emailPendingCommission(project.id);
  // Balance in and the complete document already released: that is delivery.
  if (advance === "BALANCE_VERIFIED") await deliverIfFinalReleased(project.id);
  // Operations marked it paid and has been waiting on this.
  await notifyRole(["COO"], {
    title: "Payment confirmed",
    message: `${project.projectId}: the ${legLabel} of ${formatNaira(amount)} is confirmed by finance${advance ? " — the project moved on" : ""}.`,
    type: "success",
    link: `/admin/projects/${project.projectId}`,
  });

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

interface RejectPaymentOptions {
  leg: "downpayment" | "balance";
  changedById: string;
  note: string;
  pendingPaymentId?: string;
}

/**
 * Finance refusing a payment that was marked paid: the leg goes back to
 * Unpaid and the awaiting-verification row is marked Rejected. Nothing was
 * allocated (buckets only ever see Confirmed rows), so there is nothing to
 * reverse.
 */
export async function rejectPayment(idOrCode: string, { leg, changedById, note, pendingPaymentId }: RejectPaymentOptions): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, status: true, downpaymentStatus: true, balanceStatus: true },
  });
  if (!project) throw new TransitionError("Project not found");
  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus !== "Paid") throw new TransitionError("Only a payment marked paid can be refused");

  const paymentType = leg === "downpayment" ? ("CLIENT_DOWNPAYMENT" as const) : ("CLIENT_BALANCE" as const);
  const legLabel = leg === "downpayment" ? "downpayment" : "balance";

  await db.$transaction(async (tx) => {
    const claimed = await tx.project.updateMany({
      where: { id: project.id, ...(leg === "downpayment" ? { downpaymentStatus: "Paid" } : { balanceStatus: "Paid" }) },
      data:
        leg === "downpayment"
          ? { downpaymentStatus: "Unpaid", downpaymentDate: null, downpaymentReference: null }
          : { balanceStatus: "Unpaid", balanceDate: null, balanceReference: null },
    });
    if (claimed.count !== 1) throw new TransitionError("That payment was just verified by someone else. Refresh the page.");
    await tx.payment.updateMany({
      where: pendingPaymentId
        ? { id: pendingPaymentId, projectId: project.id, status: "Pending", source: "MANUAL" }
        : { projectId: project.id, type: paymentType, status: "Pending", source: "MANUAL" },
      data: { status: "Rejected", confirmedById: changedById, notes: `Refused: ${note}` },
    });
    const log = await tx.projectStatusLog.create({
      data: { projectId: project.id, fromStatus: project.status, toStatus: project.status, changedById, notes: `${legLabel[0].toUpperCase()}${legLabel.slice(1)} payment refused: ${note}` },
      select: { id: true },
    });
    await recordUpdate(tx, {
      projectId: project.id,
      kind: "PAYMENT",
      title: "Payment not confirmed",
      body: `We could not confirm your ${legLabel} payment. Please check the transfer and message us if you need help.`,
      dedupeKey: `payment-refused:${log.id}`,
    });
  }, { timeout: 30_000, maxWait: 10_000 });

  await notifyClient(project.id, {
    title: "Payment not confirmed",
    message: `Your ${legLabel} for ${project.projectId} could not be confirmed. Please check with us.`,
    type: "warning",
    tab: "payments",
  });
  await notifyRole(["COO"], {
    title: "Payment refused by finance",
    message: `${project.projectId}: the ${legLabel} marked paid could not be confirmed (${note}). The leg is back to unpaid.`,
    type: "warning",
    link: `/admin/projects/${project.projectId}`,
  });

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

/**
 * Delivers a project that is fully paid (BALANCE_VERIFIED) once its complete
 * document has been released to the client. Called after a release and after
 * a balance is verified, whichever comes second. Never throws: the caller's
 * own action already succeeded.
 */
export async function deliverIfFinalReleased(projectDbId: string): Promise<boolean> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectDbId },
      select: {
        status: true,
        deliverables: {
          where: { kind: "FINAL", archivedAt: null },
          select: { versions: { where: { releaseNo: { not: null } }, select: { id: true }, take: 1 } },
        },
      },
    });
    if (!project || project.status !== "BALANCE_VERIFIED") return false;
    if (!project.deliverables.some((d) => d.versions.length > 0)) return false;
    await transitionProject(projectDbId, "DELIVERED", {
      changedById: null,
      note: "Delivered: balance paid and the complete document released",
    });
    return true;
  } catch (error) {
    if (!(error instanceof TransitionError)) console.error("[deliverIfFinalReleased]", error);
    return false;
  }
}

export interface MarkPaidDetails {
  paymentMethod?: string;
  reference?: string;
  /** ISO date (YYYY-MM-DD) the client says they paid; defaults to now. */
  paymentDate?: string;
  notes?: string;
}

/**
 * Record that a client says they've paid — moves the leg to "Paid"
 * (unverified) and writes the Revenue Tracker's awaiting-verification row (a
 * MANUAL Pending Payment) for finance to confirm or refuse. Does not advance
 * the status and allocates nothing: buckets only ever see Confirmed money.
 */
export async function markPaymentPaid(
  idOrCode: string,
  leg: "downpayment" | "balance",
  details: MarkPaidDetails = {}
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      downpaymentStatus: true,
      downpaymentAmount: true,
      balanceStatus: true,
      balanceAmount: true,
      ambassadorId: true,
      client: { select: { fullName: true } },
    },
  });
  if (!project) throw new TransitionError("Project not found");

  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") throw new TransitionError("That payment is already verified");
  if (legStatus === "Paid") throw new TransitionError("That payment is already marked paid");

  const now = new Date();
  const paidOn = details.paymentDate ? new Date(details.paymentDate) : now;
  const amount = leg === "downpayment" ? project.downpaymentAmount : project.balanceAmount;
  const legLabel = leg === "downpayment" ? "downpayment" : "balance";
  const paymentId = await nextId("PAYMENT");

  await db.$transaction([
    db.project.update({
      where: { id: project.id },
      data:
        leg === "downpayment"
          ? { downpaymentStatus: "Paid", downpaymentDate: paidOn }
          : { balanceStatus: "Paid", balanceDate: paidOn },
    }),
    db.payment.create({
      data: {
        paymentId,
        type: leg === "downpayment" ? "CLIENT_DOWNPAYMENT" : "CLIENT_BALANCE",
        direction: "INFLOW",
        projectId: project.id,
        personName: project.client.fullName,
        personRole: "Client",
        amount,
        paymentMethod: details.paymentMethod || null,
        reference: details.reference || null,
        notes: details.notes || null,
        status: "Pending",
        source: "MANUAL",
        ambassadorId: project.ambassadorId,
        isAmbassadorDriven: project.ambassadorId != null,
        date: paidOn,
      },
    }),
  ]);

  await notifyFinance({
    title: "Payment awaiting verification",
    message: `${project.projectId}: ${legLabel} of ${formatNaira(amount)} marked paid — confirm it in the Revenue Tracker.`,
    type: "warning",
    link: "/admin/finance/revenue?status=Pending",
  });

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

interface AssignWorkerOptions {
  workerId: string;
  changedById: string;
}

/** Statuses where a worker is already active on the project — swapping here is a handoff, not a first assignment. */
export const REASSIGNABLE_IN_FLIGHT_STATUSES: ProjectStatus[] = [
  "IN_PROGRESS",
  "AWAITING_CLIENT_INPUT",
  "REVISION_NEEDED",
];

/**
 * Assigns a worker. Handles both the first assignment (REQUIREMENTS_CONFIRMED
 * → ASSIGNED, unchanged from before) and reassigning an already-assigned
 * project to someone else — pipeline status stays put for a reassignment, so
 * swapping workers mid-project doesn't rewind progress or lose revision
 * context. The previous worker (if any) is notified they've been taken off it.
 */
export async function assignWorker(
  idOrCode: string,
  { workerId, changedById }: AssignWorkerOptions
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, status: true, workerId: true },
  });
  if (!project) throw new TransitionError("Project not found");

  const isFirstAssignment = project.status === "REQUIREMENTS_CONFIRMED";
  const isReassignment =
    project.status === "ASSIGNED" || REASSIGNABLE_IN_FLIGHT_STATUSES.includes(project.status);
  if (!isFirstAssignment && !isReassignment) {
    throw new TransitionError("This project can't be assigned a worker right now");
  }
  if (project.workerId === workerId) {
    throw new TransitionError("This worker is already assigned");
  }

  const worker = await db.worker.findUnique({
    where: { id: workerId },
    select: { id: true, userId: true },
  });
  if (!worker) throw new TransitionError("Worker not found");

  const previousWorker = project.workerId
    ? await db.worker.findUnique({ where: { id: project.workerId }, select: { userId: true } })
    : null;

  const now = new Date();
  const data: Prisma.ProjectUncheckedUpdateInput = { workerId, assignedDate: now };
  if (isFirstAssignment) {
    data.status = "ASSIGNED";
    data.workerAccepted = false;
  } else if (project.status === "ASSIGNED") {
    // Original worker hadn't accepted yet — the new one still needs to.
    data.workerAccepted = false;
  } else {
    // Work is already underway — treat a manual reassignment as an immediate handoff.
    data.workerAccepted = true;
    data.workerAcceptedDate = now;
  }

  const assignedFeed = statusFeedEntry(project.status, "ASSIGNED");
  await db.$transaction([
    db.project.update({ where: { id: project.id }, data }),
    db.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: project.status,
        toStatus: (data.status as ProjectStatus | undefined) ?? project.status,
        changedById,
        notes: isFirstAssignment ? "Worker assigned" : "Worker reassigned",
      },
    }),
    // The client hears once that a specialist is on it; hand-offs stay internal.
    ...(isFirstAssignment && assignedFeed
      ? [
          db.projectUpdate.createMany({
            data: [
              {
                projectId: project.id,
                kind: "STATUS" as const,
                title: assignedFeed.title,
                body: assignedFeed.body ?? null,
                dedupeKey: `assigned:${project.id}`,
              },
            ],
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
  if (isFirstAssignment) {
    await notifyClient(project.id, {
      title: "Specialist assigned",
      message: `A specialist in your field is now on ${project.projectId}.`,
    });
  }

  await notifyUsers([worker.userId], {
    title: isFirstAssignment ? "New project assigned" : "Project reassigned to you",
    message: isFirstAssignment
      ? `${project.projectId} has been assigned to you — accept it to start.`
      : `${project.projectId} has been reassigned to you.`,
    type: "info",
    link: "/worker/projects",
  });
  if (previousWorker?.userId) {
    await notifyUsers([previousWorker.userId], {
      title: "Reassigned off a project",
      message: `${project.projectId} has been reassigned to another worker.`,
      type: "warning",
      link: "/worker/projects",
    });
  }

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

/**
 * Removes an assignment — only while it's still unaccepted (status ASSIGNED).
 * Once a worker has accepted and started, use assignWorker to hand it to
 * someone else instead of leaving the project in a worker-less in-progress state.
 */
export async function unassignWorker(idOrCode: string, changedById: string): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, status: true, workerId: true },
  });
  if (!project) throw new TransitionError("Project not found");
  if (project.status !== "ASSIGNED") {
    throw new TransitionError("Only an unaccepted assignment can be removed");
  }

  const worker = project.workerId
    ? await db.worker.findUnique({ where: { id: project.workerId }, select: { userId: true } })
    : null;

  await db.$transaction([
    db.project.update({
      where: { id: project.id },
      data: { workerId: null, assignedDate: null, workerAccepted: false, status: "REQUIREMENTS_CONFIRMED" },
    }),
    db.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: "ASSIGNED",
        toStatus: "REQUIREMENTS_CONFIRMED",
        changedById,
        notes: "Assignment removed",
      },
    }),
  ]);

  if (worker?.userId) {
    await notifyUsers([worker.userId], {
      title: "Assignment removed",
      message: `You are no longer assigned to ${project.projectId}.`,
      type: "warning",
      link: "/worker/projects",
    });
  }

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

export async function updateInternalNotes(
  idOrCode: string,
  notes: string
): Promise<{ internalNotes: string | null }> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true },
  });
  if (!project) throw new TransitionError("Project not found");

  return db.project.update({
    where: { id: project.id },
    data: { internalNotes: notes.trim() || null },
    select: { internalNotes: true },
  });
}

// ─────────────────────────────────────────────────────────────
// Manual creation
// ─────────────────────────────────────────────────────────────

export interface CreateProjectResult {
  id: string;
  projectId: string;
}

/**
 * Admin-side project creation for WhatsApp intake. Resolves or creates the
 * client, prices the service, links a referring ambassador if the code checks
 * out, and opens the project at NEW with a status-log entry — all in one
 * transaction so a half-created project can never exist.
 */
export async function createProjectManual(
  input: CreateProjectInput,
  createdById: string
): Promise<CreateProjectResult> {
  const service = await db.service.findUnique({
    where: { id: input.serviceId },
    include: { variants: true },
  });
  if (!service) throw new TransitionError("Service not found");

  let variantAddon = 0;
  let serviceVariantId: string | null = null;
  if (input.serviceVariantId) {
    const variant = service.variants.find((v) => v.id === input.serviceVariantId && v.isActive);
    if (!variant) throw new TransitionError("Service variant not found");
    variantAddon = variant.priceAddon;
    serviceVariantId = variant.id;
  }

  const price = computePrice({
    basePrice: service.basePrice,
    variantAddon,
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: input.isExpressDelivery,
    override: input.priceOverride ?? null,
    downpaymentPercentage: service.downpaymentPercentage,
  });

  // Ambassador allocation: picked on the form (any rate the admin sets, or
  // their tier rate), else a referral code for a brand-new client, else none.
  let ambassadorId: string | null = null;
  let ambassadorCommRate: number | null = null;
  let referralCodeUsed: string | null = null;
  let ambassadorName = "";

  const proBono = input.proBono;
  const referralCode =
    input.clientMode === "new" && !proBono ? (input.referralCode ?? "").trim() : "";
  if (input.ambassadorId && !proBono) {
    try {
      const picked = await resolveAmbassadorRate(input.ambassadorId, input.ambassadorRate);
      ambassadorId = picked.id;
      ambassadorName = picked.fullName;
      ambassadorCommRate = picked.rate;
    } catch (error) {
      if (error instanceof CommissionError) throw new TransitionError(error.message);
      throw error;
    }
  } else if (referralCode) {
    const ambassador = await db.ambassador.findUnique({
      where: { referralCode },
      select: { id: true, tier: true, status: true, fullName: true },
    });
    if (ambassador && ambassador.status !== "Suspended" && ambassador.status !== "Terminated") {
      ambassadorId = ambassador.id;
      ambassadorName = ambassador.fullName;
      ambassadorCommRate = (await getCommissionRates())[ambassador.tier];
      referralCodeUsed = referralCode;
    }
  }

  const split = computeSplit(price.total, ambassadorCommRate);
  const parentInfo = ambassadorId && !proBono ? await resolveParentCommission(ambassadorId, ambassadorCommRate ?? 0) : null;
  const parentCommission = parentInfo ? commissionFor(price.total, parentInfo.rate) : null;

  const now = new Date();
  const clientDeadline = input.clientDeadline ? new Date(input.clientDeadline) : null;
  const internalDeadline =
    clientDeadline ?? new Date(now.getTime() + service.estimatedDays * 86_400_000);

  const additionalData: Record<string, unknown> = {};
  if (input.courseTitle) additionalData.courseTitle = input.courseTitle;
  if (input.courseCode) additionalData.courseCode = input.courseCode;
  if (input.wordCount) additionalData.wordCount = input.wordCount;

  // One client ID per person: a "new" client whose email is already on record
  // must be picked as the existing client instead of becoming a second record.
  if (input.clientMode === "new" && input.email?.trim()) {
    const sameEmail = await db.client.findFirst({
      where: { email: { equals: input.email.trim(), mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      select: { clientId: true, fullName: true },
    });
    if (sameEmail) {
      throw new TransitionError(
        `${sameEmail.fullName} (${sameEmail.clientId}) already uses this email. Choose "Existing client" and pick them, so they keep one client ID.`
      );
    }
  }

  // Ids generated up front so the transaction only does writes.
  const newProjectId = await nextId("PROJECT");
  const newClientId = input.clientMode === "new" ? await nextId("CLIENT") : null;
  // A person with an EduCraft login with this email (worker, ambassador, client) sees it in the same dashboard.
  const ownerLoginId = input.clientMode === "new" ? await loginForEmail(input.email) : null;

  const created = await db.$transaction(async (tx) => {
    let clientId: string;

    if (input.clientMode === "existing") {
      if (!input.clientId) throw new TransitionError("No client selected");
      const existing = await tx.client.findUnique({
        where: { id: input.clientId },
        select: { id: true, referredById: true },
      });
      if (!existing) throw new TransitionError("Selected client not found");
      clientId = existing.id;
      // First ambassador credited for this client becomes their referrer.
      if (ambassadorId && !existing.referredById) {
        await tx.client.update({ where: { id: existing.id }, data: { referredById: ambassadorId } });
      }
    } else {
      const newClient = await tx.client.create({
        data: {
          clientId: newClientId as string,
          fullName: (input.fullName ?? "").trim(),
          phone: (input.phone ?? "").trim(),
          email: input.email ? input.email : null,
          universityId: input.universityId as string,
          faculty: input.faculty ?? "",
          department: (input.department ?? "").trim(),
          level: (input.level ?? "").trim(),
          referredById: ambassadorId,
          referralCodeUsed,
          status: "Active",
          userId: ownerLoginId,
        },
        select: { id: true },
      });
      clientId = newClient.id;
    }

    const project = await tx.project.create({
      data: {
        projectId: newProjectId,
        clientId,
        serviceId: service.id,
        serviceVariantId,
        status: proBono ? "DOWNPAYMENT_VERIFIED" : "NEW",
        isExpressDelivery: proBono ? false : input.isExpressDelivery,
        projectTitle: input.projectTitle,
        matricNumber: input.matricNumber || null,
        supervisorName: input.supervisorName || null,
        hodName: input.hodName || null,
        referencingStyle: input.referencingStyle ? input.referencingStyle : null,
        minimumPages: input.minimumPages || null,
        projectType: input.projectType ? input.projectType : "NOT_APPLICABLE",
        chapterCount: input.chapterCount ?? null,
        specialInstructions: input.specialInstructions || null,
        additionalData:
          Object.keys(additionalData).length > 0
            ? (additionalData as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        clientDeadline,
        internalDeadline,
        expectedDeliveryAt: clientDeadline ?? internalDeadline,
        ...(proBono
          ? { ...proBonoFinancials(), proBonoReason: input.proBonoReason?.trim() || null }
          : {
              price: price.total,
              downpaymentAmount: price.downpaymentAmount,
              balanceAmount: price.balanceAmount,
              downpaymentStatus: "Unpaid",
              balanceStatus: "Unpaid",
              ambassadorId,
              ambassadorCommRate,
              ambassadorCommission: split.ambassadorCommission,
              ambassadorAllocatedAt: ambassadorId ? now : null,
              parentAmbassadorId: parentInfo?.id ?? null,
              parentCommRate: parentInfo?.rate ?? null,
              parentCommission,
              workerPayoutRate: 40,
              workerPayout: split.workerPayout,
              educraftRevenue: split.educraftRevenue - (parentCommission ?? 0),
            }),
      },
      select: { id: true, projectId: true },
    });

    if (ambassadorId && ambassadorCommRate != null && split.ambassadorCommission != null) {
      await upsertCommissionExpense(tx, {
        projectDbId: project.id,
        projectCode: project.projectId,
        ambassadorName,
        rate: ambassadorCommRate,
        commission: split.ambassadorCommission,
        date: now,
      });
    }
    if (parentInfo && parentCommission != null) {
      await upsertParentCommissionExpense(tx, {
        projectDbId: project.id,
        projectCode: project.projectId,
        parentName: parentInfo.fullName,
        subName: ambassadorName,
        rate: parentInfo.rate,
        commission: parentCommission,
        date: now,
      });
    }

    // The ambassador's referral row for this job (PENDING until the downpayment is confirmed).
    if (ambassadorId) await ensureProjectReferral(tx, project.id, "ADMIN", createdById);

    await tx.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: "NEW",
        toStatus: proBono ? "DOWNPAYMENT_VERIFIED" : "NEW",
        changedById: createdById,
        notes: proBono
          ? `Pro bono project created manually by admin: ${input.proBonoReason?.trim()}`
          : "Project created manually by admin",
      },
    });
    await recordUpdate(tx, {
      projectId: project.id,
      kind: "STATUS",
      title: "Order received",
      body: proBono ? "Your project is confirmed. No payment needed." : "We have your order.",
      dedupeKey: `created:${project.id}`,
    });

    return project;
  }, { timeout: 30_000 });

  // The admin logged this job against an ambassador — email them (and their
  // parent, if one earns a cut too) their commission now, as the original
  // panel's "Log" did. If not now (or the send fails), they're emailed when
  // the downpayment is verified. A mail failure never fails project creation.
  if (ambassadorId && input.notifyAmbassador) {
    await emailCommission(created.id);
    if (parentInfo) await emailParentCommission(created.id);
  }

  return { id: created.id, projectId: created.projectId };
}

// ─────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────

/**
 * Where each ID lives, and which stored spellings count towards the next
 * number. The pre-Sept-2026 client/worker spellings (EC-C-, EC-W-) still count,
 * so a row created before `npm run migrate:ids` runs can never take a number
 * that migration will need. Table and column names are fixed here, never
 * user input — the only reason they may go into raw SQL.
 */
const ID_SOURCE: Record<IdKind, { table: string; column: string; pattern: string }> = {
  PROJECT: { table: "Project", column: "projectId", pattern: "^EC-([0-9]+)$" },
  CLIENT: { table: "Client", column: "clientId", pattern: "^(?:ECC-|EC-C-)([0-9]+)$" },
  WORKER: { table: "Worker", column: "workerId", pattern: "^(?:ECW-|EC-W-)([0-9]+)$" },
  AMBASSADOR: { table: "Ambassador", column: "ambassadorId", pattern: "^EC-A-([0-9]+)$" },
  PAYMENT: { table: "Payment", column: "paymentId", pattern: "^EC-PAY-([0-9]+)$" },
};

async function idTaken(kind: IdKind, id: string): Promise<boolean> {
  switch (kind) {
    case "PROJECT":
      return (await db.project.count({ where: { projectId: id } })) > 0;
    case "CLIENT":
      return (await db.client.count({ where: { clientId: id } })) > 0;
    case "WORKER":
      return (await db.worker.count({ where: { workerId: id } })) > 0;
    case "AMBASSADOR":
      return (await db.ambassador.count({ where: { ambassadorId: id } })) > 0;
    case "PAYMENT":
      return (await db.payment.count({ where: { paymentId: id } })) > 0;
  }
}

/**
 * Next sequential id for an entity type (formats in src/lib/id-format.ts):
 * the highest number already used, plus one. Max-based rather than
 * count-based, so deleting a row in the middle can never hand out a number
 * that is still taken.
 *
 * Always reads through `db` (never a transaction client) and is meant to be
 * called BEFORE opening a transaction — keeping these round-trips out of the
 * interactive-transaction budget. Callers that write inside a transaction
 * should catch a P2002 on the id column and retry with a fresh call.
 */
export async function nextId(kind: IdKind): Promise<string> {
  const { table, column, pattern } = ID_SOURCE[kind];
  const rows = await db.$queryRaw<{ max: number | null }[]>(
    Prisma.sql`SELECT MAX(CAST(substring(${Prisma.raw(`"${column}"`)} FROM ${pattern}::text) AS INTEGER)) AS max
               FROM ${sqlTable(table)}`
  );
  const highest = rows[0]?.max ?? 0;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = formatId(kind, highest + attempt);
    if (!(await idTaken(kind, candidate))) return candidate;
  }

  // Fall back to a timestamp suffix rather than loop forever.
  return `${ID_FORMAT[kind].prefix}${Date.now().toString().slice(-6)}`;
}
