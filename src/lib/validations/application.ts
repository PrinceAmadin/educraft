import { z } from "zod";
import { phoneSchema } from "@/lib/validations/clients";

export const ambassadorApplicationSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    phone: phoneSchema,
    email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
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
  })
  .superRefine((v, ctx) => {
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
