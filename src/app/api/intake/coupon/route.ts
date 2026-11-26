import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { intakeBasePrice, normalizeChapters } from "@/lib/chapter-pricing";
import { computePrice } from "@/lib/pricing";
import { CouponError, prospectiveLegs, resolveCouponForOrder } from "@/lib/services/finance/coupons";

const schema = z
  .object({
    code: z.string().trim().min(1).max(32),
    serviceCode: z.string().trim().min(1).max(32),
    serviceVariantId: z.string().trim().min(1).nullish(),
    chapters: z.array(z.coerce.number().int().min(1).max(5)).max(5).optional(),
    isExpressDelivery: z.boolean().optional(),
    referralCode: z.string().trim().max(40).nullish(),
    email: z.string().trim().max(200).nullish(),
  })
  .strict();

/**
 * Prices a coupon for the public intake form, so the client sees what they will
 * actually be charged before they are sent to Paystack.
 *
 * The price is ALWAYS computed here from the service's own figures — nothing a
 * browser sends is trusted — and this answer is only a quote: the charge and the
 * project are priced again on the server when the order is placed.
 *
 * Unauthenticated, so it is rate-limited per address: a coupon code is a short
 * string and this must not become a way to hunt for live ones.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!(await checkRateLimit(`ip:${ip}`, "intake-coupon", 20, 10 * 60 * 1000))) {
    return NextResponse.json({ ok: false, reason: "Too many tries. Wait a few minutes." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Expected a JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "We couldn't read that" }, { status: 400 });
  const input = parsed.data;

  const service = await db.service.findFirst({
    where: { serviceCode: input.serviceCode, isActive: true },
    select: {
      serviceName: true,
      basePrice: true,
      expressDeliverySurcharge: true,
      downpaymentPercentage: true,
      variants: { where: { isActive: true }, select: { id: true, priceAddon: true } },
    },
  });
  if (!service) return NextResponse.json({ ok: false, reason: "That service is no longer available" }, { status: 400 });

  const variantAddon = input.serviceVariantId
    ? (service.variants.find((v) => v.id === input.serviceVariantId)?.priceAddon ?? 0)
    : 0;
  const listPrice = computePrice({
    basePrice: intakeBasePrice({
      serviceCode: input.serviceCode,
      basePrice: service.basePrice,
      variantAddon,
      chapters: normalizeChapters(input.chapters),
    }),
    expressSurcharge: service.expressDeliverySurcharge ?? 0,
    isExpressDelivery: input.isExpressDelivery,
    downpaymentPercentage: service.downpaymentPercentage,
  }).total;

  const typedEmail = input.email?.trim() || "";
  const returning = typedEmail
    ? await db.client.findFirst({
        where: { email: { equals: typedEmail, mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    : null;

  try {
    const resolved = await resolveCouponForOrder({
      code: input.code,
      serviceCode: input.serviceCode,
      serviceLabel: service.serviceName,
      legs: await prospectiveLegs({ listPrice, referralCode: input.referralCode ?? null }),
      clientId: returning?.id ?? null,
      audience: "client",
    });
    const billed = computePrice({
      basePrice: intakeBasePrice({
        serviceCode: input.serviceCode,
        basePrice: service.basePrice,
        variantAddon,
        chapters: normalizeChapters(input.chapters),
      }),
      expressSurcharge: service.expressDeliverySurcharge ?? 0,
      isExpressDelivery: input.isExpressDelivery,
      downpaymentPercentage: service.downpaymentPercentage,
      discountAmount: resolved.discountAmount,
    });
    return NextResponse.json({
      ok: true,
      code: resolved.code,
      message: resolved.message,
      discountAmount: billed.discountAmount,
      total: billed.total,
      payable: billed.payable,
      downpaymentAmount: billed.downpaymentAmount,
      balanceAmount: billed.balanceAmount,
    });
  } catch (error) {
    if (error instanceof CouponError) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 200 });
    }
    throw error;
  }
}
