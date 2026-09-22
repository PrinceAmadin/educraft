import { z } from "zod";
import { isHttpsUrl } from "@/lib/safe-href";

export const submitWorkSchema = z.object({
  // https only: a stored link becomes an href on admin screens (see safe-href.ts).
  fileUrl: z
    .string()
    .trim()
    .url("Paste a valid link to your file")
    .max(2000)
    .refine(isHttpsUrl, "Paste an https:// link to your file"),
  fileName: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SubmitWorkInput = z.infer<typeof submitWorkSchema>;
