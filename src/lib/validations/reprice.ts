import { z } from "zod";

/**
 * Changing an already-paid project's service / option / price. Everything is
 * optional except the reason: an empty body (reason only) re-prices at the
 * current service and option, which is how a manual override on its own is
 * applied. `serviceVariantId: null` explicitly drops the option.
 */
export const repriceSchema = z.object({
  serviceId: z.string().min(1).optional(),
  serviceVariantId: z.string().min(1).nullable().optional(),
  chapters: z.array(z.number().int().min(1).max(5)).max(5).optional(),
  priceOverride: z.number().int().nonnegative().max(100_000_000).optional(),
  reason: z.string().trim().min(3, "Say why the service or price is changing").max(300),
});

export type RepriceInput = z.infer<typeof repriceSchema>;
