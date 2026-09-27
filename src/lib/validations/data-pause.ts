import { z } from "zod";
import { uploadedFileSchema } from "@/lib/validations/deliverables";

/** D3c: what the worker sends at a pause (one entry per upload slot: a new upload, or a file already sent that stays). */
export const submitPauseSchema = z.object({
  pauseId: z.string().min(8).max(40),
  answers: z.record(z.string().max(40), z.union([z.string().max(2000), z.number()])).default({}),
  files: z
    .array(
      z
        .object({
          slot: z.string().min(1).max(40),
          upload: uploadedFileSchema.optional(),
          keepFileId: z.string().min(8).max(40).optional(),
        })
        .refine((f) => Boolean(f.upload) !== Boolean(f.keepFileId), "Each slot takes a new upload or a file already sent"),
    )
    .max(3, "At most three files"),
});

/** D3c: the founder and the COO open a pause by hand (D4 does it automatically) or ask for the request again. */
export const pauseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), afterChapter: z.number().int().min(1).max(4) }),
  z.object({ action: z.literal("regenerate_form"), pauseId: z.string().min(8).max(40) }),
]);
