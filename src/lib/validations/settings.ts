import { z } from "zod";
import { phoneSchema } from "@/lib/validations/clients";

const pct = z.coerce.number().min(0, "0–100").max(100, "0–100");

/** "a@x.com, b@y.com" (commas, semicolons, spaces or new lines) -> distinct lower-case addresses. */
export function splitEmailList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

const emailList = z
  .string()
  .trim()
  .max(1000)
  .superRefine((raw, ctx) => {
    const emails = splitEmailList(raw);
    if (emails.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter at least one email" });
      return;
    }
    if (emails.length > 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Up to 10 addresses" });
      return;
    }
    const bad = emails.find((e) => !z.string().email().safeParse(e).success);
    if (bad) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${bad}" is not a valid email` });
  });
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
  /** The WhatsApp line every ambassador link and "message us" link opens. Blank = the contact phone. */
  hqWhatsapp: phoneSchema.optional().or(blank),
  /** Telegram username, with or without the @. Blank = none. */
  hqTelegram: z
    .string()
    .trim()
    .max(60)
    .transform((raw) => raw.replace(/^@/, ""))
    .refine((raw) => raw === "" || /^[A-Za-z0-9_]{5,32}$/.test(raw), "A Telegram username is 5–32 letters, digits or underscores")
    .optional(),
  /** A postal address for the footer. Blank = none. */
  hqAddress: text(200),
  bankName: text(120),
  accountNumber: text(20),
  accountName: text(120),
  /** Who gets the new-application and paid-order emails. Super Admin only. */
  alertEmails: emailList.optional(),
  /** Margin on top of the auto-fetched ₦/$ rate, in percent (0–20). Super Admin only. */
  fxRateMarginPercent: z.coerce.number().min(0, "0–20").max(20, "0–20").optional(),
  /** Optional manual override of the base ₦/$ rate. Empty string clears it. Super Admin only. */
  fxRateManualOverride: z
    .string()
    .trim()
    .max(20)
    .refine(
      (raw) => {
        if (raw === "") return true;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 && n < 100_000;
      },
      "Enter a positive number, or leave empty for the auto rate",
    )
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

// The executive team's schemas live in `validations/team.ts`.
