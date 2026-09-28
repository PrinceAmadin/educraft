import { z } from "zod";
import { uploadedFileSchema } from "@/lib/validations/deliverables";
import { MAX_SUBMITTED_FILES } from "@/lib/generation/dynamic-data-form";

const pauseId = z.string().min(8).max(40);
const answers = z.record(z.string().max(40), z.union([z.string().max(2000), z.number()])).default({});
const files = z
  .array(uploadedFileSchema)
  .min(1, "Add at least one file.")
  .max(MAX_SUBMITTED_FILES, `Send at most ${MAX_SUBMITTED_FILES} files at a time.`);

/** D4: what the client sends at a pause (files already uploaded to the private store, and the answers). */
export const clientDataUploadSchema = z.object({ pauseId, files, answers });

/** D4: the specialist's actions on a pause (worker page, and the founder/COO Report tab). */
const specialistActions = [
  z.object({ action: z.literal("add_files"), pauseId, files }),
  z.object({ action: z.literal("save_answers"), pauseId, answers }),
  z.object({
    action: z.literal("verify"),
    pauseId,
    chapterFileIds: z.array(z.string().min(8).max(40)).max(40).default([]),
    /** The values the chapters before the pause left blank for the client's data, by slot key. */
    values: z.record(z.string().max(40), z.string().max(200)).default({}),
  }),
  z.object({ action: z.literal("request_more"), pauseId, note: z.string().trim().max(1000).optional().or(z.literal("")) }),
] as const;

export const workerPauseActionSchema = z.discriminatedUnion("action", [...specialistActions]);

/** D3c/D4: the founder and the COO also open a pause by hand (the chapter orchestrator does it on its own), redraft, cancel or reopen. */
export const pauseActionSchema = z.discriminatedUnion("action", [
  ...specialistActions,
  z.object({ action: z.literal("open"), afterChapter: z.number().int().min(1).max(4) }),
  z.object({ action: z.literal("regenerate_form"), pauseId }),
  z.object({ action: z.literal("cancel"), pauseId }),
  /** D9: a cancelled request is asked for again (the report cannot go past it without the data). */
  z.object({ action: z.literal("reopen"), pauseId }),
]);
