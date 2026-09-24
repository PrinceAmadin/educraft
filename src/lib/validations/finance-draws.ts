import { z } from "zod";
import { monthKeySchema } from "@/lib/validations/finance-buckets";

export const FOUNDER_RECIPIENTS = ["CEO", "CFO"] as const;

export const drawsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: monthKeySchema.optional().or(z.literal("")),
});

/** `POST /founder-draws/distribute` — the month's draws, both founders unless named; a stated partial amount is the founder's call. */
export const distributeSchema = z.object({
  month: monthKeySchema,
  recipients: z.array(z.enum(FOUNDER_RECIPIENTS)).min(1).max(2).optional(),
  amountEach: z.coerce.number().int().positive().max(100_000_000).optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

/** `POST /founder-draws/semester-bonus` — the founder approves (distributes) or declines the CFO's recommendation. */
export const semesterDecisionSchema = z.object({
  month: monthKeySchema.optional().or(z.literal("")),
  decision: z.enum(["approve", "decline"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

/** `POST /founder-draws/annual` — recommend (CFO), approve or decline (founder) the year's profit share. */
export const annualActionSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  action: z.enum(["recommend", "approve", "decline"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
