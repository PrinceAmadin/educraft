import { z } from "zod";
import { phoneSchema } from "@/lib/validations/clients";

const tagList = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .default([])
  .transform((arr) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean))));

/** Public self-registration submission — the worker sets their own password here. */
export const workerRegistrationSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  phone: phoneSchema,
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email").max(160),
  educationLevel: z.string().trim().max(80).optional().or(z.literal("")),
  specialties: tagList,
  skills: tagList,
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
  password: z.string().min(8, "At least 8 characters").max(72),
});
export type WorkerRegistrationInput = z.infer<typeof workerRegistrationSchema>;

export const rejectWorkerApplicationSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

/** Admin correcting an application's details before approving. */
export const editWorkerApplicationSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().max(160).optional(),
  educationLevel: z.string().trim().max(80).optional().or(z.literal("")),
  specialties: tagList.optional(),
  skills: tagList.optional(),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
});
export type EditWorkerApplicationInput = z.infer<typeof editWorkerApplicationSchema>;
