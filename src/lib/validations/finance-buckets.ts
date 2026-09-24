import { z } from "zod";

/** "2026-09" */
export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export const BUCKET_TYPE_VALUES = ["OPERATIONS_RESERVE", "GROWTH_FUND", "REINVESTMENT_FUND", "FOUNDER_DISTRIBUTION"] as const;

/** `GET /api/admin/finance/buckets` and the page's search params. */
export const bucketsQuerySchema = z.object({
  month: monthKeySchema.optional().or(z.literal("")),
  bucket: z.enum(BUCKET_TYPE_VALUES).optional().or(z.literal("")),
  page: z.coerce.number().int().min(1).optional(),
});
export type BucketsQuery = z.infer<typeof bucketsQuerySchema>;

/** The CFO's manual correction: a signed whole-naira amount and a reason. */
export const manualAdjustmentSchema = z.object({
  bucket: z.enum(BUCKET_TYPE_VALUES),
  amount: z.coerce
    .number({ invalid_type_error: "Enter an amount" })
    .int("Whole naira only")
    .refine((n) => n !== 0, "Enter an amount other than 0")
    .refine((n) => Math.abs(n) <= 100_000_000, "That amount is too large"),
  reason: z.string().trim().min(3, "Say why").max(500),
});

export const recommendBonusSchema = z.object({
  /** Any month in the semester; defaults to the current month. */
  month: monthKeySchema.optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
