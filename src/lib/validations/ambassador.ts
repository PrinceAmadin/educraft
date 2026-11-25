import { z } from "zod";

/**
 * An ambassador correcting their own name. Only the length is checked here, so a
 * bad name reaches `checkName` and comes back with the one sentence that says
 * why — the schema must never be the thing that explains a refusal.
 */
export const ambassadorNameSchema = z.object({
  fullName: z.string().min(1).max(200),
});

export const ambassadorBankSchema = z.object({
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
});

/**
 * Referral list filter. "paying" = they paid a downpayment on an order,
 * "waiting" = they signed up with the code but have not paid yet. The old
 * converted/pending values fall through to "all" via `.catch`.
 */
export type ReferralFilter = "all" | "paying" | "waiting";

export const referralFilterSchema = z.object({
  filter: z.enum(["all", "paying", "waiting"]).optional().catch(undefined),
});

/**
 * How far the ambassador has watched the tutorial video. Both figures come
 * from the browser's own `<video>` element; the service clamps the position to
 * the duration and refuses an absurd length, so a wrong number proves nothing.
 */
export const tourProgressSchema = z.object({
  secondsWatched: z.coerce.number().finite().min(0).max(4 * 60 * 60),
  durationSeconds: z.coerce.number().finite().positive().max(4 * 60 * 60),
});
