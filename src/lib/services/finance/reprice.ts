import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { computePrice } from "@/lib/pricing";
import { intakeBasePrice, isChapterService, normalizeChapters } from "@/lib/chapter-pricing";
import { reconcileClientLegs, reconcileSnapshots, type Recovery } from "@/lib/finance/reprice-rules";
import { upsertCommissionExpense, upsertParentCommissionExpense } from "@/lib/services/ambassador-commission";
import { monthKeyOf, projectNetInflow, syncProjectBuckets } from "@/lib/services/finance/buckets";
import { reconcileProjectPayouts } from "@/lib/services/finance/payouts-engine";
import { lockProjectRow } from "@/lib/generation/generation-state";
import { recordUpdate } from "@/lib/services/client-updates";
import { notifyClient } from "@/lib/services/client-notify";
import { notifyFinance, notifyUsers } from "@/lib/services/notifications";
import { formatNaira } from "@/lib/utils";
import type { RepriceInput } from "@/lib/validations/reprice";

/**
 * Changing an already-paid project's service / option / price.
 *
 * The price is recomputed through the same pricing primitives the intake uses,
 * so the shown price is the charged price. The money already in is re-applied
 * against the new price (reprice-rules.ts): an overpaid downpayment overflows
 * into the balance; if the new price is below what was paid, the excess is
 * surfaced to finance as a refund due. Every downstream leg (worker, ambassador,
 * parent, buckets, payout records) is re-trued in one transaction under the
 * project's stamped cashflow version. Super admin only — it is a pricing
 * decision, like pro bono.
 */

export class RepriceError extends Error {}

const CLOSED = ["CANCELLED", "REFUNDED"] as const;

// ── Services for the reprice dialog ──────────────────────────────────────────

export interface RepriceVariantOption {
  id: string;
  name: string;
  priceAddon: number;
}

export interface RepriceServiceOption {
  id: string;
  serviceCode: string;
  serviceName: string;
  basePrice: number;
  downpaymentPercentage: number;
  expressDeliverySurcharge: number | null;
  isChapterService: boolean;
  variants: RepriceVariantOption[];
}

export async function listRepriceServices(): Promise<RepriceServiceOption[]> {
  const rows = await db.service.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { serviceName: "asc" }],
    select: {
      id: true,
      serviceCode: true,
      serviceName: true,
      basePrice: true,
      downpaymentPercentage: true,
      expressDeliverySurcharge: true,
      variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, priceAddon: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    serviceCode: r.serviceCode,
    serviceName: r.serviceName,
    basePrice: r.basePrice,
    downpaymentPercentage: r.downpaymentPercentage,
    expressDeliverySurcharge: r.expressDeliverySurcharge,
    isChapterService: isChapterService(r.serviceCode),
    variants: r.variants,
  }));
}

// ── The operation ────────────────────────────────────────────────────────────

export interface RepriceResult {
  projectCode: string;
  oldPrice: number;
  newPrice: number;
  balanceAmount: number;
  remaining: number;
  overpayment: number;
  balanceReopened: boolean;
  recoveries: Recovery[];
  warnings: string[];
}

const PROJECT_SELECT = {
  id: true,
  projectId: true,
  status: true,
  isProBono: true,
  isExpressDelivery: true,
  price: true,
  downpaymentAmount: true,
  downpaymentStatus: true,
  balanceStatus: true,
  serviceId: true,
  serviceVariantId: true,
  additionalData: true,
  chapterCount: true,
  workerPayout: true,
  workerPayoutRate: true,
  workerPayoutPaid: true,
  ambassadorId: true,
  ambassadorCommRate: true,
  ambassadorCommission: true,
  ambassadorCommPaid: true,
  parentAmbassadorId: true,
  parentCommRate: true,
  parentCommission: true,
  parentCommPaid: true,
  service: { select: { id: true, serviceCode: true } },
  worker: { select: { userId: true } },
  _count: { select: { pauses: { where: { status: { in: ["OPEN", "SUBMITTED"] } } } } },
  generationCheckpoints: { select: { id: true }, take: 1 },
} satisfies Prisma.ProjectSelect;

export async function repriceProject(idOrCode: string, input: RepriceInput, actorId: string): Promise<RepriceResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new RepriceError("A reason is required.");

  const project = await db.project.findFirst({
    where: { OR: [{ id: idOrCode }, { projectId: idOrCode }] },
    select: PROJECT_SELECT,
  });
  if (!project) throw new RepriceError("Project not found");
  if (project.isProBono) throw new RepriceError("This is a pro bono project — it has no price. Use the pro bono controls to change it.");
  if ((CLOSED as readonly string[]).includes(project.status)) throw new RepriceError("A cancelled or refunded project can't be repriced.");
  if (project.downpaymentStatus === "Paid" || project.balanceStatus === "Paid") {
    throw new RepriceError("A payment here is marked paid but not yet verified. Verify or reject it first, then reprice.");
  }

  const targetServiceId = input.serviceId ?? project.serviceId;
  const serviceChanged = targetServiceId !== project.serviceId;
  if (serviceChanged && project.generationCheckpoints.length > 0) {
    throw new RepriceError("Chapters have already been generated, so the service can't be swapped. You can still change the option or set a price.");
  }

  const service = await db.service.findUnique({
    where: { id: targetServiceId },
    select: { id: true, serviceCode: true, serviceName: true, basePrice: true, downpaymentPercentage: true, expressDeliverySurcharge: true },
  });
  if (!service) throw new RepriceError("Service not found");

  // Resolve the option: undefined keeps the current one (when the service is unchanged);
  // null drops it; an id is validated against the target service.
  let variantId: string | null = null;
  let variantAddon = 0;
  let variantName: string | null = null;
  if (input.serviceVariantId === undefined) {
    if (!serviceChanged && project.serviceVariantId) {
      const v = await db.serviceVariant.findUnique({ where: { id: project.serviceVariantId }, select: { id: true, serviceId: true, name: true, priceAddon: true } });
      if (v && v.serviceId === targetServiceId) {
        variantId = v.id;
        variantAddon = v.priceAddon;
        variantName = v.name;
      }
    }
  } else if (input.serviceVariantId !== null) {
    const v = await db.serviceVariant.findUnique({ where: { id: input.serviceVariantId }, select: { id: true, serviceId: true, name: true, priceAddon: true } });
    if (!v || v.serviceId !== targetServiceId) throw new RepriceError("That option doesn't belong to the chosen service.");
    variantId = v.id;
    variantAddon = v.priceAddon;
    variantName = v.name;
  }

  const chapterService = isChapterService(service.serviceCode);
  const existing = (project.additionalData as { chapters?: number[] } | null)?.chapters ?? [];
  const chapters = chapterService ? normalizeChapters(input.chapters ?? existing) : [];
  if (chapterService && chapters.length === 0) throw new RepriceError("Choose at least one chapter for a chapter-based order.");

  const base = intakeBasePrice({ serviceCode: service.serviceCode, basePrice: service.basePrice, variantAddon, chapters });
  const breakdown = computePrice({
    basePrice: base,
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: project.isExpressDelivery,
    downpaymentPercentage: service.downpaymentPercentage,
    override: input.priceOverride ?? null,
  });
  const newPrice = breakdown.total;
  if (newPrice <= 0) throw new RepriceError("The new price must be greater than zero. Use the pro bono controls to give a job away.");

  const snaps = reconcileSnapshots({
    newPrice,
    workerPayoutRate: project.workerPayoutRate,
    workerPayoutPaid: project.workerPayoutPaid,
    currentWorkerPayout: project.workerPayout,
    ambassadorId: project.ambassadorId,
    ambassadorCommRate: project.ambassadorCommRate,
    ambassadorCommPaid: project.ambassadorCommPaid,
    currentAmbassadorCommission: project.ambassadorCommission,
    parentAmbassadorId: project.parentAmbassadorId,
    parentCommRate: project.parentCommRate,
    parentCommPaid: project.parentCommPaid,
    currentParentCommission: project.parentCommission,
  });

  const additionalData = chapterService ? { ...((project.additionalData as object) ?? {}), chapters } : null;
  const now = new Date();

  const outcome = await db.$transaction(
    async (tx) => {
      await lockProjectRow(tx, project.id);
      // Re-check under the lock: a concurrent close or payment must not be raced.
      const fresh = await tx.project.findUnique({ where: { id: project.id }, select: { status: true, downpaymentStatus: true, balanceStatus: true } });
      if (!fresh) throw new RepriceError("Project not found");
      if ((CLOSED as readonly string[]).includes(fresh.status)) throw new RepriceError("A cancelled or refunded project can't be repriced.");
      if (fresh.downpaymentStatus === "Paid" || fresh.balanceStatus === "Paid") throw new RepriceError("A payment here is marked paid but not yet verified. Verify or reject it first.");

      const moneyIn = await projectNetInflow(tx, project.id);
      const legs = reconcileClientLegs({
        newPrice,
        moneyIn,
        downpaymentVerified: fresh.downpaymentStatus === "Verified",
        balanceVerified: fresh.balanceStatus === "Verified",
        downpaymentPercentage: service.downpaymentPercentage,
        currentDownpaymentAmount: project.downpaymentAmount,
      });

      await tx.project.update({
        where: { id: project.id },
        data: {
          serviceId: service.id,
          serviceVariantId: variantId,
          ...(additionalData ? { additionalData: additionalData as Prisma.InputJsonValue } : {}),
          ...(chapterService ? { chapterCount: chapters.length } : {}),
          price: newPrice,
          downpaymentAmount: legs.downpaymentAmount,
          ...(legs.downpaymentStatus ? { downpaymentStatus: legs.downpaymentStatus } : {}),
          balanceAmount: legs.balanceAmount,
          balanceStatus: legs.balanceStatus,
          ...(legs.clearBalanceReference ? { balanceReference: null, balanceDate: null } : {}),
          workerPayout: snaps.workerPayout,
          ambassadorCommission: snaps.ambassadorCommission,
          parentCommission: snaps.parentCommission,
          educraftRevenue: snaps.educraftRevenue,
        },
      });

      // Keep the commission expenses in step for legs not yet paid.
      if (project.ambassadorId && !project.ambassadorCommPaid && snaps.ambassadorCommission != null && project.ambassadorCommRate != null) {
        const amb = await tx.ambassador.findUnique({ where: { id: project.ambassadorId }, select: { fullName: true } });
        await upsertCommissionExpense(tx, { projectDbId: project.id, projectCode: project.projectId, ambassadorName: amb?.fullName ?? "Ambassador", rate: project.ambassadorCommRate, commission: snaps.ambassadorCommission, date: now });
      }
      if (project.parentAmbassadorId && !project.parentCommPaid && snaps.parentCommission != null && project.parentCommRate != null) {
        const [parent, sub] = await Promise.all([
          tx.ambassador.findUnique({ where: { id: project.parentAmbassadorId }, select: { fullName: true } }),
          project.ambassadorId ? tx.ambassador.findUnique({ where: { id: project.ambassadorId }, select: { fullName: true } }) : Promise.resolve(null),
        ]);
        await upsertParentCommissionExpense(tx, { projectDbId: project.id, projectCode: project.projectId, parentName: parent?.fullName ?? "Core", subName: sub?.fullName ?? "sub", rate: project.parentCommRate, commission: snaps.parentCommission, date: now });
      }

      // Re-true the buckets and payout records off the recomputed legs.
      await syncProjectBuckets(tx, project.id, { reason: "REALLOCATION", month: monthKeyOf(now), recordedById: actorId });
      await reconcileProjectPayouts(tx, project.id);

      // Client feed — client-safe wording only, money and balance.
      await recordUpdate(tx, {
        projectId: project.id,
        kind: "PAYMENT",
        title: "Your order was updated",
        body:
          legs.overpayment > 0
            ? `Your order total is now ${formatNaira(newPrice)}. You have paid in full; we will be in touch about the difference.`
            : legs.balanceStatus === "Verified"
              ? `Your order total is now ${formatNaira(newPrice)}, fully paid.`
              : `Your order total is now ${formatNaira(newPrice)}. Balance to pay: ${formatNaira(legs.balanceAmount)}.`,
        createdById: actorId,
      });

      // Internal timeline (no status change — reprice never moves the pipeline).
      await tx.projectStatusLog.create({
        data: {
          projectId: project.id,
          fromStatus: fresh.status,
          toStatus: fresh.status,
          changedById: actorId,
          notes: `Service/price changed: ${project.service.serviceCode} ${formatNaira(project.price)} → ${service.serviceCode}${variantName ? ` + ${variantName}` : ""} ${formatNaira(newPrice)}. ${reason}`,
        },
      });

      await tx.cashflowAuditLog.create({
        data: {
          actorUserId: actorId,
          action: "repriced_project",
          entityType: "Project",
          entityId: project.id,
          beforeJson: { price: project.price, serviceId: project.serviceId, serviceVariantId: project.serviceVariantId } as unknown as Prisma.InputJsonValue,
          afterJson: { price: newPrice, serviceId: service.id, serviceVariantId: variantId, balanceAmount: legs.balanceAmount, overpayment: legs.overpayment } as unknown as Prisma.InputJsonValue,
          reason,
        },
      });

      return { legs, moneyIn };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  const { legs } = outcome;
  const warnings: string[] = [];
  if (project._count.pauses > 0 && variantId !== project.serviceVariantId) {
    warnings.push("A data request is open and the option changed. If the project now does or no longer does data analysis, regenerate the data request.");
  }
  if (legs.balanceReopened) {
    warnings.push("The new price is above what was paid, so the balance has been re-opened. Collect it from the client.");
  }
  for (const r of snaps.recoveries) {
    if (r.delta > 0) warnings.push(`${r.recipient} was already paid ${formatNaira(r.paid)}; at the new price it is ${formatNaira(r.shouldBe)}. Recover ${formatNaira(r.delta)} by hand.`);
    else if (r.delta < 0) warnings.push(`${r.recipient} was already paid ${formatNaira(r.paid)}; at the new price it is ${formatNaira(r.shouldBe)}. They are owed ${formatNaira(-r.delta)} more.`);
  }

  // Notify the client, the assigned specialist, and finance (urgently when a refund is due).
  await notifyClient(project.id, {
    title: "Your order was updated",
    message:
      legs.balanceStatus === "Verified"
        ? `${project.projectId} is now ${formatNaira(newPrice)}.`
        : `${project.projectId} is now ${formatNaira(newPrice)}. Balance to pay: ${formatNaira(legs.balanceAmount)}.`,
    type: "info",
    tab: "payments",
  }).catch(() => undefined);

  if (project.worker?.userId) {
    await notifyUsers([project.worker.userId], {
      title: "Order updated",
      message: `${project.projectId} was updated to ${formatNaira(newPrice)}.`,
      type: "info",
      link: `/worker/projects/${project.projectId}`,
    }).catch(() => undefined);
  }

  await notifyFinance({
    title: legs.overpayment > 0 ? "Reprice — refund due" : "Project repriced",
    message:
      legs.overpayment > 0
        ? `${project.projectId}: repriced to ${formatNaira(newPrice)}; ${formatNaira(legs.overpayment)} overpaid — a refund is due.`
        : `${project.projectId}: repriced to ${formatNaira(newPrice)}, balance ${formatNaira(legs.balanceAmount)}.`,
    type: legs.overpayment > 0 ? "warning" : "info",
    link: legs.overpayment > 0 ? `/admin/projects/${project.projectId}?tab=financials` : "/admin/finance/revenue",
  }).catch(() => undefined);

  return {
    projectCode: project.projectId,
    oldPrice: project.price,
    newPrice,
    balanceAmount: legs.balanceAmount,
    remaining: legs.remaining,
    overpayment: legs.overpayment,
    balanceReopened: legs.balanceReopened,
    recoveries: snaps.recoveries,
    warnings,
  };
}
