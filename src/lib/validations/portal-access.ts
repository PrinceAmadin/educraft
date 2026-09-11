import { z } from "zod";

export const createLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  password: z.string().min(8, "At least 8 characters").max(72),
});
export type CreateLoginInput = z.infer<typeof createLoginSchema>;
