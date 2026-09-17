import { z } from "zod";
import { WORKER_STATUSES } from "@/lib/worker-metrics";
import { phoneSchema } from "@/lib/validations/clients";

const statusValues = WORKER_STATUSES as unknown as [string, ...string[]];

const tagList = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .default([])
  .transform((arr) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean))));

export const createWorkerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the worker's full name").max(120),
  phone: phoneSchema,
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  educationLevel: z.string().trim().max(80).optional().or(z.literal("")),
  specialties: tagList,
  skills: tagList,
  maxConcurrentProjects: z.coerce.number().int().min(1).max(20).default(3),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;

export const workerStatusSchema = z.object({
  status: z.enum(statusValues),
});

/**
 * Admin general-edit schema — every field optional (a partial update), kept
 * as its own explicit object rather than `createWorkerSchema.partial()` so an
 * omitted `maxConcurrentProjects` stays untouched instead of silently
 * resetting to createWorkerSchema's default of 3.
 */
export const updateWorkerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the worker's full name").max(120).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  educationLevel: z.string().trim().max(80).optional().or(z.literal("")),
  specialties: tagList.optional(),
  skills: tagList.optional(),
  status: z.enum(statusValues).optional(),
  maxConcurrentProjects: z.coerce.number().int().min(1).max(20).optional(),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;

/** Fields a worker may edit on their own record — a strict subset of the admin schema. */
export const selfUpdateWorkerSchema = z.object({
  phone: phoneSchema.optional(),
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  educationLevel: z.string().trim().max(80).optional().or(z.literal("")),
  specialties: tagList.optional(),
  skills: tagList.optional(),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
});
export type SelfUpdateWorkerInput = z.infer<typeof selfUpdateWorkerSchema>;

export const workerListParamsSchema = z.object({
  status: z.enum(statusValues).optional().catch(undefined),
  specialty: z.string().trim().min(1).max(80).optional().catch(undefined),
  availability: z.enum(["available", "at-capacity"]).optional().catch(undefined),
  q: z.string().trim().min(1).max(120).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});
