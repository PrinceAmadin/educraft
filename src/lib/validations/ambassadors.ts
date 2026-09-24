import { z } from "zod";
import { AmbassadorTier } from "@prisma/client";
import { phoneSchema } from "@/lib/validations/clients";

const tierValues = Object.values(AmbassadorTier) as [AmbassadorTier, ...AmbassadorTier[]];
const statusValues = ["Active", "Paused", "Suspended", "Terminated", "Lapsed"] as const;

export const AMBASSADOR_STATUSES = statusValues;

/**
 * "Lapsed" is set by the provisional sweep when a new ambassador's 30 days
 * pass with no confirmed order, never chosen by an admin — they reinstate
 * instead. Keep it out of any status picker.
 */
export const SELECTABLE_AMBASSADOR_STATUSES = statusValues.filter((s) => s !== "Lapsed");

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

/** Status / tier (AmbassadorControls) or any profile field (EditAmbassadorDialog). */
export const updateAmbassadorSchema = z
  .object({
    status: z.enum(statusValues).optional(),
    /** No `tier`: since Phase 3 it is derived from lifetime conversions (`recountAmbassador`), never set by hand. */
    fullName: z.string().trim().min(2, "Enter the ambassador's full name").max(120).optional(),
    // Optional on the record: ambassadors from the old panel never gave one.
    phone: phoneSchema.optional().or(z.literal("")),
    email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
    universityId: z.string().min(1, "Select a university").optional(),
    department: z.string().trim().max(120).optional().or(z.literal("")),
    level: z.string().trim().max(40).optional().or(z.literal("")),
    bankName: z.string().trim().max(80).optional().or(z.literal("")),
    accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
    accountName: z.string().trim().max(120).optional().or(z.literal("")),
    /** The HOG's free-text note on the ambassador (Phase 3 directory). */
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    /**
     * Founder override on the 30-day provisional slot: "confirm" makes it
     * permanent now, "reinstate" gives a lapsed ambassador a fresh window.
     */
    slotAction: z.enum(["confirm", "reinstate"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");

export type UpdateAmbassadorInput = z.infer<typeof updateAmbassadorSchema>;

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
