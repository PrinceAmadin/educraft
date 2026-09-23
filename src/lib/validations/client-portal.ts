import { z } from "zod";

/** Longest message a client or admin can send. Pure file: safe in the browser. */
export const MESSAGE_MAX_LENGTH = 2000;

/** The signed-in client paying a leg of their own project. */
export const clientPaySchema = z.object({ leg: z.enum(["downpayment", "balance"]) });

/** Files one message can carry. */
export const MESSAGE_MAX_ATTACHMENTS = 5;

export const messageBodySchema = z
  .object({
    body: z.string().trim().max(MESSAGE_MAX_LENGTH, `Keep messages under ${MESSAGE_MAX_LENGTH} characters.`).default(""),
    attachments: z
      .array(
        z.object({
          pathname: z.string().trim().min(10).max(300),
          ticket: z.string().trim().min(10).max(100),
          fileName: z.string().trim().min(1).max(200),
        })
      )
      .max(MESSAGE_MAX_ATTACHMENTS, `Attach up to ${MESSAGE_MAX_ATTACHMENTS} files at a time.`)
      .default([]),
  })
  .refine((m) => m.body.length > 0 || m.attachments.length > 0, "Write a message first.");

/** An update an admin posts to the client's activity feed. */
export const manualUpdateSchema = z.object({
  title: z.string().trim().min(2, "Give the update a short title").max(120),
  body: z.string().trim().max(600).optional().or(z.literal("")),
});

export const hideUpdateSchema = z.object({ hidden: z.boolean() });

/** The date the client sees; null clears it ("we'll confirm your date soon"). */
export const expectedDeliverySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15")
    .nullable(),
});
