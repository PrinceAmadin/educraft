import { z } from "zod";
import { AmbassadorTier } from "@prisma/client";
import { phoneSchema } from "@/lib/validations/clients";

const tierValues = Object.values(AmbassadorTier) as [AmbassadorTier, ...AmbassadorTier[]];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const ACTIVITY_VALUES = ["ACTIVE", "DORMANT", "INACTIVE", "NEW"] as const;
export const ROLE_FILTERS = ["all", "core", "sub", "solo"] as const;
export const DIRECTORY_SORTS = ["conversions", "lastReferral", "joined", "name"] as const;

/** `GET /api/admin/ambassadors` and the directory page. */
export const directoryQuerySchema = z.object({
  tier: z.enum(tierValues).optional().catch(undefined),
  school: z.string().trim().min(1).max(60).optional().catch(undefined),
  status: z.enum(ACTIVITY_VALUES).optional().catch(undefined),
  role: z.enum(ROLE_FILTERS).optional().catch(undefined),
  joinedFrom: isoDate.optional().catch(undefined),
  joinedTo: isoDate.optional().catch(undefined),
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  sort: z.enum(DIRECTORY_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
  /** Include suspended and terminated accounts (off by default). */
  includeClosed: z.enum(["1"]).optional().catch(undefined),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

/** The "New ambassador" modal. A sub names their Core; a Core stands alone. */
export const createDirectoryAmbassadorSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the full name").max(120),
    phone: phoneSchema,
    email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
    universityId: z.string().min(1, "Select a university"),
    department: z.string().trim().max(120).optional().or(z.literal("")),
    level: z.string().trim().max(40).optional().or(z.literal("")),
    isCore: z.boolean().default(true),
    coreAmbassadorId: z.string().trim().optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    /** The code the modal previewed (BLE-LAG-847). Used if still free, else a fresh one is drawn. */
    referralCode: z.string().trim().regex(/^[A-Z]{3}-[A-Z]{3}-\d{3}$/, "Codes look like BLE-LAG-847").optional().or(z.literal("")),
    bankName: z.string().trim().max(80).optional().or(z.literal("")),
    accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
    accountName: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (!v.isCore && !v.coreAmbassadorId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coreAmbassadorId"], message: "Pick the Core ambassador they work under" });
    }
  });
export type CreateDirectoryAmbassadorInput = z.infer<typeof createDirectoryAmbassadorSchema>;

export const addSubSchema = z.object({
  subId: z.string().min(1, "Pick an ambassador"),
});

export const suspendSchema = z.object({
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});
