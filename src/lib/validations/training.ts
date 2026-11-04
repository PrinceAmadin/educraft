import { z } from "zod";
import { TRAINING_AUDIENCES } from "@/lib/training/rules";

/** Same bounds as the ambassador tour's progress payload: four hours is more video than anything we film. */
export const trainingProgressSchema = z.object({
  secondsWatched: z.coerce.number().finite().min(0).max(4 * 60 * 60),
  durationSeconds: z.coerce.number().finite().positive().max(4 * 60 * 60),
});

/** Blank (not uploaded yet) or an https link on the Blob store or anywhere else. */
const mediaUrl = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === "" || v.startsWith("https://"), "Must be an https:// link");

export const createEpisodeSchema = z.object({
  audience: z.enum(TRAINING_AUDIENCES),
  title: z.string().trim().min(1, "The episode needs a title").max(200),
  description: z.string().trim().max(2000).optional(),
  requiredForGate: z.boolean().optional(),
});

export const updateEpisodeSchema = z
  .object({
    title: z.string().trim().min(1, "The episode needs a title").max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    videoUrl: mediaUrl.optional(),
    posterUrl: mediaUrl.optional(),
    requiredForGate: z.boolean().optional(),
    isPublished: z.boolean().optional(),
    /** Swap with the neighbour above or below instead of editing fields. */
    move: z.enum(["up", "down"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
