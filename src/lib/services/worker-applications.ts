import bcrypt from "bcryptjs";
import { Prisma, type ApplicationStatus, type WorkerApplication } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId } from "@/lib/services/projects";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
import type {
  WorkerRegistrationInput,
  EditWorkerApplicationInput,
} from "@/lib/validations/worker-application";

export class WorkerApplicationError extends Error {}

// ── Public submit ────────────────────────────────────────────

async function findConflict(input: { phone: string; email: string }): Promise<string | null> {
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();

  const [pendingApp, worker, user] = await Promise.all([
    db.workerApplication.findFirst({
      where: { status: "PENDING", OR: [{ phone }, { email }] },
      select: { id: true },
    }),
    db.worker.findFirst({ where: { OR: [{ phone }, { email }] }, select: { id: true } }),
    db.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (pendingApp) return "An application with this phone or email is already pending review.";
  if (worker) return "This phone or email already belongs to a registered worker.";
  if (user) return "That email is already in use.";
  return null;
}

/**
 * Public registration submission. Creates the User immediately (so identity
 * and the chosen password are real from the start — not a separate staging
 * password store) but `isActive: false`, which is what actually blocks sign-in
 * until an admin approves (see authorize() in src/lib/auth.ts).
 */
export async function submitWorkerApplication(
  input: WorkerRegistrationInput
): Promise<{ id: string }> {
  const conflict = await findConflict({ phone: input.phone, email: input.email });
  if (conflict) throw new WorkerApplicationError(conflict);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const email = input.email.trim().toLowerCase();

  try {
    const application = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          displayName: input.fullName.trim(),
          passwordHash,
          role: "WORKER",
          isActive: false,
        },
        select: { id: true },
      });

      return tx.workerApplication.create({
        data: {
          userId: user.id,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          email,
          educationLevel: input.educationLevel || null,
          specialties: input.specialties,
          skills: input.skills,
          bankName: input.bankName || null,
          accountNumber: input.accountNumber || null,
          accountName: input.accountName || null,
          status: "PENDING",
        },
        select: { id: true },
      });
    });

    await notifyAdmins({
      title: "New worker application",
      message: `${input.fullName.trim()} applied to join as a worker.`,
      type: "info",
      link: "/admin/workers/applications",
    });

    return application;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new WorkerApplicationError("That email is already in use.");
    }
    throw err;
  }
}

// ── Admin list / review ──────────────────────────────────────

export interface WorkerApplicationRow {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  educationLevel: string | null;
  specialties: string[];
  skills: string[];
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  status: ApplicationStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  workerId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(r: WorkerApplication): WorkerApplicationRow {
  return {
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    email: r.email,
    educationLevel: r.educationLevel,
    specialties: r.specialties,
    skills: r.skills,
    bankName: r.bankName,
    accountNumber: r.accountNumber,
    accountName: r.accountName,
    status: r.status,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    workerId: r.workerId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listWorkerApplications(
  status: ApplicationStatus | "all" = "PENDING"
): Promise<WorkerApplicationRow[]> {
  const rows = await db.workerApplication.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRow);
}

export async function getWorkerApplication(id: string): Promise<WorkerApplicationRow | null> {
  const row = await db.workerApplication.findUnique({ where: { id } });
  return row ? toRow(row) : null;
}

export async function countPendingWorkerApplications(): Promise<number> {
  return db.workerApplication.count({ where: { status: "PENDING" } });
}

/** Admin correcting an applicant's details before approving. */
export async function editWorkerApplication(
  id: string,
  input: EditWorkerApplicationInput
): Promise<WorkerApplicationRow> {
  const application = await db.workerApplication.findUnique({ where: { id }, select: { status: true } });
  if (!application) throw new WorkerApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new WorkerApplicationError("This application has already been reviewed");
  }

  const data: Prisma.WorkerApplicationUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email.trim().toLowerCase();
  if (input.educationLevel !== undefined) data.educationLevel = input.educationLevel || null;
  if (input.specialties !== undefined) data.specialties = input.specialties;
  if (input.skills !== undefined) data.skills = input.skills;
  if (input.bankName !== undefined) data.bankName = input.bankName || null;
  if (input.accountNumber !== undefined) data.accountNumber = input.accountNumber || null;
  if (input.accountName !== undefined) data.accountName = input.accountName || null;

  const updated = await db.workerApplication.update({ where: { id }, data });
  return toRow(updated);
}

/**
 * Approving creates the Worker record, links it to the User created at
 * registration, and flips that User active — the same isActive gate
 * updateWorkerStatus uses for suspend/reactivate, so there's one lever for
 * "can this account sign in" across the whole worker lifecycle.
 */
export async function approveWorkerApplication(
  id: string,
  reviewerId: string
): Promise<{ workerId: string }> {
  const application = await db.workerApplication.findUnique({ where: { id } });
  if (!application) throw new WorkerApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new WorkerApplicationError("This application has already been reviewed");
  }

  const newWorkerId = await nextId("WORKER");

  const worker = await db.$transaction(async (tx) => {
    const created = await tx.worker.create({
      data: {
        workerId: newWorkerId,
        fullName: application.fullName,
        phone: application.phone,
        email: application.email,
        educationLevel: application.educationLevel,
        specialties: application.specialties,
        skills: application.skills,
        serviceTypes: [],
        bankName: application.bankName,
        accountNumber: application.accountNumber,
        accountName: application.accountName,
        status: "Active",
        userId: application.userId,
      },
      select: { id: true, workerId: true },
    });

    await tx.user.update({ where: { id: application.userId }, data: { isActive: true } });

    await tx.workerApplication.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        workerId: created.id,
      },
    });

    return created;
  });

  await notifyUsers([application.userId], {
    title: "Application approved",
    message: "Your worker application has been approved — you can now sign in.",
    type: "success",
    link: "/worker",
  });

  return { workerId: worker.workerId };
}

export async function rejectWorkerApplication(
  id: string,
  reviewerId: string,
  note?: string
): Promise<void> {
  const application = await db.workerApplication.findUnique({ where: { id }, select: { status: true } });
  if (!application) throw new WorkerApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new WorkerApplicationError("This application has already been reviewed");
  }

  await db.workerApplication.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  });
}
