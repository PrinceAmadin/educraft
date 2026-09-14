import { z } from "zod";
import {
  MAX_COMMISSION_RATE,
  MAX_PARENT_COMMISSION_RATE,
  MIN_COMMISSION_RATE,
  MIN_PARENT_COMMISSION_RATE,
} from "@/lib/commission";

/** 10, 12, 15 — or any rate the admin sets, to two decimal places. */
export const commissionRateSchema = z.coerce
  .number({ invalid_type_error: "Enter a commission rate" })
  .min(MIN_COMMISSION_RATE, `Commission must be at least ${MIN_COMMISSION_RATE}%`)
  .max(MAX_COMMISSION_RATE, `Commission can't be more than ${MAX_COMMISSION_RATE}%`)
  .refine((n) => Math.round(n * 100) === n * 100, "Use at most two decimal places");

/** What a parent ambassador earns from a sub's job — 0 allowed (linked, unpaid). */
export const parentCommissionRateSchema = z.coerce
  .number({ invalid_type_error: "Enter a rate" })
  .min(MIN_PARENT_COMMISSION_RATE, `Can't be less than ${MIN_PARENT_COMMISSION_RATE}%`)
  .max(MAX_PARENT_COMMISSION_RATE, `Can't be more than ${MAX_PARENT_COMMISSION_RATE}%`)
  .refine((n) => Math.round(n * 100) === n * 100, "Use at most two decimal places");

export const allocateAmbassadorSchema = z.object({
  ambassadorId: z.string().min(1, "Pick an ambassador"),
  /** Omitted = the ambassador's tier rate. */
  rate: commissionRateSchema.optional(),
  /** Email the ambassador about the commission now. */
  notify: z.boolean().default(true),
});

export type AllocateAmbassadorInput = z.infer<typeof allocateAmbassadorSchema>;

/** Link (or unlink, with `parentId: null`) an ambassador under a parent. */
export const setParentSchema = z.object({
  parentId: z.string().min(1).nullable(),
  /** Omitted with a parentId = the global default rate. */
  rate: parentCommissionRateSchema.optional(),
});
export type SetParentInput = z.infer<typeof setParentSchema>;

export const messageAmbassadorSchema = z.object({
  title: z.string().trim().min(1, "Enter a subject").max(120),
  message: z.string().trim().min(1, "Enter a message").max(5000),
});
export type MessageAmbassadorInput = z.infer<typeof messageAmbassadorSchema>;

export const broadcastSchema = z.object({
  subject: z.string().trim().min(1, "Enter a subject").max(120),
  message: z.string().trim().min(1, "Enter a message").max(5000),
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;
