import { z } from "zod";
import { SECTION_KEYS } from "@/lib/generation/department-map";

/**
 * The COO's mode decision, as the card sends it (approve, or save a change).
 * Shape only: the rules (a mode the department can take, the section for a Mode 3
 * project, Mode 1 titles…) are checked by validateModeDecision / validateModeDraft.
 */
export const modeDecisionSchema = z.object({
  department: z.string().trim().min(1, "Pick the department").max(120),
  modeNumber: z.coerce.number().int("Pick a mode from 1 to 5"),
  section: z.enum(SECTION_KEYS).nullish(),
  referencingStyle: z.string().trim().min(1, "Pick a referencing style").max(40),
  customStyleText: z.string().trim().max(500, "Keep the custom format under 500 characters").nullish(),
  citationPlacement: z.enum(["MODE_A", "MODE_B", "MODE_C", "NOT_APPLICABLE"]).nullish(),
  thematicTitles: z
    .object({
      chapter3: z.string().trim().max(300).nullish(),
      chapter4: z.string().trim().max(300).nullish(),
    })
    .nullish(),
  samples: z
    .object({
      nonHuman: z.boolean().nullish(),
      description: z.string().trim().max(300).nullish(),
    })
    .nullish(),
  notes: z.string().trim().max(1000, "Keep the note under 1,000 characters").nullish(),
  /** D3b: the objectives as edited on the card (3 to 5; the rules are checked by validateObjectives). */
  objectives: z.array(z.string().max(600)).max(8).optional(),
  /** D3b: the ids of the cases or archival sources ticked on the card. */
  selectedSourceIds: z.array(z.string().min(1).max(40)).max(100).optional(),
});
export type ModeDecisionBody = z.infer<typeof modeDecisionSchema>;

export const reopenModeSchema = z.object({
  reason: z.string().trim().min(3, "Say why the mode is being reopened").max(500),
});
