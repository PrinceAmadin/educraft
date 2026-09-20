import { z } from "zod";
import { phoneSchema } from "@/lib/validations/clients";

export const ambassadorApplicationSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    phone: phoneSchema,
    // Required now: it is their dashboard login.
    email: z.string().trim().min(1, "Enter your email").email("Enter a valid email").max(160),
    password: z.string().min(8, "At least 8 characters").max(72),
    confirmPassword: z.string(),
    /** 6-digit code emailed when this email already has a login (worker applying as ambassador). */
    emailCode: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal("")),
    universityId: z.string().optional().or(z.literal("")),
    otherUniversity: z.string().trim().max(120).optional().or(z.literal("")),
    department: z.string().trim().max(120).optional().or(z.literal("")),
    level: z.string().trim().max(40).optional().or(z.literal("")),
    motivation: z
      .string()
      .trim()
      .max(200, "Keep it under 200 characters")
      .optional()
      .or(z.literal("")),
    // Payment details — used to pay commission, so held to the same bar as
    // the original ambassador app: a real bank, a 10-digit account number.
    bankName: z.string().trim().min(2, "Select or enter your bank").max(80),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "Enter a 10-digit account number"),
    accountName: z.string().trim().min(2, "Enter the account name").max(120),
    agreeTerms: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match" });
    }
    if (!v.agreeTerms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agreeTerms"],
        message: "You must agree to the Ambassador Terms to apply",
      });
    }
    if (!v.universityId && !v.otherUniversity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["universityId"],
        message: "Select your university (or choose Other and type it in)",
      });
    }
  });

export type AmbassadorApplicationInput = z.infer<typeof ambassadorApplicationSchema>;

export const approveApplicationSchema = z.object({
  /** Required only when the application has no linked university. */
  universityId: z.string().min(1).optional(),
});

export const rejectApplicationSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
