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
  /** Within 2 conversions of the next tier. */
  near: z.enum(["1"]).optional().catch(undefined),
  /** Silver or above with no sub-team yet (and not a Sub themselves). */
  ready: z.enum(["1"]).optional().catch(undefined),
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
    /** Came in through a partnership (Section 6): counts their projects on it. Blank = direct recruitment by the HOG. */
    partnershipId: z.string().trim().optional().or(z.literal("")),
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

/** "Log content posted" (dashboard rhythm panel and the Content Hub). */
export const logContentSchema = z.object({
  contentType: z.enum(["MONDAY_FLIER", "WEDS_CHECKIN", "FRIDAY_SPOTLIGHT", "OTHER"]),
  postedAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

/** The HOG logs a student an ambassador brought in. */
export const logReferralSchema = z.object({
  clientName: z.string().trim().min(2, "Enter the student's name").max(120),
  clientWhatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  school: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type LogReferralFormInput = z.infer<typeof logReferralSchema>;

export const updateReferralSchema = z
  .object({
    status: z.enum(["PENDING", "LOST", "CANCELLED"]).optional(),
    clientName: z.string().trim().min(2).max(120).optional(),
    clientWhatsapp: z.string().trim().max(30).optional(),
    school: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");

// ── Commissions (Section 4) ──────────────────────────────────────────────
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
/** "Q3-2026" */
export const quarterKeySchema = z.string().regex(/^Q[1-4]-\d{4}$/, "Use Q3-2026");

export const commissionMonthQuerySchema = z.object({
  month: monthKey.optional().catch(undefined),
});

export const commissionHistoryQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  month: monthKey.optional().catch(undefined),
  status: z.enum(["PENDING", "PAID"]).optional().catch(undefined),
  tier: z.enum(tierValues).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});
export type CommissionHistoryQuery = z.infer<typeof commissionHistoryQuerySchema>;

export const quarterQuerySchema = z.object({
  quarter: quarterKeySchema.optional().catch(undefined),
});

export const processQuarterSchema = z.object({
  quarter: quarterKeySchema,
});

export const extendChallengeSchema = z.object({
  quarter: quarterKeySchema,
});

// ── Partnerships (Section 6) ─────────────────────────────────────────────
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal(""));
export const PARTNERSHIP_STATUS_VALUES = ["ACTIVE", "IN_NEGOTIATION", "INACTIVE"] as const;
export const WHAT_WE_RECEIVE_VALUES = ["GROUP_ACCESS", "PHYSICAL_ACCESS", "BOTH"] as const;

const partnershipFields = {
  organisationName: z.string().trim().min(2, "Enter the organisation's name").max(160),
  school: z.string().trim().min(2, "Enter the school or university").max(120),
  faculty: z.string().trim().max(120).optional().or(z.literal("")),
  contactPerson: z.string().trim().max(120).optional().or(z.literal("")),
  contactWhatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  commitmentAmount: z.coerce.number().int("Whole naira only").min(0, "Cannot be negative").max(100_000_000),
  whatWeReceive: z.enum(WHAT_WE_RECEIVE_VALUES).optional().or(z.literal("")),
  status: z.enum(PARTNERSHIP_STATUS_VALUES),
  startDate: optionalDate,
  renewalDate: optionalDate,
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
};

const renewalAfterStart = (v: { startDate?: string; renewalDate?: string }, ctx: z.RefinementCtx) => {
  if (v.startDate && v.renewalDate && v.renewalDate <= v.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["renewalDate"], message: "The renewal date must be after the start date" });
  }
};

/** "Add partnership". */
export const createPartnershipSchema = z.object(partnershipFields).superRefine(renewalAfterStart);
export type CreatePartnershipInput = z.infer<typeof createPartnershipSchema>;

/** Edit: any subset of the fields. */
export const updatePartnershipSchema = z
  .object(Object.fromEntries(Object.entries(partnershipFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) as { [K in keyof typeof partnershipFields]: z.ZodOptional<(typeof partnershipFields)[K]> })
  .superRefine(renewalAfterStart)
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");
export type UpdatePartnershipInput = z.infer<typeof updatePartnershipSchema>;

/** "Renew": the next term's payment (0 = nothing paid now) and its renewal date. */
export const renewPartnershipSchema = z.object({
  amount: z.coerce.number().int("Whole naira only").min(0).max(100_000_000),
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

export const linkPartnershipAmbassadorSchema = z.object({
  ambassadorId: z.string().min(1, "Pick an ambassador"),
});

// ── Content hub (Section 8) ──────────────────────────────────────────────
export const contentMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM").optional().catch(undefined),
});

export const campaignSchema = z.object({
  label: z.string().trim().min(2, "Name the semester").max(80),
  semesterStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

export const milestoneSchema = z.object({
  key: z.enum(["BRIEFING", "EARLY_BIRD", "URGENCY", "FINAL_CALL", "SEMESTER"]),
  done: z.boolean(),
});
