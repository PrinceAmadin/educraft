import { z } from "zod";

export const paystackInitializeBodySchema = z.object({
  projectId: z.string().trim().min(1).max(40),
  leg: z.enum(["downpayment", "balance"]),
});

export const paystackResyncBodySchema = z.object({
  reference: z.string().trim().min(1).max(160),
});
