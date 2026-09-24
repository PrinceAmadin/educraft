import { z } from "zod";
import { MANUAL_PAYMENT_METHODS, REVENUE_SORTS, REVENUE_SOURCES, REVENUE_STATUSES, REVENUE_TYPES } from "@/lib/finance/revenue-constants";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** `GET /api/admin/finance/revenue` and the page's search params. */
export const revenueQuerySchema = z.object({
  status: z.enum([...REVENUE_STATUSES, "All"]).optional().or(z.literal("")),
  type: z.enum(REVENUE_TYPES).optional().or(z.literal("")),
  source: z.enum(REVENUE_SOURCES).optional().or(z.literal("")),
  serviceId: optionalText(60),
  ambassadorId: optionalText(60),
  from: isoDate,
  to: isoDate,
  q: optionalText(80),
  page: z.coerce.number().int().min(1).optional(),
  sort: z.enum(REVENUE_SORTS).optional().or(z.literal("")),
  dir: z.enum(["asc", "desc"]).optional().or(z.literal("")),
});
export type RevenueQuery = z.infer<typeof revenueQuerySchema>;

/** Finance confirming a payment the team marked as paid. Every field optional: the row already carries what was typed. */
export const confirmRevenueBodySchema = z.object({
  paymentMethod: optionalText(60),
  reference: optionalText(120),
  date: isoDate,
  notes: optionalText(1000),
});

export const rejectRevenueBodySchema = z.object({
  note: z.string().trim().min(3, "Say why").max(1000),
});

/** Finance recording a bank transfer or cash payment nobody marked first. */
export const manualRevenueBodySchema = z.object({
  projectCode: z.string().trim().min(3, "Enter the project ID").max(40),
  leg: z.enum(["downpayment", "balance"]),
  paymentMethod: z.enum(MANUAL_PAYMENT_METHODS),
  reference: optionalText(120),
  date: isoDate,
  notes: optionalText(1000),
});
