import { z } from "zod";

export const startResearchBodySchema = z.object({
  targetCount: z.number().int().min(15).max(70).optional(),
});

export const rerunRequestBodySchema = z.object({
  reason: z.string().trim().min(15).max(500),
});

export const reviewRerunBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});
