import { z } from "zod";

export const submitWorkSchema = z.object({
  fileUrl: z.string().trim().url("Paste a valid link to your file").max(2000),
  fileName: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SubmitWorkInput = z.infer<typeof submitWorkSchema>;

export const workerBankSchema = z.object({
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(20).optional().or(z.literal("")),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
});
