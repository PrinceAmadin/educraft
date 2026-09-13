import { db } from "@/lib/db";
import { nextId } from "@/lib/services/projects";
import { notifyAdmins } from "@/lib/services/notifications";
import { generateReferralCode } from "@/lib/ambassador";
import type { AmbassadorApplicationInput } from "@/lib/validations/application";

export class ApplicationError extends Error {}

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
}): Promise<string | null> {
  const phone = input.phone.trim();
  const email = input.email?.trim() || null;
  const accountNumber = input.accountNumber.trim();

  const [pendingApp, ambassador] = await Promise.all([
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
  ]);

  if (pendingApp) return "An application with this phone, email, or bank account is already pending review.";
  if (ambassador) return "This phone, email, or bank account already belongs to an ambassador.";
  return null;
}

export async function submitApplication(
  input: AmbassadorApplicationInput
): Promise<{ id: string }> {
  const conflict = await findConflict(input);
  if (conflict) throw new ApplicationError(conflict);

  let universityId: string | null = null;
  if (input.universityId) {
    const uni = await db.university.findUnique({
      where: { id: input.universityId },
      select: { id: true },
    });
    universityId = uni?.id ?? null;
  }

  const application = await db.ambassadorApplication.create({
    data: {
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email || null,
      universityId,
      otherUniversity: universityId ? null : input.otherUniversity || null,
      department: input.department || null,
      level: input.level || null,
      motivation: input.motivation || null,
      bankName: input.bankName.trim(),
      accountNumber: input.accountNumber.trim(),
      accountName: input.accountName.trim(),
      status: "PENDING",
    },
    select: { id: true },
  });

  await notifyAdmins({
    title: "New ambassador application",
    message: `${input.fullName.trim()} applied to be an ambassador.`,
    type: "info",
    link: "/admin/ambassadors/applications",
  });

  return application;
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
      createdAt: true,
      universityId: true,
      university: { select: { abbreviation: true, name: true } },
    },
  });

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
  }));
}

// ── Approve / reject ─────────────────────────────────────────

export async function approveApplication(
  applicationId: string,
  reviewerId: string,
  universityIdOverride?: string
): Promise<{ ambassadorId: string; referralCode: string }> {
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
  const uni = await db.university.findUnique({ where: { id: universityId }, select: { id: true } });
  if (!uni) throw new ApplicationError("That university does not exist");

  const ambassadorId = await nextId("AMBASSADOR");

  const ambassador = await (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await db.ambassador.create({
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
            tier: "BRONZE",
            status: "Active",
          },
          select: { id: true, referralCode: true },
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

  await db.ambassadorApplication.update({
    where: { id: applicationId },
    data: {
      status: "APPROVED",
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      ambassadorId: ambassador.id,
    },
  });

  await notifyAdmins({
    title: "Ambassador approved",
    message: `${application.fullName} is now an ambassador (${ambassador.referralCode}).`,
    type: "success",
    link: `/admin/ambassadors/${ambassador.id}`,
  });

  return { ambassadorId: ambassador.id, referralCode: ambassador.referralCode };
}

export async function rejectApplication(
  applicationId: string,
  reviewerId: string,
  note?: string
): Promise<void> {
  const application = await db.ambassadorApplication.findUnique({
    where: { id: applicationId },
    select: { status: true },
  });
  if (!application) throw new ApplicationError("Application not found");
  if (application.status !== "PENDING") {
    throw new ApplicationError("This application has already been reviewed");
  }

  await db.ambassadorApplication.update({
    where: { id: applicationId },
    data: {
      status: "REJECTED",
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  });
}

