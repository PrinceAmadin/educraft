import { z } from "zod";

/** { "<item-id>": true } — unchecked items may be omitted or false. */
export const qaChecklistSchema = z.record(z.string().max(60), z.boolean());

export const saveChecklistBodySchema = z.object({
  checklist: qaChecklistSchema,
});

export const qaDecisionBodySchema = z
  .object({
    decision: z.enum(["pass", "revision", "escalate"]),
    notes: z.string().trim().max(5000).optional().or(z.literal("")),
    score: z.coerce.number().int().min(0).max(100).optional(),
    checklist: qaChecklistSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.decision === "revision" || v.decision === "escalate") && !v.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message:
          v.decision === "revision"
            ? "Add feedback so the worker knows what to fix"
            : "Explain why this is being escalated",
      });
    }
  });

export type QaDecisionInput = z.infer<typeof qaDecisionBodySchema>;
