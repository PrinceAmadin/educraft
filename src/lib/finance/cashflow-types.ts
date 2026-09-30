import type { AmbassadorTier, BucketType } from "@prisma/client";

/**
 * The EduCraft cashflow structure: every commission and bucket figure, as one
 * JSON snapshot on a `CashflowVersion` row. Pure types — the form, the API,
 * the finance services and the check scripts all read this one shape.
 *
 * Keys are machine names and never change once published (a Level-1 key is
 * a PayoutRecord leg); labels are what people read and may be edited.
 */

/** When a person's share becomes owed: at the client's downpayment, when the client has paid in full, or when the project is COMPLETED. */
export type PersonTrigger = "downpayment" | "full_payment" | "completion";
export const PERSON_TRIGGERS: readonly PersonTrigger[] = ["downpayment", "full_payment", "completion"];
export const PERSON_TRIGGER_LABELS: Record<PersonTrigger, string> = {
  downpayment: "At the downpayment",
  full_payment: "When the client has paid in full",
  completion: "When the project is completed",
};

export type Level1Kind = "person" | "fund";
/** Who a person row pays: every assigned worker, the referring ambassador (+ Core), one executive by role, or one named login. */
export type Level1Recipients = "workers" | "ambassadors" | "role" | "user";
export type ExecRoleKey = "HOG" | "COO";

export interface Level1Row {
  key: string;
  label: string;
  /** Percent of the project price. */
  percentage: number;
  displayOrder: number;
  kind: Level1Kind;
  recipients?: Level1Recipients;
  role?: ExecRoleKey;
  assignedUserId?: string | null;
  trigger?: PersonTrigger;
  /** HOG: only on ambassador-driven projects. */
  condition?: "ambassador_driven";
  isAbsorber?: boolean;
  /** An inactive row (Growth Associate before Year 2) pays nothing and is left out of the sum. */
  active?: boolean;
  note?: string;
}

export interface BucketRow {
  key: BucketType;
  label: string;
  /** Percent of EduCraft's retained share. */
  percentage: number;
  holder?: string;
  purpose?: string;
  isAbsorber?: boolean;
}

export interface PotRow {
  key: string;
  label: string;
  parentKey: BucketType;
  /** Percent of the parent bucket. */
  percentage: number;
  isTrackedAsPot: boolean;
  isAbsorber?: boolean;
  description?: string;
}

export interface TierRule {
  key: AmbassadorTier;
  minConversions: number;
  /** Null for the top tier. */
  maxConversions: number | null;
  ratePercent: number;
}

export type BonusRecipient = "hog" | "coo" | "platinum_ambassador" | "any_ambassador";
export type BonusCadence = "monthly" | "quarterly";
export type BonusMetricKey = "activationRate" | "qaFirstPassRate" | "onTimeRate" | "supervisorRejections";

export interface BonusRule {
  key: string;
  recipient: BonusRecipient;
  label: string;
  condition: string;
  amountNgn: number;
  cadence: BonusCadence;
  /** The Operations figure the CFO judges it on, when there is one. */
  metric?: { key: BonusMetricKey; op: ">" | "=="; value: number };
  /** Paid per client referred in the period (the Platinum bonus). */
  perClient?: boolean;
  /** The quarterly challenge's client target and its one extension. */
  target?: number;
  extensionDays?: number;
}

export interface DrawTier {
  minRevenueNgn: number;
  /** Null for the top bracket. */
  maxRevenueNgn: number | null;
  drawPerFounderNgn: number;
}

export interface TriggerConfig {
  /** The downpayment share of a project the X-10% rule is measured against. */
  downpaymentPercent: number;
  /** The safety buffer under it. */
  bufferPercent: number;
}

export interface CashflowStructure {
  schemaVersion: 1;
  level1: Level1Row[];
  level2: BucketRow[];
  level3: PotRow[];
  tiers: TierRule[];
  bonuses: BonusRule[];
  founderDrawTiers: DrawTier[];
  triggers: TriggerConfig;
}

/** The Level-1 keys the engine looks up by name. */
export const LEVEL1 = {
  workers: "workers",
  ambassador: "ambassador",
  hog: "hog",
  coo: "coo",
  growthAssociate: "growth_associate",
  retained: "educraft_retained",
} as const;

export const TIER_KEYS: readonly AmbassadorTier[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
export const TIER_LABELS: Record<AmbassadorTier, string> = { BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum" };

export const BUCKET_KEYS: readonly BucketType[] = ["OPERATIONS_RESERVE", "GROWTH_FUND", "REINVESTMENT_FUND", "FOUNDER_DISTRIBUTION"];

export const BONUS_RECIPIENT_LABELS: Record<BonusRecipient, string> = {
  hog: "Head of Growth",
  coo: "COO",
  platinum_ambassador: "Platinum ambassadors",
  any_ambassador: "Any ambassador",
};

/** A row's active flag defaults to true. */
export function isActiveRow(row: { active?: boolean }): boolean {
  return row.active !== false;
}

export function level1Row(s: CashflowStructure, key: string): Level1Row | undefined {
  return s.level1.find((r) => r.key === key);
}

/** The percentage of the one Level-1 row with these recipients (0 when missing or inactive). */
export function recipientsPercent(s: CashflowStructure, recipients: Level1Recipients): number {
  const row = s.level1.find((r) => r.kind === "person" && r.recipients === recipients);
  return row && isActiveRow(row) ? row.percentage : 0;
}

/** EduCraft's retained share of the standard referred project, as a fraction (0.4). */
export function retainedFraction(s: CashflowStructure): number {
  const row = level1Row(s, LEVEL1.retained);
  return row ? row.percentage / 100 : 0;
}

export function tierRule(s: CashflowStructure, tier: AmbassadorTier): TierRule | undefined {
  return s.tiers.find((t) => t.key === tier);
}

export function bucketRow(s: CashflowStructure, key: BucketType): BucketRow | undefined {
  return s.level2.find((b) => b.key === key);
}

export function potsOf(s: CashflowStructure, parentKey: BucketType): PotRow[] {
  return s.level3.filter((p) => p.parentKey === parentKey);
}
