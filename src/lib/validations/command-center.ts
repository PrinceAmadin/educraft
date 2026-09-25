import { z } from "zod";
import { NAIRA_THRESHOLD_MAX, THRESHOLD_KEYS, isNairaKey, isRateKey } from "@/lib/command-center/rag";

/**
 * PATCH /api/admin/command-center/settings — one threshold at a time. The
 * value stays a string (that is how Setting rows store it); rate keys must
 * be fractions 0..1, the reserve keys whole naira.
 */
export const thresholdPatchSchema = z
  .object({
    key: z.enum(THRESHOLD_KEYS),
    value: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, "Enter a number, e.g. 0.95 or 150000"),
  })
  .superRefine((input, ctx) => {
    const n = Number(input.value);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Enter a number" });
      return;
    }
    if (isRateKey(input.key) && n > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Rates are fractions between 0 and 1 (0.95 means 95%)",
      });
    }
    if (isNairaKey(input.key) && !Number.isInteger(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Enter whole naira, no decimals" });
    }
    if (isNairaKey(input.key) && n > NAIRA_THRESHOLD_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Enter at most ₦1,000,000,000" });
    }
  });

export type ThresholdPatchInput = z.infer<typeof thresholdPatchSchema>;

/** `?fresh=1` on a cached GET bypasses the server cache so Refresh is honest. */
export const freshQuerySchema = z.object({ fresh: z.enum(["1", "true"]).optional() });

export function wantsFresh(searchParams: URLSearchParams): boolean {
  const parsed = freshQuerySchema.safeParse({ fresh: searchParams.get("fresh") ?? undefined });
  return parsed.success && parsed.data.fresh !== undefined;
}
