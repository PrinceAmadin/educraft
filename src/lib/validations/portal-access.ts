import { z } from "zod";

export const createLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
    // Linking a record onto an existing login (same person, another role) needs
    // no password — the login already has one. A brand-new login requires one.
    password: z.string().min(8, "At least 8 characters").max(72).optional(),
    link: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.link) || (v.password && v.password.length >= 8), {
    message: "At least 8 characters",
    path: ["password"],
  });
export type CreateLoginInput = z.infer<typeof createLoginSchema>;
