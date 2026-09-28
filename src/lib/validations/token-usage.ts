import { z } from "zod";

/** POST /api/admin/token-usage/set-alert body: a positive whole-naira threshold, or null to clear. */
export const setAlertSchema = z.object({
  thresholdNaira: z.union([z.number().int().positive(), z.null()]),
});
export type SetAlertBody = z.infer<typeof setAlertSchema>;
