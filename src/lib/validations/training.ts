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
    quizPassPercent: z.coerce.number().int().min(1).max(100).optional(),
    /** Swap with the neighbour above or below instead of editing fields. */
    move: z.enum(["up", "down"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

/** A worker's quiz submission: a chosen option index per question id. */
export const quizSubmitSchema = z.object({
  answers: z.record(z.string(), z.coerce.number().int().min(0).max(5)),
});

/** The founder creating a quiz question. */
export const createQuizQuestionSchema = z.object({
  prompt: z.string().trim().min(1, "The question needs a prompt").max(500),
  options: z.array(z.string().trim().max(300)).min(2).max(6),
  correctIndex: z.coerce.number().int().min(0).max(5),
  explanation: z.string().trim().max(1000).optional(),
});

/** The founder editing a quiz question. */
export const updateQuizQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1).max(500).optional(),
    options: z.array(z.string().trim().max(300)).min(2).max(6).optional(),
    correctIndex: z.coerce.number().int().min(0).max(5).optional(),
    explanation: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
