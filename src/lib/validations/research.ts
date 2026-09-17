import { z } from "zod";

export const startResearchBodySchema = z.object({
  targetCount: z.number().int().min(5).max(100).optional(),
});
