import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { provedLoginForEmail } from "@/lib/services/account-links";
import { nextId } from "@/lib/services/projects";
import type { SubmittedContact } from "@/lib/submitted-contact";
import { recordUpdate } from "@/lib/services/client-updates";
import { notifyAdmins, notifyUsers } from "@/lib/services/notifications";
import { getCommissionRates } from "@/lib/services/settings";
import {
  resolveParentCommission,
  upsertCommissionExpense,
  upsertParentCommissionExpense,
} from "@/lib/services/ambassador-commission";
import { commissionFor } from "@/lib/commission";
import { computePrice, computeSplit } from "@/lib/pricing";
import { chapterListLabel, intakeBasePrice, isChapterService, normalizeChapters } from "@/lib/chapter-pricing";
import { resolveTemplate } from "@/lib/intake-templates";
import { proBonoFinancials } from "@/lib/pro-bono";
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
  /** The client's display ID (ECC-0001), the same one for all their orders. */
  clientId: string;
}

export class IntakeError extends Error {}

/**
 * Public intake submission → new Client + new Project at NEW.
 *
 * Always creates a fresh client (no dedupe — an admin merges duplicates
 * later). Links a referring ambassador when the code resolves. Ids are
 * generated before the transaction, which carries an explicit timeout.
 */
export interface SubmitIntakeOptions {
  /** A pro bono submission: no price, no payment, no referral, opens at DOWNPAYMENT_VERIFIED. */
  proBono?: { inviteId: string; reason: string | null };
}

export async function submitIntake(
  input: IntakeSubmitInput,
  options: SubmitIntakeOptions = {}
): Promise<IntakeResult> {
  const proBono = options.proBono ?? null;
  const service = await db.service.findFirst({
    where: { serviceCode: input.serviceCode, isActive: true },
    select: {
      id: true,
      basePrice: true,
      estimatedDays: true,
      intakeFormTemplate: true,
      expressDeliverySurcharge: true,
      downpaymentPercentage: true,
      variants: { where: { isActive: true }, select: { id: true, priceAddon: true } },
    },
  });
  if (!service) throw new IntakeError("That service is no longer available");

  // The chosen package adds its own amount; blank means the base option. An id
  // that is not one of this service's active options is refused rather than
  // silently priced at the base.
  let serviceVariantId: string | null = null;
  let variantAddon = 0;
  if (input.serviceVariantId) {
    const variant = service.variants.find((v) => v.id === input.serviceVariantId);
    if (!variant) throw new IntakeError("That option is no longer available");
    serviceVariantId = variant.id;
    variantAddon = variant.priceAddon;
  }

  const template = resolveTemplate(service.intakeFormTemplate);
  if (!template || template !== input.template) {
    throw new IntakeError("This form does not match the selected service");
  }

  const chapters = normalizeChapters(input.chapters);
  if (isChapterService(input.serviceCode) && chapters.length === 0) {
    throw new IntakeError("Choose at least one chapter");
  }
  const price = computePrice({
    basePrice: intakeBasePrice({ serviceCode: input.serviceCode, basePrice: service.basePrice, variantAddon, chapters }),
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
  // A free job earns no ambassador commission, whatever code was typed.
  const code = proBono ? "" : input.referralCode?.trim();
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
  const parentInfo = ambassadorId && !proBono ? await resolveParentCommission(ambassadorId) : null;
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
  if (isChapterService(input.serviceCode)) add("chapters", chapters);

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

  // One client ID per person (Sept 2026): a returning client's order joins their
  // existing record, matched by email. The public form never overwrites what is
  // on record; what was typed this time goes on the project instead
  // (see src/lib/submitted-contact.ts).
  const typedEmail = input.email?.trim() || "";
  const returningClient = typedEmail
    ? await db.client.findFirst({
        where: { email: { equals: typedEmail, mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, clientId: true, referredById: true },
      })
    : null;
  if (returningClient) {
    const typed: SubmittedContact = {
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: typedEmail,
      universityId: input.universityId as string,
      faculty: input.faculty || "",
      department: (input.department || "General").trim(),
      level: (input.level || "").trim(),
    };
    additionalData.submittedContact = typed;
  }

  const newClientId = returningClient ? null : await nextId("CLIENT");
  // A person who already has a proved EduCraft login (worker, ambassador or an
  // earlier client login) sees this order in the same dashboard straight away.
  const ownerLoginId = returningClient ? null : await provedLoginForEmail(typedEmail);
  const newProjectId = await nextId("PROJECT");

  const created = await db.$transaction(
    async (tx) => {
      const client =
        returningClient ??
        (await tx.client.create({
            data: {
              clientId: newClientId as string,
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
              userId: ownerLoginId,
            },
            select: { id: true, clientId: true, referredById: true },
          }));
      // The first ambassador credited for a returning client becomes their referrer.
      if (returningClient && ambassadorId && !returningClient.referredById) {
        await tx.client.update({ where: { id: returningClient.id }, data: { referredById: ambassadorId, referralCodeUsed } });
      }

      const project = await tx.project.create({
        data: {
          projectId: newProjectId,
          clientId: client.id,
          serviceId: service.id,
          serviceVariantId,
          status: proBono ? "DOWNPAYMENT_VERIFIED" : "NEW",
          isExpressDelivery: proBono ? false : input.isExpressDelivery,
          projectTitle,
          matricNumber: input.matricNumber || null,
          supervisorName: input.supervisorName || null,
          hodName: input.hodName || null,
          projectType: input.projectType ? input.projectType : "NOT_APPLICABLE",
          chapterCount: isChapterService(input.serviceCode) ? chapters.length : (input.chapterCount ?? null),
          referencingStyle: input.referencingStyle ? input.referencingStyle : null,
          dataRequirements: input.dataRequirements ? input.dataRequirements : null,
          minimumPages: input.minimumPages || null,
          departmentOutline: input.departmentOutline || null,
          specialInstructions: isChapterService(input.serviceCode)
            ? [`Chapter-based order: Chapter ${chapterListLabel(chapters)} only, not the full report.`, input.specialInstructions]
                .filter(Boolean)
                .join("\n\n")
            : input.specialInstructions || null,
          dedicationType: input.dedicationType || null,
          dedicationDetails,
          acknowledgmentDetails,
          additionalData:
            Object.keys(additionalData).length > 0
              ? (additionalData as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          clientDeadline,
          internalDeadline,
          expectedDeliveryAt: clientDeadline ?? internalDeadline,
          ...(proBono
            ? {
                ...proBonoFinancials(),
                proBonoReason: proBono.reason,
                proBonoInviteId: proBono.inviteId,
              }
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

      const attachments = input.attachments ?? [];
      if (attachments.length > 0) {
        await tx.projectFile.createMany({
          data: attachments.map((f) => ({
            projectId: project.id,
            fileName: f.name,
            fileUrl: f.url,
            fileSize: f.size ?? null,
            fileType: f.type ?? null,
            category: f.category,
            uploadedBy: "client (intake form)",
          })),
        });
      }

      await tx.projectStatusLog.create({
        data: {
          projectId: project.id,
          fromStatus: "NEW",
          toStatus: proBono ? "DOWNPAYMENT_VERIFIED" : "NEW",
          notes: proBono
            ? "Submitted through a pro bono link. No payment required"
            : "Submitted through the online intake form",
        },
      });
      await recordUpdate(tx, {
        projectId: project.id,
        kind: "STATUS",
        title: "Order received",
        body: proBono ? "Your project is confirmed. No payment needed." : "We have your order.",
        dedupeKey: `created:${project.id}`,
      });

      return { ...project, clientCode: client.clientId };
    },
    { timeout: 15_000 }
  );

  await notifyAdmins({
    title: proBono ? "New pro bono project submitted" : "New project submitted",
    message: `${created.projectId}: ${input.fullName.trim()} submitted ${input.projectTitle?.trim() || "a project"} through ${proBono ? "a pro bono link" : "the intake form"}.`,
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
  return { projectId: created.projectId, clientId: created.clientCode };
}
