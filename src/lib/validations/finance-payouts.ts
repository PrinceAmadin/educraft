import { z } from "zod";
import { monthKeySchema } from "@/lib/validations/finance-buckets";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

export const PAYOUT_RECIPIENT_TYPES = ["WORKER", "AMBASSADOR", "EXECUTIVE"] as const;
export const EXEC_RECIPIENTS = ["HOG", "COO"] as const;

export const payoutsQuerySchema = z.object({
  month: monthKeySchema.optional().or(z.literal("")),
});

export const calculatePayoutsSchema = z.object({
  month: monthKeySchema.optional().or(z.literal("")),
});

/** `PATCH /payouts/[id]/mark-paid` — a single record or bonus. */
export const markPaidBodySchema = z.object({
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  date: isoDate,
});

/** `POST /payouts/mark-all-paid` — every unpaid record of a type for the month, or one recipient's. */
export const markAllPaidSchema = z.object({
  month: monthKeySchema,
  recipientType: z.enum(PAYOUT_RECIPIENT_TYPES),
  recipientId: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  date: isoDate,
});

export const bonusSchema = z.object({
  month: monthKeySchema,
  recipientId: z.enum(EXEC_RECIPIENTS),
  amount: z.coerce.number({ invalid_type_error: "Enter an amount" }).int("Whole naira only").positive("Enter an amount above 0").max(100_000_000),
  reason: z.string().trim().min(3, "Say what the bonus is for").max(200),
});

export const cooSubmitSchema = z.object({
  month: monthKeySchema,
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
