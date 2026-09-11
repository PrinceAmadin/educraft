import { Prisma, type ServiceCategory, type PricingModel } from "@prisma/client";
import { db } from "@/lib/db";
import type { CreateServiceInput, UpdateServiceInput } from "@/lib/validations/settings";

export class ServiceCatalogError extends Error {}

export interface ServiceRow {
  id: string;
  serviceCode: string;
  serviceName: string;
  category: ServiceCategory;
  basePrice: number;
  pricingModel: PricingModel;
  intakeFormTemplate: string;
  estimatedDays: number;
  requiresDownpayment: boolean;
  downpaymentPercentage: number;
  isActive: boolean;
  description: string | null;
  deliverables: string | null;
  expressDeliverySurcharge: number | null;
  sortOrder: number;
  variantCount: number;
  projectCount: number;
}

export async function listServices(): Promise<ServiceRow[]> {
  const rows = await db.service.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { serviceName: "asc" }],
    include: { _count: { select: { variants: true, projects: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    serviceCode: r.serviceCode,
    serviceName: r.serviceName,
    category: r.category,
    basePrice: r.basePrice,
    pricingModel: r.pricingModel,
    intakeFormTemplate: r.intakeFormTemplate,
    estimatedDays: r.estimatedDays,
    requiresDownpayment: r.requiresDownpayment,
    downpaymentPercentage: r.downpaymentPercentage,
    isActive: r.isActive,
    description: r.description,
    deliverables: r.deliverables,
    expressDeliverySurcharge: r.expressDeliverySurcharge,
    sortOrder: r.sortOrder,
    variantCount: r._count.variants,
    projectCount: r._count.projects,
  }));
}

export async function createService(input: CreateServiceInput): Promise<{ id: string }> {
  try {
    return await db.service.create({
      data: {
        serviceCode: input.serviceCode,
        serviceName: input.serviceName,
        category: input.category,
        basePrice: input.basePrice,
        pricingModel: input.pricingModel,
        intakeFormTemplate: input.intakeFormTemplate,
        estimatedDays: input.estimatedDays,
        requiresDownpayment: input.requiresDownpayment,
        downpaymentPercentage: input.downpaymentPercentage,
        description: input.description || null,
        deliverables: input.deliverables || null,
        expressDeliverySurcharge: input.expressDeliverySurcharge ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceCatalogError("That service code is already in use");
    }
    throw err;
  }
}

export async function updateService(id: string, input: UpdateServiceInput): Promise<void> {
  const data: Prisma.ServiceUpdateInput = {};
  if (input.serviceName !== undefined) data.serviceName = input.serviceName;
  if (input.category !== undefined) data.category = input.category;
  if (input.basePrice !== undefined) data.basePrice = input.basePrice;
  if (input.pricingModel !== undefined) data.pricingModel = input.pricingModel;
  if (input.intakeFormTemplate !== undefined) data.intakeFormTemplate = input.intakeFormTemplate;
  if (input.estimatedDays !== undefined) data.estimatedDays = input.estimatedDays;
  if (input.requiresDownpayment !== undefined) data.requiresDownpayment = input.requiresDownpayment;
  if (input.downpaymentPercentage !== undefined)
    data.downpaymentPercentage = input.downpaymentPercentage;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.deliverables !== undefined) data.deliverables = input.deliverables || null;
  if (input.expressDeliverySurcharge !== undefined)
    data.expressDeliverySurcharge = input.expressDeliverySurcharge ?? null;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (Object.keys(data).length === 0) return;

  try {
    await db.service.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new ServiceCatalogError("Service not found");
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceCatalogError("That service code is already in use");
    }
    throw err;
  }
}
