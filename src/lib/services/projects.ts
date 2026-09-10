import { Prisma, type ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { TIER_COMMISSION_RATE } from "@/lib/constants";
import { computePrice, computeSplit } from "@/lib/pricing";
import {
  MAX_REVISIONS,
  TRANSITIONS,
  allowedTransitions,
  canHold,
  type AdminHold,
  type TransitionCandidate,
} from "@/lib/pipeline";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
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
  changedById: string;
}

/**
 * Move a project to `to`, enforcing {@link TRANSITIONS} and writing a
 * ProjectStatusLog in the same transaction. Side effects for specific
 * targets (delivery date, deadline resume) are applied here too.
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
      deadlinePausedAt: true,
      internalDeadline: true,
      worker: { select: { userId: true } },
      files: { where: { category: "from_worker" }, select: { id: true } },
      _count: { select: { files: true } },
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
  };

  const rule = allowedTransitions(candidate).find((r) => r.to === to);
  if (!rule) {
    throw new TransitionError(`Cannot move from ${project.status} to ${to}`);
  }

  const blocked = rule.guard?.(candidate);
  if (blocked) throw new TransitionError(blocked);

  const data: Prisma.ProjectUpdateInput = { status: to };
  const now = new Date();

  if (to === "DELIVERED") data.deliveryDate = now;
  if (to === "COMPLETED") data.finalCompletionDate = now;
  if (to === "APPROVED") data.qaStatus = "Passed";

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
  }

  await db.$transaction([
    db.project.update({ where: { id: project.id }, data }),
    db.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: project.status,
        toStatus: to,
        changedById,
        notes: note ?? rule.action,
      },
    }),
  ]);

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
  if (to === "SUBMITTED" && project.status === "IN_PROGRESS") {
    await notifyAdmins({
      title: "Work submitted",
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

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

// ── Admin holds ──────────────────────────────────────────────

export async function holdProject(
  idOrCode: string,
  to: AdminHold,
  note: string,
  changedById: string
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, status: true },
  });
  if (!project) throw new TransitionError("Project not found");
  if (!canHold(project.status, to)) {
    throw new TransitionError(`Cannot ${to.toLowerCase()} a project that is ${project.status}`);
  }

  await db.$transaction([
    db.project.update({ where: { id: project.id }, data: { status: to } }),
    db.projectStatusLog.create({
      data: { projectId: project.id, fromStatus: project.status, toStatus: to, changedById, notes: note },
    }),
  ]);

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
}

/**
 * Verify a client payment leg that is marked "Paid". Sets the leg to
 * "Verified", records a confirmed inbound Payment, and — when the project is
 * sitting at the status that leg unblocks — advances it and logs the move.
 */
export async function verifyPayment(
  idOrCode: string,
  { leg, changedById, paymentMethod, reference, paymentDate, notes }: VerifyPaymentOptions
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: {
      id: true,
      projectId: true,
      status: true,
      client: { select: { fullName: true } },
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

  const data: Prisma.ProjectUpdateInput =
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

  const writes: Prisma.PrismaPromise<unknown>[] = [
    db.project.update({ where: { id: project.id }, data }),
    db.payment.create({
      data: {
        paymentId: await nextId("PAYMENT"),
        type: leg === "downpayment" ? "CLIENT_DOWNPAYMENT" : "CLIENT_BALANCE",
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
        date: paidOn,
      },
    }),
  ];

  if (advance) {
    writes.push(
      db.projectStatusLog.create({
        data: {
          projectId: project.id,
          fromStatus: project.status,
          toStatus: advance,
          changedById,
          notes: `${leg === "downpayment" ? "Downpayment" : "Balance"} verified`,
        },
      })
    );
  }

  await db.$transaction(writes);

  // A verified downpayment on a referred project is the "conversion" moment.
  if (leg === "downpayment" && project.ambassador?.userId) {
    await notifyUsers([project.ambassador.userId], {
      title: "Referral converted",
      message: `A client you referred paid their downpayment on ${project.projectId}.`,
      type: "success",
      link: "/ambassador/commissions",
    });
  }

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

/**
 * Record that a client says they've paid — moves the leg to "Paid" (unverified)
 * and pings the admins to verify. Does not create a Payment or advance status.
 */
export async function markPaymentPaid(
  idOrCode: string,
  leg: "downpayment" | "balance"
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, projectId: true, downpaymentStatus: true, balanceStatus: true },
  });
  if (!project) throw new TransitionError("Project not found");

  const legStatus = leg === "downpayment" ? project.downpaymentStatus : project.balanceStatus;
  if (legStatus === "Verified") throw new TransitionError("That payment is already verified");
  if (legStatus === "Paid") throw new TransitionError("That payment is already marked paid");

  const now = new Date();
  await db.project.update({
    where: { id: project.id },
    data:
      leg === "downpayment"
        ? { downpaymentStatus: "Paid", downpaymentDate: now }
        : { balanceStatus: "Paid", balanceDate: now },
  });

  await notifyAdmins({
    title: "Payment awaiting verification",
    message: `${project.projectId}: ${leg === "downpayment" ? "downpayment" : "balance"} marked paid — verify it.`,
    type: "warning",
    link: `/admin/projects/${project.projectId}`,
  });

  const detail = await getProjectDetail(project.id);
  if (!detail) throw new TransitionError("Project vanished mid-update");
  return detail;
}

interface AssignWorkerOptions {
  workerId: string;
  changedById: string;
}

export async function assignWorker(
  idOrCode: string,
  { workerId, changedById }: AssignWorkerOptions
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: { id: true, status: true },
  });
  if (!project) throw new TransitionError("Project not found");
  if (project.status !== "REQUIREMENTS_CONFIRMED") {
    throw new TransitionError("Workers are assigned once requirements are confirmed");
  }

  const worker = await db.worker.findUnique({
    where: { id: workerId },
    select: { id: true, userId: true },
  });
  if (!worker) throw new TransitionError("Worker not found");

  const now = new Date();
  await db.$transaction([
    db.project.update({
      where: { id: project.id },
      data: { workerId, assignedDate: now, status: "ASSIGNED", workerAccepted: false },
    }),
    db.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: "REQUIREMENTS_CONFIRMED",
        toStatus: "ASSIGNED",
        changedById,
        notes: "Worker assigned",
      },
    }),
  ]);

  const full = await db.project.findUnique({
    where: { id: project.id },
    select: { projectId: true },
  });
  await notifyUsers([worker.userId], {
    title: "New project assigned",
    message: `${full?.projectId ?? "A project"} has been assigned to you — accept it to start.`,
    type: "info",
    link: "/worker/projects",
  });

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
  });

  // Referral code → ambassador link (only for a brand-new client).
  let ambassadorId: string | null = null;
  let ambassadorCommRate: number | null = null;
  let referralCodeUsed: string | null = null;

  const referralCode =
    input.clientMode === "new" ? (input.referralCode ?? "").trim() : "";
  if (referralCode) {
    const ambassador = await db.ambassador.findUnique({
      where: { referralCode },
      select: { id: true, tier: true, status: true },
    });
    if (ambassador && ambassador.status !== "Suspended" && ambassador.status !== "Terminated") {
      ambassadorId = ambassador.id;
      ambassadorCommRate = TIER_COMMISSION_RATE[ambassador.tier] ?? 10;
      referralCodeUsed = referralCode;
    }
  }

  const split = computeSplit(price.total, ambassadorCommRate);

  const now = new Date();
  const clientDeadline = input.clientDeadline ? new Date(input.clientDeadline) : null;
  const internalDeadline =
    clientDeadline ?? new Date(now.getTime() + service.estimatedDays * 86_400_000);

  const additionalData: Record<string, unknown> = {};
  if (input.courseTitle) additionalData.courseTitle = input.courseTitle;
  if (input.courseCode) additionalData.courseCode = input.courseCode;
  if (input.wordCount) additionalData.wordCount = input.wordCount;

  // Ids generated up front so the transaction only does writes.
  const newProjectId = await nextId("PROJECT");
  const newClientId = input.clientMode === "new" ? await nextId("CLIENT") : null;

  const created = await db.$transaction(async (tx) => {
    let clientId: string;

    if (input.clientMode === "existing") {
      if (!input.clientId) throw new TransitionError("No client selected");
      const existing = await tx.client.findUnique({
        where: { id: input.clientId },
        select: { id: true },
      });
      if (!existing) throw new TransitionError("Selected client not found");
      clientId = existing.id;
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
        status: "NEW",
        isExpressDelivery: input.isExpressDelivery,
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
        price: price.total,
        downpaymentAmount: price.downpaymentAmount,
        balanceAmount: price.balanceAmount,
        downpaymentStatus: "Unpaid",
        balanceStatus: "Unpaid",
        ambassadorId,
        ambassadorCommRate,
        ambassadorCommission: split.ambassadorCommission,
        workerPayoutRate: 40,
        workerPayout: split.workerPayout,
        educraftRevenue: split.educraftRevenue,
      },
      select: { id: true, projectId: true },
    });

    await tx.projectStatusLog.create({
      data: {
        projectId: project.id,
        fromStatus: "NEW",
        toStatus: "NEW",
        changedById: createdById,
        notes: "Project created manually by admin",
      },
    });

    return project;
  }, { timeout: 15_000 });

  return { id: created.id, projectId: created.projectId };
}

// ─────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────

const ID_PREFIX = {
  PROJECT: "EC",
  CLIENT: "EC-C",
  WORKER: "EC-W",
  AMBASSADOR: "EC-A",
  PAYMENT: "EC-PAY",
} as const;

/**
 * Sequential 5-digit id per entity type, e.g. EC-00234, EC-PAY-00007.
 * Derived from the current row count plus a collision retry — good enough
 * at this scale and readable, which the blueprint asks for.
 */
/**
 * Sequential id for an entity type. Always reads through `db` (never a
 * transaction client) and is meant to be called BEFORE opening a transaction —
 * keeping slow count/exists round-trips out of the interactive-transaction
 * budget. Callers that write inside a transaction should catch a P2002 on the
 * id column and retry with a fresh call.
 */
export async function nextId(kind: keyof typeof ID_PREFIX): Promise<string> {
  const prefix = ID_PREFIX[kind];

  for (let attempt = 0; attempt < 5; attempt++) {
    let count: number;
    let exists: (id: string) => Promise<boolean>;

    switch (kind) {
      case "PROJECT":
        count = await db.project.count();
        exists = async (id) => (await db.project.count({ where: { projectId: id } })) > 0;
        break;
      case "CLIENT":
        count = await db.client.count();
        exists = async (id) => (await db.client.count({ where: { clientId: id } })) > 0;
        break;
      case "WORKER":
        count = await db.worker.count();
        exists = async (id) => (await db.worker.count({ where: { workerId: id } })) > 0;
        break;
      case "AMBASSADOR":
        count = await db.ambassador.count();
        exists = async (id) => (await db.ambassador.count({ where: { ambassadorId: id } })) > 0;
        break;
      case "PAYMENT":
        count = await db.payment.count();
        exists = async (id) => (await db.payment.count({ where: { paymentId: id } })) > 0;
        break;
    }

    const candidate = `${prefix}-${String(count + 1 + attempt).padStart(5, "0")}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Fall back to a timestamp suffix rather than loop forever.
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}
