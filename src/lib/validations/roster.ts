import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const addSlotSchema = z.object({
  kind: z.enum(["GENERAL", "CORE", "SUB"]),
  code: text(20).optional().or(z.literal("")),
  name: text(120).optional().or(z.literal("")),
  school: text(60).optional().or(z.literal("")),
  vacant: z.boolean().optional(),
  percentage: z.number().min(0).max(100).nullable().optional(),
  parentCode: text(20).nullable().optional(),
});

export const updateSlotSchema = z.object({
  name: text(120).optional(),
  school: text(60).optional(),
  vacant: z.boolean().optional(),
  percentage: z.number().min(0).max(100).nullable().optional(),
  parentCode: text(20).nullable().optional(),
});
