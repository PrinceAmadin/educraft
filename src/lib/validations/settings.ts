import { z } from "zod";
import { phoneSchema } from "@/lib/validations/clients";

const pct = z.coerce.number().min(0, "0–100").max(100, "0–100");
const blank = z.literal("");
const text = (max: number) => z.string().trim().max(max).optional().or(blank);

/**
 * Every field optional — the form only sends what the signed-in role is
 * allowed to change, and `updateGeneralSettings` only writes keys present in
 * the payload.
 */
export const generalSettingsSchema = z.object({
  companyName: z.string().trim().min(1, "Required").max(120).optional(),
  companyPhone: phoneSchema.optional(),
  companyEmail: z.string().trim().email("Enter a valid email").max(160).optional(),
  bankName: text(120),
  accountNumber: text(20),
  accountName: text(120),
  downpaymentPercentage: pct.optional(),
  commissionRates: z
    .object({
      BRONZE: pct.optional(),
      SILVER: pct.optional(),
      GOLD: pct.optional(),
      PLATINUM: pct.optional(),
    })
    .optional(),
});
export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;

const money = z.coerce.number().nonnegative("Must be 0 or more");

/** "" / null / undefined -> undefined, otherwise coerce to a non-negative number. */
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().nonnegative().optional()
);

export const createServiceSchema = z.object({
  serviceCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Too short")
    .max(30)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Letters, numbers and hyphens only"),
  serviceName: z.string().trim().min(2, "Enter a name").max(120),
  category: z.enum(["ACADEMIC", "DESIGN", "CAREER", "LEARNING", "DIGITAL"]),
  basePrice: money,
  pricingModel: z.enum(["FIXED", "VARIABLE", "QUOTE"]).default("FIXED"),
  intakeFormTemplate: z.string().trim().min(1, "Required").max(60),
  estimatedDays: z.coerce.number().int().positive().max(180),
  requiresDownpayment: z.boolean().default(true),
  downpaymentPercentage: pct.default(45),
  description: text(500),
  deliverables: text(1000),
  expressDeliverySurcharge: optionalMoney,
  sortOrder: z.coerce.number().int().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema
  .omit({ serviceCode: true })
  .extend({ isActive: z.boolean().optional() })
  .partial();
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const createTeamMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  displayName: z.string().trim().min(1, "Enter a name").max(120),
  phone: phoneSchema.optional().or(blank),
  password: z.string().min(8, "At least 8 characters").max(72),
  role: z.enum(["SUPER_ADMIN", "OPS_MANAGER"]),
});
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;
