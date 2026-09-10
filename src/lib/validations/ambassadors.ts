import { z } from "zod";
import { AmbassadorTier } from "@prisma/client";
import { phoneSchema } from "@/lib/validations/clients";

const tierValues = Object.values(AmbassadorTier) as [AmbassadorTier, ...AmbassadorTier[]];
const statusValues = ["Active", "Paused", "Suspended", "Terminated"] as const;

export const AMBASSADOR_STATUSES = statusValues;

export const createAmbassadorSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the ambassador's full name").max(120),
  phone: phoneSchema,
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  universityId: z.string().min(1, "Select a university"),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  level: z.string().trim().max(40).optional().or(z.literal("")),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
});

export type CreateAmbassadorInput = z.infer<typeof createAmbassadorSchema>;

export const updateAmbassadorSchema = z
  .object({
    status: z.enum(statusValues).optional(),
    tier: z.enum(tierValues).optional(),
  })
  .refine((v) => v.status || v.tier, "Nothing to update");

export const ambassadorListParamsSchema = z.object({
  university: z.string().min(1).optional().catch(undefined),
  tier: z.enum(tierValues).optional().catch(undefined),
  status: z.enum(statusValues).optional().catch(undefined),
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});

export const payoutActionSchema = z.object({
  kind: z.enum(["worker", "ambassador"]),
  scope: z.enum(["one", "all"]),
  id: z.string().min(1).optional(),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});
