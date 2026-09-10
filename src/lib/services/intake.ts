import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextId } from "@/lib/services/projects";
import { computePrice, computeSplit } from "@/lib/pricing";
import { TIER_COMMISSION_RATE } from "@/lib/constants";
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
  });

  // Referral link
  let ambassadorId: string | null = null;
  let ambassadorCommRate: number | null = null;
  let referralCodeUsed: string | null = null;
  const code = input.referralCode?.trim();
  if (code) {
    const ambassador = await db.ambassador.findUnique({
      where: { referralCode: code },
      select: { id: true, tier: true, status: true },
    });
    if (ambassador && ambassador.status !== "Suspended" && ambassador.status !== "Terminated") {
      ambassadorId = ambassador.id;
      ambassadorCommRate = TIER_COMMISSION_RATE[ambassador.tier] ?? 10;
      referralCodeUsed = code;
    }
  }

  const split = computeSplit(price.total, ambassadorCommRate);

  const now = new Date();
  const clientDeadline = input.clientDeadline ? new Date(input.clientDeadline) : null;
  const internalDeadline =
    clientDeadline ?? new Date(now.getTime() + service.estimatedDays * 86_400_000);

  // Service-specific payload that has no dedicated column.
  const additionalData: Record<string, unknown> = {};
  if (input.courseTitle) additionalData.courseTitle = input.courseTitle;
  if (input.courseCode) additionalData.courseCode = input.courseCode;
  if (input.wordCount) additionalData.wordCount = input.wordCount;
  if (input.lecturerInstructions) additionalData.lecturerInstructions = input.lecturerInstructions;
  if (input.proposalNotes) additionalData.proposalNotes = input.proposalNotes;

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
          universityId: input.universityId,
          faculty: input.faculty || "",
          department: input.department.trim(),
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
          projectTitle: input.projectTitle.trim(),
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
          notes: "Submitted through the online intake form",
        },
      });

      return project;
    },
    { timeout: 15_000 }
  );

  return { projectId: created.projectId };
}
