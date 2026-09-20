import { z } from "zod";
import { ProjectStatus, ProjectType, ReferencingStyle } from "@prisma/client";
import { commissionRateSchema } from "@/lib/validations/commission";

const statusValues = Object.values(ProjectStatus) as [ProjectStatus, ...ProjectStatus[]];
const projectTypeValues = Object.values(ProjectType) as [ProjectType, ...ProjectType[]];
const referencingValues = Object.values(ReferencingStyle) as [ReferencingStyle, ...ReferencingStyle[]];

/** Parses raw `searchParams` into safe {@link ProjectListFilters}. */
export const projectListParamsSchema = z.object({
  status: z.enum(statusValues).optional().catch(undefined),
  service: z.string().min(1).optional().catch(undefined),
  university: z.string().min(1).optional().catch(undefined),
  worker: z.string().min(1).optional().catch(undefined),
  payment: z.enum(["Unpaid", "Partial", "Paid"]).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  flag: z.enum(["at-risk", "overdue", "revision-escalated"]).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});

export const transitionBodySchema = z.object({
  to: z.enum(statusValues),
  note: z.string().trim().max(500).optional(),
});

export const verifyPaymentBodySchema = z.object({
  leg: z.enum(["downpayment", "balance"]),
  paymentMethod: z.string().trim().max(60).optional().or(z.literal("")),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const markPaymentBodySchema = z.object({
  leg: z.enum(["downpayment", "balance"]),
});

export const holdBodySchema = z.object({
  to: z.enum(["ON_HOLD", "CANCELLED", "REFUNDED", "DISPUTED"]),
  note: z.string().trim().min(3, "A reason is required").max(1000),
});

export const assignWorkerBodySchema = z.object({
  workerId: z.string().min(1),
});

export const internalNotesBodySchema = z.object({
  internalNotes: z.string().max(5000),
});

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));

/** Empty string / null → undefined, otherwise coerce to a positive int. */
const optionalPositiveInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().positive().max(max).optional()
  );

const optionalNonNegativeInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().nonnegative().optional()
);

const emailOrBlank = z
  .string()
  .trim()
  .max(160)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email")
  .optional()
  .or(z.literal(""));

/**
 * Manual admin project creation.
 *
 * Flat shape (not a discriminated union) so React Hook Form gets stable field
 * paths; `clientMode` drives a superRefine that enforces the right client
 * fields. Conditional academic fields stay optional here — the form decides
 * which to show, the service which matter.
 */
export const createProjectSchema = z
  .object({
    clientMode: z.enum(["existing", "new"]).default("new"),
    clientId: z.string().optional().or(z.literal("")),
    fullName: z.string().trim().max(120).optional().or(z.literal("")),
    phone: z.string().trim().max(20).optional().or(z.literal("")),
    email: emailOrBlank,
    universityId: z.string().optional().or(z.literal("")),
    faculty: z.string().trim().max(120).optional().or(z.literal("")),
    department: z.string().trim().max(120).optional().or(z.literal("")),
    level: z.string().trim().max(40).optional().or(z.literal("")),
    referralCode: z.string().trim().max(40).optional().or(z.literal("")),

    // Ambassador allocation — blank = "None", no ambassador referred this job.
    ambassadorId: z.string().optional().or(z.literal("")),
    /** Blank = the ambassador's tier rate. */
    ambassadorRate: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      commissionRateSchema.optional()
    ),
    notifyAmbassador: z.boolean().default(true),

    serviceId: z.string().min(1, "Select a service"),
    serviceVariantId: z.string().min(1).optional().or(z.literal("")),
    isExpressDelivery: z.boolean().default(false),
    priceOverride: optionalNonNegativeInt,
    /** Free job: no price, no payment. Super admin only (enforced in the route). */
    proBono: z.boolean().default(false),
    proBonoReason: z.string().trim().max(300).optional().or(z.literal("")),

    projectTitle: z.string().trim().min(3, "Enter a project title").max(300),

    // FYP / academic
    matricNumber: optionalText,
    supervisorName: optionalText,
    hodName: optionalText,
    referencingStyle: z.enum(referencingValues).optional().or(z.literal("")),
    minimumPages: optionalText,
    projectType: z.enum(projectTypeValues).optional().or(z.literal("")),
    chapterCount: optionalPositiveInt(20),

    // Term paper
    courseTitle: optionalText,
    courseCode: optionalText,
    wordCount: optionalPositiveInt(200_000),

    specialInstructions: z.string().trim().max(5000).optional().or(z.literal("")),
    clientDeadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.proBono && !val.proBonoReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proBonoReason"],
        message: "Say why this job is pro bono",
      });
    }
    if (val.clientMode === "existing") {
      if (!val.clientId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clientId"], message: "Pick a client" });
      }
      return;
    }
    if (!val.fullName || val.fullName.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fullName"], message: "Enter the client's full name" });
    }
    if (!val.phone || val.phone.trim().length < 7) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Enter a valid phone number" });
    }
    if (!val.universityId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["universityId"], message: "Select a university" });
    }
    if (!val.department || val.department.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["department"], message: "Enter the department" });
    }
    if (!val.level) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["level"], message: "Select a level" });
    }
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
