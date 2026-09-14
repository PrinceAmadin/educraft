import { z } from "zod";
import { MAX_COMMISSION_RATE, MIN_COMMISSION_RATE } from "@/lib/commission";

/** 10, 12, 15 — or any rate the admin sets, to two decimal places. */
export const commissionRateSchema = z.coerce
  .number({ invalid_type_error: "Enter a commission rate" })
  .min(MIN_COMMISSION_RATE, `Commission must be at least ${MIN_COMMISSION_RATE}%`)
  .max(MAX_COMMISSION_RATE, `Commission can't be more than ${MAX_COMMISSION_RATE}%`)
  .refine((n) => Math.round(n * 100) === n * 100, "Use at most two decimal places");

export const allocateAmbassadorSchema = z.object({
  ambassadorId: z.string().min(1, "Pick an ambassador"),
  /** Omitted = the ambassador's tier rate. */
  rate: commissionRateSchema.optional(),
  /** Email the ambassador about the commission now. */
  notify: z.boolean().default(true),
});

export type AllocateAmbassadorInput = z.infer<typeof allocateAmbassadorSchema>;
