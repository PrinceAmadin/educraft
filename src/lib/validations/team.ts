import { z } from "zod";
import { phoneSchema } from "@/lib/validations/clients";
import { INVITABLE_ROLES } from "@/lib/rbac";

const blank = z.literal("");
const optionalText = (max: number) => z.string().trim().max(max).optional().or(blank);

/** Settings > Team & Roles: invite an executive. SUPER_ADMIN is never on offer here. */
export const inviteExecutiveSchema = z.object({
  fullName: z.string().trim().min(2, "Enter their full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  role: z.enum(INVITABLE_ROLES, { errorMap: () => ({ message: "Choose a role" }) }),
  title: optionalText(120),
  phone: phoneSchema.optional().or(blank),
});
export type InviteExecutiveInput = z.infer<typeof inviteExecutiveSchema>;

/** Edit an executive: every field optional, at least one present. `isActive` switches the login on or off. */
export const updateExecutiveSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter their full name").max(120).optional(),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(160).optional(),
    role: z.enum(INVITABLE_ROLES).optional(),
    title: optionalText(120),
    phone: phoneSchema.optional().or(blank),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });
export type UpdateExecutiveInput = z.infer<typeof updateExecutiveSchema>;

/** Settings > Bank details: an executive's own payout account (the founder may name another executive's `userId`). */
export const bankDetailsSchema = z.object({
  userId: z.string().min(1).max(64).optional(),
  bankName: optionalText(80),
  accountNumber: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9 ]*$/, "Digits only")
    .optional()
    .or(blank),
  accountName: optionalText(120),
});
export type BankDetailsInput = z.infer<typeof bankDetailsSchema>;
