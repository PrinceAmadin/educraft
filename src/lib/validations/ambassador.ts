import { z } from "zod";

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
