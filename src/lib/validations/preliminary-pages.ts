import { z } from "zod";

/**
 * D7b: the founder or the COO correcting the Claude-written preliminary pages
 * by hand (Report tab). `loadedAt` is the pages' updatedAt when the card was
 * opened: a save is refused if they were rewritten since.
 */
export const preliminaryPagesEditSchema = z.object({
  acknowledgement: z.string().trim().min(1, "The acknowledgement cannot be empty.").max(6000, "The acknowledgement is too long."),
  abstract: z.string().trim().min(1, "The abstract cannot be empty.").max(8000, "The abstract is too long."),
  abbreviations: z
    .array(
      z.object({
        token: z.string().trim().min(1, "Every abbreviation needs its letters.").max(20, "An abbreviation is at most 20 characters."),
        expansion: z.string().trim().min(1, "Every abbreviation needs its meaning.").max(200, "A meaning is at most 200 characters."),
      }),
    )
    .max(80, "At most 80 abbreviations."),
  loadedAt: z.string().datetime(),
});

export type PreliminaryPagesEdit = z.infer<typeof preliminaryPagesEditSchema>;
