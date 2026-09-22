import bcrypt from "bcryptjs";
import { waitUntil } from "@vercel/functions";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId } from "@/lib/services/projects";
import { notifyAdmins } from "@/lib/services/notifications";
import { generateReferralCode } from "@/lib/ambassador";
import { nextGeneralCode } from "@/lib/services/ambassador-roster";
import { sendMail } from "@/lib/mailer";
import { callbackBaseUrl } from "@/lib/paystack";
import { ambassadorWelcomeEmail } from "@/lib/emails/ambassador-welcome";
import { applicationRejectedEmail } from "@/lib/emails/application-decision";
import { alertAmbassadorApplication } from "@/lib/services/team-alerts";
import { findLoginForApplication, sendApplicationCode, verifyApplicationCode } from "@/lib/services/portal-otp";
import type { SendFn } from "@/lib/services/client-otp";
import type { AmbassadorApplicationInput, EditApplicationInput } from "@/lib/validations/application";

export class ApplicationError extends Error {
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

/**
 * Rejects a resubmission from someone already in the system — by phone,
 * email, or bank account — the same checks the original ambassador app made
 * against Redis, now against Postgres. Checked against both pending
 * applications and active ambassadors so nobody doubles up mid-review either.
 */
async function findConflict(input: {
  phone: string;
  email?: string;
  accountNumber: string;
  /** The email login is the applicant's own (a worker applying as an ambassador). */
  ownLogin?: boolean;
}): Promise<string | null> {
  const phone = input.phone.trim();
  const email = input.email?.trim() || null;
  const accountNumber = input.accountNumber.trim();

  const [pendingApp, ambassador, user] = await Promise.all([
    db.ambassadorApplication.findFirst({
      where: {
        status: "PENDING",
        OR: [{ phone }, ...(email ? [{ email }] : []), { accountNumber }],
      },
      select: { id: true },
    }),
    db.ambassador.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : []), { accountNumber }],
      },
      select: { id: true },
    }),
    email && !input.ownLogin ? db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } }) : null,
  ]);

  if (user) return "That email is already in use.";
  if (pendingApp) return "An application with this phone, email, or bank account is already pending review.";
  if (ambassador) return "This phone, email, or bank account already belongs to an ambassador.";
  return null;
}

export async function submitApplication(
  input: AmbassadorApplicationInput,
  ctx: ApplyContext
): Promise<{ id: string; slotCode: string }> {
  // A worker (anyone with an active login and a worker profile) applying as an
  // ambassador keeps their one login: the emailed code proves the inbox, the
  // application attaches to that login, and no new password is created.
  const ownLogin = await findLoginForApplication(input.email, "AMBASSADOR");
  if (ownLogin) {
    if (!input.emailCode) {
      await sendApplicationCode({ email: input.email, fullName: ownLogin.fullName, ...ctx });
      throw new ApplicationError("This email already has an EduCraft login. We sent a 6-digit code to it.", "VERIFY_EMAIL");
    }
    if (!(await verifyApplicationCode(input.email, input.emailCode, ctx.ip))) {
      throw new ApplicationError("That code did not work. Check it, or ask for a new one.", "BAD_CODE");
    }
  }

  const conflict = await findConflict({ ...input, ownLogin: Boolean(ownLogin) });
  if (conflict) throw new ApplicationError(conflict);

  let universityId: string | null = null;
  if (input.universityId) {
    const uni = await db.university.findUnique({
      where: { id: input.universityId },
      select: { id: true },
    });
    universityId = uni?.id ?? null;
  }

  // The slot is picked here, not trusted from the browser: the first vacant
  // slot (or the next number), held for this application until it is decided.
  const { code: slotCode } = await nextGeneralCode();
  const email = input.email.trim().toLowerCase();
  const passwordHash = ownLogin ? "" : await bcrypt.hash(input.password, 12);

  // Like worker applications: the login exists from the start but stays
  // inactive (isActive: false blocks sign-in) until an admin approves. An
  // existing login is reused as it is (already active, password untouched).
  const application = await db.$transaction(async (tx) => {
    const user = ownLogin
      ? { id: ownLogin.userId }
      : await tx.user.create({
          data: {
            email,
            displayName: input.fullName.trim(),
            passwordHash,
            role: "AMBASSADOR",
            isActive: false,
          },
          select: { id: true },
        });
    return tx.ambassadorApplication.create({
      data: {
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        email,
        universityId,
        otherUniversity: universityId ? null : input.otherUniversity || null,
        department: input.department || null,
        level: input.level || null,
        motivation: input.motivation || null,
        bankName: input.bankName.trim(),
        accountNumber: input.accountNumber.trim(),
        accountName: input.accountName.trim(),
        slotCode,
        userId: user.id,
        status: "PENDING",
      },
      select: { id: true },
    });
  });

  // The team's Gmail (Settings > Email alerts), sent after the response. Queued
  // before anything else can throw, so a saved application is always emailed.
  alertAmbassadorApplication(application.id, { existingLogin: Boolean(ownLogin) });
  await notifyAdmins({
    title: "New ambassador application",
    message: `${input.fullName.trim()} applied for slot ${slotCode}.`,
    type: "info",
    link: "/admin/ambassadors/applications",
  });

  return { id: application.id, slotCode };
}

// ── Admin list ───────────────────────────────────────────────

export interface ApplicationRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  university: string | null;
  department: string | null;
  level: string | null;
  motivation: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewNote: string | null;
  ambassadorId: string | null;
  /** True when approving needs the admin to pick a university. */
  needsUniversity: boolean;
  /** The general slot held for this applicant ("059"). */
  slotCode: string | null;
  universityId: string | null;
  otherUniversity: string | null;
  /**
   * True when the application sits on a login the person already uses (a
   * worker applying as an ambassador): that email is their sign-in, so it
   * can't be edited from the application.
   */
  emailLocked: boolean;
}

export async function listApplications(
  status: "PENDING" | "APPROVED" | "REJECTED" | "all" = "PENDING"
): Promise<ApplicationRow[]> {
  const rows = await db.ambassadorApplication.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      otherUniversity: true,
      department: true,
      level: true,
      motivation: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      status: true,
      reviewNote: true,
      ambassadorId: true,
      slotCode: true,
      createdAt: true,
      universityId: true,
      university: { select: { abbreviation: true, name: true } },
      userId: true,
    },
  });

  const userIds = rows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  const activeLogins = new Set(
    userIds.length
      ? (
          await db.user.findMany({ where: { id: { in: userIds }, isActive: true }, select: { id: true } })
        ).map((u) => u.id)
      : []
  );

  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    email: r.email,
    university: r.university?.name ?? r.otherUniversity ?? null,
    department: r.department,
    level: r.level,
    motivation: r.motivation,
    bankName: r.bankName,
    accountNumber: r.accountNumber,
    accountName: r.accountName,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviewNote: r.reviewNote,
    ambassadorId: r.ambassadorId,
    needsUniversity: !r.universityId,
    slotCode: r.slotCode,
    universityId: r.universityId,
    otherUniversity: r.otherUniversity,
    emailLocked: r.status === "PENDING" && Boolean(r.userId && activeLogins.has(r.userId)),
  }));
}

// ── Admin edit ───────────────────────────────────────────────

const padSlot = (code: string) => String(parseInt(code, 10)).padStart(3, "0");

/**
 * Admin correcting a pending application before approving or rejecting it:
 * any detail the applicant typed, and the general slot held for them.
 *
 * The login is not the admin's to change: the password is never touched.
 * When the login was created by this application (still inactive), its email
 * and display name follow the correction, so the applicant signs in with the
 * corrected email once approved. When the application sits on a login the
 * person already uses (a worker applying as an ambassador), the email is
 * their sign-in and is refused here.
 */
export async function editApplication(applicationId: string, input: EditApplicationInput): Promise<void> {
  const application = await db.ambassadorApplication.findUnique({
    where: { id: applicationId },
    select: { status: true, userId: true, email: true, phone: true, accountNumber: true, slotCode: true },
  });
  if (!application) throw new ApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new ApplicationError("This application has already been reviewed");
  }

  const login = application.userId
    ? await db.user.findUnique({ where: { id: application.userId }, select: { id: true, isActive: true } })
    : null;

  const data: Prisma.AmbassadorApplicationUpdateInput = {};
  const loginData: Prisma.UserUpdateInput = {};

  if (input.fullName !== undefined) {
    data.fullName = input.fullName;
    loginData.displayName = input.fullName;
  }

  // Duplicate checks mirror the public form, excluding this application.
  const others = { status: "PENDING" as const, id: { not: applicationId } };

  if (input.phone !== undefined && input.phone !== application.phone) {
    const [app, amb] = await Promise.all([
      db.ambassadorApplication.findFirst({ where: { ...others, phone: input.phone }, select: { fullName: true } }),
      db.ambassador.findFirst({ where: { phone: input.phone }, select: { fullName: true } }),
    ]);
    if (app) throw new ApplicationError(`That phone number is on ${app.fullName}'s pending application.`);
    if (amb) throw new ApplicationError(`That phone number already belongs to ambassador ${amb.fullName}.`);
    data.phone = input.phone;
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email !== (application.email ?? "").toLowerCase()) {
      if (!email) throw new ApplicationError("Enter an email: it is the email they sign in with.");
      if (login?.isActive) {
        throw new ApplicationError(
          "This person applied with the login they already use, so that email is their sign-in and can't be changed here."
        );
      }
      const [user, app, amb] = await Promise.all([
        db.user.findUnique({ where: { email }, select: { id: true } }),
        db.ambassadorApplication.findFirst({ where: { ...others, email }, select: { fullName: true } }),
        db.ambassador.findFirst({ where: { email }, select: { fullName: true } }),
      ]);
      if (user && user.id !== login?.id) throw new ApplicationError("That email already belongs to another login.");
      if (app) throw new ApplicationError(`That email is on ${app.fullName}'s pending application.`);
      if (amb) throw new ApplicationError(`That email already belongs to ambassador ${amb.fullName}.`);
      data.email = email;
      loginData.email = email;
    }
  }

  if (input.universityId !== undefined || input.otherUniversity !== undefined) {
    let universityId: string | null = null;
    if (input.universityId) {
      const uni = await db.university.findUnique({ where: { id: input.universityId }, select: { id: true } });
      if (!uni) throw new ApplicationError("That university does not exist");
      universityId = uni.id;
    }
    const other = input.otherUniversity?.trim() || null;
    if (!universityId && !other) throw new ApplicationError("Pick a university, or type the one that isn't listed");
    data.university = universityId ? { connect: { id: universityId } } : { disconnect: true };
    data.otherUniversity = universityId ? null : other;
  }

  if (input.department !== undefined) data.department = input.department || null;
  if (input.level !== undefined) data.level = input.level || null;
  if (input.motivation !== undefined) data.motivation = input.motivation || null;
  if (input.bankName !== undefined) data.bankName = input.bankName || null;
  if (input.accountName !== undefined) data.accountName = input.accountName || null;

  if (input.accountNumber !== undefined && input.accountNumber !== (application.accountNumber ?? "")) {
    if (!input.accountNumber) throw new ApplicationError("Enter a 10-digit account number: commission is paid into it.");
    const [app, amb] = await Promise.all([
      db.ambassadorApplication.findFirst({
        where: { ...others, accountNumber: input.accountNumber },
        select: { fullName: true },
      }),
      db.ambassador.findFirst({ where: { accountNumber: input.accountNumber }, select: { fullName: true } }),
    ]);
    if (app) throw new ApplicationError(`That account number is on ${app.fullName}'s pending application.`);
    if (amb) throw new ApplicationError(`That account number already belongs to ambassador ${amb.fullName}.`);
    data.accountNumber = input.accountNumber;
  }

  if (input.slotCode) {
    const code = padSlot(input.slotCode);
    if (code === "000") throw new ApplicationError("Slot IDs start at 001");
    if (code !== application.slotCode) {
      const [slot, holder, app] = await Promise.all([
        db.ambassadorSlot.findUnique({ where: { code }, select: { vacant: true, name: true } }),
        db.ambassador.findUnique({ where: { legacySlotId: code }, select: { fullName: true } }),
        db.ambassadorApplication.findFirst({ where: { ...others, slotCode: code }, select: { fullName: true } }),
      ]);
      if (holder) throw new ApplicationError(`Slot ${code} belongs to ${holder.fullName}.`);
      if (slot && !slot.vacant) throw new ApplicationError(`Slot ${code} is taken${slot.name ? ` by ${slot.name}` : ""}.`);
      if (app) throw new ApplicationError(`Slot ${code} is held for ${app.fullName}'s pending application.`);
      data.slotCode = code;
    }
  }

  // Only a login this application created (still inactive) follows the edit.
  const editsLogin = Boolean(login && !login.isActive && Object.keys(loginData).length > 0);

  try {
    await db.$transaction(async (tx) => {
      await tx.ambassadorApplication.update({ where: { id: applicationId }, data });
      if (editsLogin && login) await tx.user.update({ where: { id: login.id }, data: loginData });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApplicationError("That email already belongs to another login.");
    }
    throw error;
  }
}

// ── Approve / reject ─────────────────────────────────────────

export async function approveApplication(
  applicationId: string,
  reviewerId: string,
  universityIdOverride?: string
): Promise<{ ambassadorId: string; referralCode: string; slotCode: string }> {
  const application = await db.ambassadorApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      fullName: true,
      phone: true,
      email: true,
      universityId: true,
      department: true,
      level: true,
      bankName: true,
      accountNumber: true,
      accountName: true,
      slotCode: true,
      userId: true,
    },
  });
  if (!application) throw new ApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new ApplicationError("This application has already been reviewed");
  }

  const universityId = application.universityId ?? universityIdOverride;
  if (!universityId) {
    throw new ApplicationError("Pick a university for this ambassador before approving");
  }
  const uni = await db.university.findUnique({
    where: { id: universityId },
    select: { id: true, abbreviation: true },
  });
  if (!uni) throw new ApplicationError("That university does not exist");

  // The slot held since they applied — unless someone filled it meanwhile
  // (admin edit in Manage), in which case they get the next free one.
  let slotCode = application.slotCode;
  if (slotCode) {
    const [slot, holder] = await Promise.all([
      db.ambassadorSlot.findUnique({ where: { code: slotCode }, select: { vacant: true } }),
      db.ambassador.findUnique({ where: { legacySlotId: slotCode }, select: { id: true } }),
    ]);
    if ((slot && !slot.vacant) || holder) slotCode = null;
  }
  if (!slotCode) slotCode = (await nextGeneralCode()).code;
  const claimed = slotCode;

  const ambassadorId = await nextId("AMBASSADOR");

  const ambassador = await (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await db.$transaction(async (tx) => {
          const created = await tx.ambassador.create({
            data: {
              ambassadorId,
              fullName: application.fullName,
              phone: application.phone,
              email: application.email,
              universityId,
              department: application.department,
              level: application.level,
              bankName: application.bankName,
              accountNumber: application.accountNumber,
              accountName: application.accountName,
              referralCode: generateReferralCode(application.fullName),
              legacySlotId: claimed,
              userId: application.userId,
              tier: "BRONZE",
              status: "Active",
            },
            select: { id: true, referralCode: true },
          });
          // Fill (or create) the slot — its /EduCraftA/{code} link is live now.
          await tx.ambassadorSlot.upsert({
            where: { code: claimed },
            create: {
              kind: "GENERAL",
              code: claimed,
              name: application.fullName,
              school: uni.abbreviation,
              vacant: false,
            },
            update: { name: application.fullName, school: uni.abbreviation, vacant: false },
          });
          if (application.userId) {
            await tx.user.update({ where: { id: application.userId }, data: { isActive: true } });
          }
          await tx.ambassadorApplication.update({
            where: { id: applicationId },
            data: {
              status: "APPROVED",
              reviewedById: reviewerId,
              reviewedAt: new Date(),
              ambassadorId: created.id,
              slotCode: claimed,
            },
          });
          return created;
        });
      } catch (error) {
        const isP2002 =
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "P2002";
        if (isP2002 && attempt < 3) continue;
        throw error;
      }
    }
    throw new ApplicationError("Could not allocate an ambassador id — try again");
  })();

  // Welcome email: slot ID, their client link, and how to sign in. A failed
  // send never undoes the approval — the admin can message them from Tracking.
  if (application.email) {
    const base = callbackBaseUrl();
    const mail = ambassadorWelcomeEmail({
      fullName: application.fullName,
      slotCode: claimed,
      referralLink: `${base}/EduCraftA/${claimed}`,
      // /ambassador, not /login: a worker who became an ambassador would
      // otherwise land on their worker dashboard.
      loginUrl: `${base}/ambassador`,
      hasLogin: Boolean(application.userId),
    });
    const sent = await sendMail({ to: application.email, ...mail });
    if (!sent.ok) console.error("[approveApplication] welcome email failed:", sent.error);
  }

  await notifyAdmins({
    title: "Ambassador approved",
    message: `${application.fullName} is now an ambassador (slot ${claimed}).`,
    type: "success",
    link: `/admin/ambassadors/${ambassador.id}`,
  });

  return { ambassadorId: ambassador.id, referralCode: ambassador.referralCode, slotCode: claimed };
}

export async function rejectApplication(
  applicationId: string,
  reviewerId: string,
  note?: string
): Promise<void> {
  const application = await db.ambassadorApplication.findUnique({
    where: { id: applicationId },
    select: { status: true, userId: true, fullName: true, email: true },
  });
  if (!application) throw new ApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new ApplicationError("This application has already been reviewed");
  }

  await db.$transaction(async (tx) => {
    // Releases the held slot for the next applicant.
    await tx.ambassadorApplication.update({
      where: { id: applicationId },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
        slotCode: null,
        userId: null,
      },
    });
    // The login was created inactive at submission; drop it so the email is
    // free if they apply again.
    if (application.userId) {
      await tx.user.deleteMany({ where: { id: application.userId, isActive: false } });
    }
  });

  // The applicant hears the outcome by email (the note stays internal). Sent
  // after the response; a failed send never undoes the rejection.
  if (application.email) {
    const mail = applicationRejectedEmail({ fullName: application.fullName, role: "ambassador" });
    const to = application.email;
    waitUntil(
      sendMail({ to, ...mail }).then((sent) => {
        if (sent.ok) console.info("[rejectApplication] decision email sent");
        else console.error("[rejectApplication] decision email failed:", sent.error);
      })
    );
  }
}
