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
  /** "approve" is a chapter's release under chapter review (the same action, the COO's word for it). */
  decision: z.enum(["release", "return", "approve"]),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  /** The read-back the COO looked at: approval is refused when the file was read again since. */
  readbackHash: z.string().trim().max(64).optional(),
  /** Chapter gate: the founder approves a chapter whose check failed, with a written reason. */
  overrideReason: z.string().trim().min(10, "Say why, in a sentence.").max(1000).optional(),
});

/** The COO's correction notes on an approved chapter (or on the AI draft before the specialist uploads). */
export const chapterChangesSchema = z.object({
  note: z.string().trim().min(3, "Say what needs to change.").max(4000),
});

export const adminUploadVersionSchema = z.object({
  upload: uploadedFileSchema,
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  release: z.boolean().default(false),
});

export const DELIVERABLE_ACCESS = ["DOWNPAYMENT", "BALANCE", "WITH_COMPLETE", "ALWAYS", "WITHHELD"] as const;

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
  WITH_COMPLETE: "Only in the complete project",
  ALWAYS: "Now (super admin)",
  WITHHELD: "Withheld",
};
