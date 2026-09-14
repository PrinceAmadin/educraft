import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId } from "@/lib/services/projects";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
import { getCommissionRates } from "@/lib/services/settings";
import {
  resolveParentCommission,
  upsertCommissionExpense,
  upsertParentCommissionExpense,
} from "@/lib/services/ambassador-commission";
import { commissionFor } from "@/lib/commission";
import { computePrice, computeSplit } from "@/lib/pricing";
import { resolveTemplate } from "@/lib/intake-templates";
import type { IntakeSubmitInput } from "@/lib/validations/intake";

export interface PublicService {
  id: string;
  serviceCode: string;
  serviceName: string;
  category: string;
  basePrice: number;
  pricingModel: string;
  estimatedDays: number;
  intakeFormTemplate: string;
  description: string | null;
  expressDeliverySurcharge: number | null;
  downpaymentPercentage: number;
  sortOrder: number;
  variants: { id: string; name: string; priceAddon: number }[];
}

export async function getActiveServices(): Promise<PublicService[]> {
  const services = await db.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { serviceName: "asc" }],
    select: {
      id: true,
      serviceCode: true,
      serviceName: true,
      category: true,
      basePrice: true,
      pricingModel: true,
      estimatedDays: true,
      intakeFormTemplate: true,
      description: true,
      expressDeliverySurcharge: true,
      downpaymentPercentage: true,
      sortOrder: true,
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, priceAddon: true },
      },
    },
  });
  return services;
}

export async function getServiceByCode(serviceCode: string): Promise<PublicService | null> {
  const service = await db.service.findFirst({
    where: { serviceCode, isActive: true },
    select: {
      id: true,
      serviceCode: true,
      serviceName: true,
      category: true,
      basePrice: true,
      pricingModel: true,
      estimatedDays: true,
      intakeFormTemplate: true,
      description: true,
      expressDeliverySurcharge: true,
      downpaymentPercentage: true,
      sortOrder: true,
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, priceAddon: true },
      },
    },
  });
  return service;
}

export interface IntakeResult {
  projectId: string;
}

export class IntakeError extends Error {}

/**
 * Public intake submission → new Client + new Project at NEW.
 *
 * Always creates a fresh client (no dedupe — an admin merges duplicates
 * later). Links a referring ambassador when the code resolves. Ids are
 * generated before the transaction, which carries an explicit timeout.
 */
export async function submitIntake(input: IntakeSubmitInput): Promise<IntakeResult> {
  const service = await db.service.findFirst({
    where: { serviceCode: input.serviceCode, isActive: true },
    select: {
      id: true,
      basePrice: true,
      estimatedDays: true,
      intakeFormTemplate: true,
      expressDeliverySurcharge: true,
      downpaymentPercentage: true,
    },
  });
  if (!service) throw new IntakeError("That service is no longer available");

  const template = resolveTemplate(service.intakeFormTemplate);
  if (!template || template !== input.template) {
    throw new IntakeError("This form does not match the selected service");
  }

  const price = computePrice({
    basePrice: service.basePrice,
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: input.isExpressDelivery,
    downpaymentPercentage: service.downpaymentPercentage,
  });

  // Referral link
  let ambassadorId: string | null = null;
  let ambassadorCommRate: number | null = null;
  let referralCodeUsed: string | null = null;
  let ambassadorUserId: string | null = null;
  let ambassadorName = "";
  const code = input.referralCode?.trim();
  if (code) {
    const ambassador = await db.ambassador.findUnique({
      where: { referralCode: code },
      select: { id: true, tier: true, status: true, userId: true, fullName: true },
    });
    if (ambassador && ambassador.status !== "Suspended" && ambassador.status !== "Terminated") {
      ambassadorId = ambassador.id;
      ambassadorName = ambassador.fullName;
      ambassadorCommRate = (await getCommissionRates())[ambassador.tier];
      referralCodeUsed = code;
      ambassadorUserId = ambassador.userId;
    }
  }

  const split = computeSplit(price.total, ambassadorCommRate);
  const parentInfo = ambassadorId ? await resolveParentCommission(ambassadorId) : null;
  const parentCommission = parentInfo ? commissionFor(price.total, parentInfo.rate) : null;

  const now = new Date();
  const clientDeadline = input.clientDeadline ? new Date(input.clientDeadline) : null;
  const internalDeadline =
    clientDeadline ?? new Date(now.getTime() + service.estimatedDays * 86_400_000);

  // Service-specific payload that has no dedicated column.
  const additionalData: Record<string, unknown> = {};
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value) && value.length === 0) return;
    additionalData[key] = value;
  };

  add("courseTitle", input.courseTitle);
  add("courseCode", input.courseCode);
  add("wordCount", input.wordCount);
  add("lecturerInstructions", input.lecturerInstructions);
  add("proposalNotes", input.proposalNotes);

  // IT report
  add("companyName", input.companyName);
  add("companyAddress", input.companyAddress);
  add("itDuration", input.itDuration);
  add("companyDepartment", input.companyDepartment);
  add("companySupervisor", input.companySupervisor);

  // CV / resume
  add("linkedin", input.linkedin);
  add("address", input.address);
  add(
    "education",
    (input.education ?? []).filter((e) => e.degree || e.school || e.year || e.cgpa)
  );
  add(
    "experience",
    (input.experience ?? []).filter((e) => e.title || e.company || e.dates || e.description)
  );
  add("skills", input.skills);
  add("certifications", input.certifications);
  add("stylePreference", input.stylePreference);

  // Presentation
  add("purpose", input.purpose);
  add("audience", input.audience);
  add("slideCount", input.slideCount);
  add("contentSource", input.contentSource);
  add("colorScheme", input.colorScheme);
  add("designStyle", input.designStyle);

  // Editing
  add("editingType", input.editingType);
  add("pageCount", input.pageCount);

  // Some templates carry no free-text topic — give the project a readable one.
  const projectTitle =
    input.projectTitle?.trim() ||
    (input.template === "career_cv"
      ? `CV / Resume — ${input.fullName.trim()}`
      : input.template === "editing"
        ? `Editing — ${input.fullName.trim()}`
        : input.fullName.trim());

  const dedicationDetails =
    input.dedicationType || input.dedicationDetails
      ? { type: input.dedicationType || null, details: input.dedicationDetails || null }
      : Prisma.JsonNull;
  const acknowledgmentDetails = input.acknowledgmentDetails
    ? { details: input.acknowledgmentDetails }
    : Prisma.JsonNull;

  const newClientId = await nextId("CLIENT");
  const newProjectId = await nextId("PROJECT");

  const created = await db.$transaction(
    async (tx) => {
      const client = await tx.client.create({
        data: {
          clientId: newClientId,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          email: input.email || null,
          universityId: input.universityId as string,
          faculty: input.faculty || "",
          department: (input.department || "General").trim(),
          level: (input.level || "").trim(),
          referredById: ambassadorId,
          referralCodeUsed,
          status: "Active",
        },
        select: { id: true },
      });

      const project = await tx.project.create({
        data: {
          projectId: newProjectId,
          clientId: client.id,
          serviceId: service.id,
          status: "NEW",
          isExpressDelivery: input.isExpressDelivery,
          projectTitle,
          matricNumber: input.matricNumber || null,
          supervisorName: input.supervisorName || null,
          hodName: input.hodName || null,
          projectType: input.projectType ? input.projectType : "NOT_APPLICABLE",
          chapterCount: input.chapterCount ?? null,
          referencingStyle: input.referencingStyle ? input.referencingStyle : null,
          dataRequirements: input.dataRequirements ? input.dataRequirements : null,
          minimumPages: input.minimumPages || null,
          departmentOutline: input.departmentOutline || null,
          specialInstructions: input.specialInstructions || null,
          dedicationType: input.dedicationType || null,
          dedicationDetails,
          acknowledgmentDetails,
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
          ambassadorAllocatedAt: ambassadorId ? now : null,
          parentAmbassadorId: parentInfo?.id ?? null,
          parentCommRate: parentInfo?.rate ?? null,
          parentCommission,
          workerPayoutRate: 40,
          workerPayout: split.workerPayout,
          educraftRevenue: split.educraftRevenue - (parentCommission ?? 0),
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

      await tx.projectStatusLog.create({
        data: {
          projectId: project.id,
          fromStatus: "NEW",
          toStatus: "NEW",
          notes: "Submitted through the online intake form",
        },
      });

      return project;
    },
    { timeout: 15_000 }
  );

  await notifyAdmins({
    title: "New project submitted",
    message: `${created.projectId}: ${input.fullName.trim()} submitted ${input.projectTitle?.trim() || "a project"} through the intake form.`,
    type: "info",
    link: `/admin/projects/${created.projectId}`,
  });

  if (ambassadorUserId) {
    await notifyUsers([ambassadorUserId], {
      title: "Your referral code was used",
      message: `A new client signed up with your code on ${created.projectId}.`,
      type: "info",
      link: "/ambassador/referrals",
    });
  }

  // No commission email here: anyone can submit this public form with a
  // referral code. The ambassador is emailed once the downpayment is verified
  // (see verifyPayment → emailPendingCommission).
  return { projectId: created.projectId };
}
