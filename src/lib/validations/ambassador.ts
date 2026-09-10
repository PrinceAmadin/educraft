import { z } from "zod";

export const ambassadorBankSchema = z.object({
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
});

export const referralFilterSchema = z.object({
  filter: z.enum(["all", "converted", "pending"]).optional().catch(undefined),
});
