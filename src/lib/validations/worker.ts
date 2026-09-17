import { z } from "zod";

export const submitWorkSchema = z.object({
  fileUrl: z.string().trim().url("Paste a valid link to your file").max(2000),
  fileName: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SubmitWorkInput = z.infer<typeof submitWorkSchema>;
