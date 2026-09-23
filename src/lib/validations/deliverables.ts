import { z } from "zod";

/** A file the browser just uploaded to the private store, as the upload route handed it out. */
export const uploadedFileSchema = z.object({
  pathname: z.string().trim().min(10).max(300),
  ticket: z.string().trim().min(10).max(100),
  fileName: z.string().trim().min(1).max(200),
});

export const submitVersionSchema = z.object({
  upload: uploadedFileSchema,
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const reviewVersionSchema = z.object({
  decision: z.enum(["release", "return"]),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const adminUploadVersionSchema = z.object({
  upload: uploadedFileSchema,
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  release: z.boolean().default(false),
});

export const DELIVERABLE_ACCESS = ["DOWNPAYMENT", "BALANCE", "ALWAYS", "WITHHELD"] as const;

export const updateDeliverableSchema = z
  .object({
    title: z.string().trim().min(1, "Give the document a name").max(80).optional(),
    access: z.enum(DELIVERABLE_ACCESS).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.access !== undefined || v.archived !== undefined, "Nothing to change");

export const addDeliverableSchema = z.object({
  title: z.string().trim().min(1, "Give the document a name").max(80),
  access: z.enum(DELIVERABLE_ACCESS).default("BALANCE"),
});

export const shareResearchSchema = z.object({ shared: z.boolean() });

export const ACCESS_LABELS: Record<(typeof DELIVERABLE_ACCESS)[number], string> = {
  DOWNPAYMENT: "After the downpayment",
  BALANCE: "After the balance",
  ALWAYS: "Now (super admin)",
  WITHHELD: "Withheld",
};
