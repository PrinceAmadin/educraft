import { z } from "zod";
import type { CashflowStructure } from "@/lib/finance/cashflow-types";

/**
 * The shape of a cashflow structure as it arrives from the settings tab.
 * Strict: an unknown field is refused, so a typo can never smuggle a figure
 * in. The business rules (sums, X-10%, tiers) are `validateStructure`'s.
 */

const key = z.string().trim().min(2).max(40).regex(/^[a-z][a-z0-9_]*$/i, "Letters, numbers and underscores only");
const label = z.string().trim().min(1).max(80);
const percent = z.number().finite().min(0).max(100);
const bucketKey = z.enum(["OPERATIONS_RESERVE", "GROWTH_FUND", "REINVESTMENT_FUND", "FOUNDER_DISTRIBUTION"]);
const tierKey = z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]);
const trigger = z.enum(["downpayment", "full_payment", "completion"]);

const level1Row = z
  .object({
    key,
    label,
    percentage: percent,
    displayOrder: z.number().int().min(0).max(999),
    kind: z.enum(["person", "fund"]),
    recipients: z.enum(["workers", "ambassadors", "role", "user"]).optional(),
    role: z.enum(["HOG", "COO"]).optional(),
    assignedUserId: z.string().trim().max(60).nullable().optional(),
    trigger: trigger.optional(),
    condition: z.literal("ambassador_driven").optional(),
    isAbsorber: z.boolean().optional(),
    active: z.boolean().optional(),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

const bucketRow = z
  .object({
    key: bucketKey,
    label,
    percentage: percent,
    holder: z.string().trim().max(80).optional(),
    purpose: z.string().trim().max(160).optional(),
    isAbsorber: z.boolean().optional(),
  })
  .strict();

const potRow = z
  .object({
    key,
    label,
    parentKey: bucketKey,
    percentage: percent,
    isTrackedAsPot: z.boolean(),
    isAbsorber: z.boolean().optional(),
    description: z.string().trim().max(160).optional(),
  })
  .strict();

const tierRule = z
  .object({
    key: tierKey,
    minConversions: z.number().int().min(0).max(100_000),
    maxConversions: z.number().int().min(0).max(100_000).nullable(),
    ratePercent: percent,
  })
  .strict();

const bonusRule = z
  .object({
    key,
    recipient: z.enum(["hog", "coo", "platinum_ambassador", "any_ambassador"]),
    label,
    condition: z.string().trim().max(200),
    amountNgn: z.number().int().min(0).max(100_000_000),
    cadence: z.enum(["monthly", "quarterly"]),
    metric: z
      .object({
        key: z.enum(["activationRate", "qaFirstPassRate", "onTimeRate", "supervisorRejections"]),
        op: z.enum([">", "=="]),
        value: z.number().finite(),
      })
      .strict()
      .optional(),
    perClient: z.boolean().optional(),
    target: z.number().int().min(1).max(10_000).optional(),
    extensionDays: z.number().int().min(0).max(90).optional(),
  })
  .strict();

const drawTier = z
  .object({
    minRevenueNgn: z.number().int().min(0),
    maxRevenueNgn: z.number().int().min(0).nullable(),
    drawPerFounderNgn: z.number().int().min(0),
  })
  .strict();

export const cashflowStructureSchema = z
  .object({
    schemaVersion: z.literal(1),
    level1: z.array(level1Row).min(2).max(30),
    level2: z.array(bucketRow).length(4),
    level3: z.array(potRow).max(40),
    tiers: z.array(tierRule).length(4),
    bonuses: z.array(bonusRule).max(40),
    founderDrawTiers: z.array(drawTier).min(1).max(12),
    triggers: z.object({ downpaymentPercent: percent, bufferPercent: percent }).strict(),
  })
  .strict();

export const publishCashflowSchema = z.object({
  structure: cashflowStructureSchema,
  reason: z.string().trim().max(500).optional(),
  /** The version the editor started from: publishing over a newer one is refused. */
  basedOnVersion: z.number().int().positive().optional(),
});
export type PublishCashflowInput = z.infer<typeof publishCashflowSchema>;

/** The parsed structure is exactly the runtime type. */
export function toStructure(parsed: z.infer<typeof cashflowStructureSchema>): CashflowStructure {
  return parsed as CashflowStructure;
}
