import { z } from "zod";
import { RELEVANCE_LABELS, SCREENING_KINDS } from "@/lib/screening/rules";

/** A candidate's submission. The deep shape of payload/answerKey is checked in the service. */
export const screeningSubmitSchema = z.object({
  eye: z.record(
    z.string(),
    z.object({ choice: z.enum(["AI", "HUMAN"]), tell: z.string().trim().max(500).optional() })
  ),
  rel: z.record(z.string(), z.enum(RELEVANCE_LABELS)),
  rewrite: z.string().trim().max(8000).optional(),
});

/** The founder creating a bank item. Per-kind validation runs server-side in `createScreeningItem`. */
export const createScreeningItemSchema = z.object({
  kind: z.enum(SCREENING_KINDS),
  payload: z.unknown(),
  answerKey: z.unknown(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateScreeningItemSchema = z
  .object({
    payload: z.unknown().optional(),
    answerKey: z.unknown().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

export const updateScreeningSettingsSchema = z
  .object({
    passPercent: z.coerce.number().int().min(1).max(100).optional(),
    borderlineMargin: z.coerce.number().int().min(0).max(50).optional(),
    minutes: z.coerce.number().int().min(5).max(240).optional(),
    eyeCount: z.coerce.number().int().min(1).max(50).optional(),
    rewriteClaude: z.boolean().optional(),
    formatCount: z.coerce.number().int().min(0).max(6).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

export const decideScreeningSchema = z.object({
  decision: z.enum(["PASS", "FAIL"]),
  note: z.string().trim().max(1000).optional(),
});
