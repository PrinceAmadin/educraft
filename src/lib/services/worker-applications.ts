import bcrypt from "bcryptjs";
import { waitUntil } from "@vercel/functions";
import { Prisma, type ApplicationStatus, type WorkerApplication } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId } from "@/lib/services/projects";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
import { alertWorkerApplication } from "@/lib/services/team-alerts";
import { sendMail } from "@/lib/mailer";
import { siteUrl } from "@/lib/site-url";
import { applicationRejectedEmail, workerApprovedEmail } from "@/lib/emails/application-decision";
import { findLoginForApplication, sendApplicationCode, verifyApplicationCode } from "@/lib/services/portal-otp";
import type { SendFn } from "@/lib/services/client-otp";
import type {
  WorkerRegistrationInput,
  EditWorkerApplicationInput,
} from "@/lib/validations/worker-application";

export class WorkerApplicationError extends Error {
  constructor(
    message: string,
    /** VERIFY_EMAIL: the email already has a login and a code was sent. BAD_CODE: the code was wrong. */
    readonly code?: "VERIFY_EMAIL" | "BAD_CODE"
  ) {
    super(message);
  }
}

export interface ApplyContext {
  ip: string;
  send: SendFn;
  defer: (work: Promise<unknown>) => void;
}

// ── Public submit ────────────────────────────────────────────

async function findConflict(input: { phone: string; email: string; ownLogin?: boolean }): Promise<string | null> {
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();

  const [pendingApp, worker, user] = await Promise.all([
    db.workerApplication.findFirst({
      where: { status: "PENDING", OR: [{ phone }, { email }] },
      select: { id: true },
    }),
    db.worker.findFirst({ where: { OR: [{ phone }, { email }] }, select: { id: true } }),
    input.ownLogin ? null : db.user.findUnique({ where: { email }, select: { id: true } }),
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
  input: WorkerRegistrationInput,
  ctx: ApplyContext
): Promise<{ id: string }> {
  // An ambassador (anyone with an active login and an ambassador profile)
  // applying as a worker keeps their one login: the emailed code proves the
  // inbox, the application attaches to that login, and no new password is set.
  const ownLogin = await findLoginForApplication(input.email, "WORKER");
  if (ownLogin) {
    if (!input.emailCode) {
      await sendApplicationCode({ email: input.email, fullName: ownLogin.fullName, ...ctx });
      throw new WorkerApplicationError("This email already has an EduCraft login. We sent a 6-digit code to it.", "VERIFY_EMAIL");
    }
    if (!(await verifyApplicationCode(input.email, input.emailCode, ctx.ip))) {
      throw new WorkerApplicationError("That code did not work. Check it, or ask for a new one.", "BAD_CODE");
    }
  }

  const conflict = await findConflict({ phone: input.phone, email: input.email, ownLogin: Boolean(ownLogin) });
  if (conflict) throw new WorkerApplicationError(conflict);

  const passwordHash = ownLogin ? "" : await bcrypt.hash(input.password, 12);
  const email = input.email.trim().toLowerCase();

  try {
    const application = await db.$transaction(async (tx) => {
      const user = ownLogin
        ? { id: ownLogin.userId }
        : await tx.user.create({
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

    // The team's Gmail (Settings > Email alerts), sent after the response. Queued
    // before anything else can throw, so a saved application is always emailed.
    alertWorkerApplication(application.id, { existingLogin: Boolean(ownLogin) });
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
  /** Sits on a login the person already uses, so the email is their sign-in. */
  emailLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

type RowSource = WorkerApplication & { user: { isActive: boolean } };

function toRow(r: RowSource): WorkerApplicationRow {
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
    emailLocked: r.status === "PENDING" && r.user.isActive,
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
    include: { user: { select: { isActive: true } } },
  });
  return rows.map(toRow);
}

export async function getWorkerApplication(id: string): Promise<WorkerApplicationRow | null> {
  const row = await db.workerApplication.findUnique({ where: { id }, include: { user: { select: { isActive: true } } } });
  return row ? toRow(row) : null;
}

export async function countPendingWorkerApplications(): Promise<number> {
  return db.workerApplication.count({ where: { status: "PENDING" } });
}

/**
 * Admin correcting an applicant's details before approving. The password is
 * never touched. The login created at registration (still inactive) follows a
 * name or email correction, so the worker signs in with the corrected email
 * once approved; a login the person already uses (an ambassador applying as a
 * worker) is their sign-in, so its email is refused here.
 */
export async function editWorkerApplication(
  id: string,
  input: EditWorkerApplicationInput
): Promise<WorkerApplicationRow> {
  const application = await db.workerApplication.findUnique({
    where: { id },
    select: { status: true, email: true, phone: true, userId: true, user: { select: { isActive: true } } },
  });
  if (!application) throw new WorkerApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new WorkerApplicationError("This application has already been reviewed");
  }

  const data: Prisma.WorkerApplicationUpdateInput = {};
  const loginData: Prisma.UserUpdateInput = {};
  const others = { status: "PENDING" as const, id: { not: id } };

  if (input.fullName !== undefined) {
    data.fullName = input.fullName;
    loginData.displayName = input.fullName;
  }
  if (input.phone !== undefined && input.phone !== application.phone) {
    const [app, worker] = await Promise.all([
      db.workerApplication.findFirst({ where: { ...others, phone: input.phone }, select: { fullName: true } }),
      db.worker.findFirst({ where: { phone: input.phone }, select: { fullName: true } }),
    ]);
    if (app) throw new WorkerApplicationError(`That phone number is on ${app.fullName}'s pending application.`);
    if (worker) throw new WorkerApplicationError(`That phone number already belongs to worker ${worker.fullName}.`);
    data.phone = input.phone;
  }
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email !== application.email.toLowerCase()) {
      if (application.user.isActive) {
        throw new WorkerApplicationError(
          "This person applied with the login they already use, so that email is their sign-in and can't be changed here."
        );
      }
      const [user, app, worker] = await Promise.all([
        db.user.findUnique({ where: { email }, select: { id: true } }),
        db.workerApplication.findFirst({ where: { ...others, email }, select: { fullName: true } }),
        db.worker.findFirst({ where: { email }, select: { fullName: true } }),
      ]);
      if (user && user.id !== application.userId) {
        throw new WorkerApplicationError("That email already belongs to another login.");
      }
      if (app) throw new WorkerApplicationError(`That email is on ${app.fullName}'s pending application.`);
      if (worker) throw new WorkerApplicationError(`That email already belongs to worker ${worker.fullName}.`);
      data.email = email;
      loginData.email = email;
    }
  }
  if (input.educationLevel !== undefined) data.educationLevel = input.educationLevel || null;
  if (input.specialties !== undefined) data.specialties = input.specialties;
  if (input.skills !== undefined) data.skills = input.skills;
  if (input.bankName !== undefined) data.bankName = input.bankName || null;
  if (input.accountNumber !== undefined) data.accountNumber = input.accountNumber || null;
  if (input.accountName !== undefined) data.accountName = input.accountName || null;

  const editsLogin = !application.user.isActive && Object.keys(loginData).length > 0;

  try {
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.workerApplication.update({
        where: { id },
        data,
        include: { user: { select: { isActive: true } } },
      });
      if (editsLogin) await tx.user.update({ where: { id: application.userId }, data: loginData });
      return row;
    });
    return toRow(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new WorkerApplicationError("That email already belongs to another login.");
    }
    throw err;
  }
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

  // Active before approval means they applied with the login they already use
  // (an ambassador), so the welcome email says "sign in as usual".
  const login = await db.user.findUnique({
    where: { id: application.userId },
    select: { email: true, isActive: true },
  });

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

  // Welcome email with their worker ID and how to sign in. Sent after the
  // response and queued before anything else can throw; a failed send never
  // undoes the approval.
  const mail = workerApprovedEmail({
    fullName: application.fullName,
    workerCode: worker.workerId,
    loginEmail: login?.email ?? application.email,
    // /worker, not /login: an ambassador who became a worker would otherwise
    // land on their ambassador dashboard. Signed out, it goes via /login.
    loginUrl: `${siteUrl()}/worker`,
    existingLogin: Boolean(login?.isActive),
  });
  waitUntil(
    sendMail({ to: application.email, ...mail }).then((sent) => {
      if (sent.ok) console.info("[approveWorkerApplication] welcome email sent");
      else console.error("[approveWorkerApplication] welcome email failed:", sent.error);
    })
  );

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
  const application = await db.workerApplication.findUnique({
    where: { id },
    select: { status: true, fullName: true, email: true },
  });
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

  // The applicant hears the outcome by email (the note stays internal). Sent
  // after the response; a failed send never undoes the rejection.
  const mail = applicationRejectedEmail({ fullName: application.fullName, role: "worker" });
  waitUntil(
    sendMail({ to: application.email, ...mail }).then((sent) => {
      if (sent.ok) console.info("[rejectWorkerApplication] decision email sent");
      else console.error("[rejectWorkerApplication] decision email failed:", sent.error);
    })
  );
}
