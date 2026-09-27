import { z } from "zod";

/** D3b: what the COO asks the brief to do (POST /api/admin/projects/[id]/mode/brief). */
export const briefActionSchema = z.object({
  action: z.enum(["start", "redraft_objectives", "carry_on"]),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

/** D3b: a case or archival record the COO adds by hand under a point. */
export const manualSourceSchema = z.object({
  pointIndex: z.number().int().min(0).max(50),
  title: z.string().trim().min(3, "Give the case name or the record's title").max(300),
  court: optionalText(120),
  decidedOn: optionalText(40),
  citation: optionalText(160),
  holder: optionalText(160),
  reference: optionalText(120),
  url: optionalText(1000).refine((v) => !v || /^https:\/\/[^\s]+$/i.test(v), "The link must start with https://"),
});
export type ManualSourceBody = z.infer<typeof manualSourceSchema>;
