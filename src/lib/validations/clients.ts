import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20, "Phone number is too long")
  .regex(/^[0-9+\-\s()]+$/, "Digits and + - ( ) only");

/** Fields for creating a brand-new client inline. */
export const newClientSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the client's full name").max(120),
  phone: phoneSchema,
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  universityId: z.string().min(1, "Select a university"),
  faculty: z.string().trim().max(120).optional().or(z.literal("")),
  department: z.string().trim().min(2, "Enter the department").max(120),
  level: z.string().trim().min(1, "Select a level").max(40),
  referralCode: z.string().trim().max(40).optional().or(z.literal("")),
});

export const clientListParamsSchema = z.object({
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});

export const clientNotesBodySchema = z.object({
  notes: z.string().max(5000),
});
