import { z } from "zod";

const nullableInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).nullish();

export const createCouponSchema = z
  .object({
    code: z.string().trim().min(3).max(32),
    label: z.string().trim().max(120).nullish(),
    percentOff: nullableInt(1, 100),
    amountOffNgn: z.coerce.number().int().min(1).max(100_000_000).nullish(),
    friendPercentOff: nullableInt(1, 100),
    ownerClientId: z.string().trim().min(1).nullish(),
    serviceCodes: z.array(z.string().trim().min(1).max(32)).max(60).optional(),
    minOrderNgn: z.coerce.number().int().min(0).max(100_000_000).nullish(),
    expiresAt: z.coerce.date().nullish(),
    maxRedemptions: nullableInt(1, 100_000),
    expectedReferrals: nullableInt(1, 500),
    tagsReferrals: z.boolean().optional(),
    note: z.string().trim().max(500).nullish(),
    overrideCap: z.boolean().optional(),
    overrideReason: z.string().trim().max(300).nullish(),
  })
  .strict();

export const decideCouponSchema = z
  .object({
    action: z.enum(["approve", "reject", "revoke"]),
    note: z.string().trim().max(300).nullish(),
  })
  .strict();

export const couponApprovalSchema = z.object({ cooNeedsApproval: z.boolean() }).strict();

export const previewCouponSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    serviceCode: z.string().trim().min(1).max(32),
    listPrice: z.coerce.number().int().min(1).max(100_000_000),
    referralCode: z.string().trim().max(40).nullish(),
    clientId: z.string().trim().min(1).nullish(),
  })
  .strict();
