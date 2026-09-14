import type { AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { DOWNPAYMENT_PERCENTAGE, TIER_COMMISSION_RATE } from "@/lib/constants";
import { DEFAULT_PARENT_COMMISSION_RATE } from "@/lib/commission";
import type { GeneralSettingsInput } from "@/lib/validations/settings";

/** Setting keys this module owns. Everything else lives in its own service. */
const KEYS = {
  companyName: "company_name",
  companyPhone: "company_phone",
  companyEmail: "company_email",
  bankName: "company_bank_name",
  accountNumber: "company_account_number",
  accountName: "company_account_name",
  downpaymentPercentage: "default_downpayment_percentage",
  rateBronze: "commission_rate_bronze",
  rateSilver: "commission_rate_silver",
  rateGold: "commission_rate_gold",
  ratePlatinum: "commission_rate_platinum",
  parentCommissionRate: "parent_commission_rate",
} as const;

const RATE_KEY_BY_TIER: Record<AmbassadorTier, string> = {
  BRONZE: KEYS.rateBronze,
  SILVER: KEYS.rateSilver,
  GOLD: KEYS.rateGold,
  PLATINUM: KEYS.ratePlatinum,
};

/** Hard-coded fallbacks — what the app has always shipped with. */
const DEFAULTS = {
  companyName: "EduCraft",
  companyPhone: "07063421088",
  companyEmail: "educraft611@gmail.com",
  bankName: "",
  accountNumber: "",
  accountName: "",
  downpaymentPercentage: DOWNPAYMENT_PERCENTAGE,
};

export interface GeneralSettings {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** Prefilled as the default for newly-created services, not a live override. */
  downpaymentPercentage: number;
  commissionRates: Record<AmbassadorTier, number>;
  /** Default parent-ambassador rate — an admin can override it per sub-ambassador. */
  parentCommissionRate: number;
}

/**
 * The live default rate a parent (Core) ambassador earns from a sub's job,
 * when the pair has no per-relationship override. Falls back to
 * DEFAULT_PARENT_COMMISSION_RATE when unset.
 */
export async function getDefaultParentCommissionRate(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: KEYS.parentCommissionRate } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : DEFAULT_PARENT_COMMISSION_RATE;
}

async function readAll(): Promise<Record<string, string | undefined>> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Commission rate (%) per ambassador tier — the live values used everywhere a
 * commission is calculated. Falls back to the shipped constants when a
 * Setting row hasn't been written yet.
 */
export async function getCommissionRates(): Promise<Record<AmbassadorTier, number>> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(RATE_KEY_BY_TIER) } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const rate = (tier: AmbassadorTier) => {
    const raw = byKey[RATE_KEY_BY_TIER[tier]];
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : TIER_COMMISSION_RATE[tier];
  };
  return { BRONZE: rate("BRONZE"), SILVER: rate("SILVER"), GOLD: rate("GOLD"), PLATINUM: rate("PLATINUM") };
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const s = await readAll();
  const num = (raw: string | undefined, fallback: number) => {
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    companyName: s[KEYS.companyName]?.trim() || DEFAULTS.companyName,
    companyPhone: s[KEYS.companyPhone]?.trim() || DEFAULTS.companyPhone,
    companyEmail: s[KEYS.companyEmail]?.trim() || DEFAULTS.companyEmail,
    bankName: s[KEYS.bankName]?.trim() || DEFAULTS.bankName,
    accountNumber: s[KEYS.accountNumber]?.trim() || DEFAULTS.accountNumber,
    accountName: s[KEYS.accountName]?.trim() || DEFAULTS.accountName,
    downpaymentPercentage: num(s[KEYS.downpaymentPercentage], DEFAULTS.downpaymentPercentage),
    commissionRates: {
      BRONZE: num(s[KEYS.rateBronze], TIER_COMMISSION_RATE.BRONZE),
      SILVER: num(s[KEYS.rateSilver], TIER_COMMISSION_RATE.SILVER),
      GOLD: num(s[KEYS.rateGold], TIER_COMMISSION_RATE.GOLD),
      PLATINUM: num(s[KEYS.ratePlatinum], TIER_COMMISSION_RATE.PLATINUM),
    },
    parentCommissionRate: num(s[KEYS.parentCommissionRate], DEFAULT_PARENT_COMMISSION_RATE),
  };
}

/**
 * `pricingFields` gated separately from company info: OPS_MANAGER can update
 * contact/bank details but never the downpayment default or commission rates
 * (CLAUDE.md — "no pricing changes" for that role). The route enforces this
 * by omitting the fields from the payload it forwards here for that role.
 */
export async function updateGeneralSettings(input: GeneralSettingsInput): Promise<void> {
  const writes: { key: string; value: string }[] = [];

  if (input.companyName !== undefined) writes.push({ key: KEYS.companyName, value: input.companyName });
  if (input.companyPhone !== undefined) writes.push({ key: KEYS.companyPhone, value: input.companyPhone });
  if (input.companyEmail !== undefined) writes.push({ key: KEYS.companyEmail, value: input.companyEmail });
  if (input.bankName !== undefined) writes.push({ key: KEYS.bankName, value: input.bankName });
  if (input.accountNumber !== undefined)
    writes.push({ key: KEYS.accountNumber, value: input.accountNumber });
  if (input.accountName !== undefined) writes.push({ key: KEYS.accountName, value: input.accountName });
  if (input.downpaymentPercentage !== undefined)
    writes.push({ key: KEYS.downpaymentPercentage, value: String(input.downpaymentPercentage) });
  if (input.commissionRates) {
    if (input.commissionRates.BRONZE !== undefined)
      writes.push({ key: KEYS.rateBronze, value: String(input.commissionRates.BRONZE) });
    if (input.commissionRates.SILVER !== undefined)
      writes.push({ key: KEYS.rateSilver, value: String(input.commissionRates.SILVER) });
    if (input.commissionRates.GOLD !== undefined)
      writes.push({ key: KEYS.rateGold, value: String(input.commissionRates.GOLD) });
    if (input.commissionRates.PLATINUM !== undefined)
      writes.push({ key: KEYS.ratePlatinum, value: String(input.commissionRates.PLATINUM) });
  }
  if (input.parentCommissionRate !== undefined)
    writes.push({ key: KEYS.parentCommissionRate, value: String(input.parentCommissionRate) });

  if (writes.length === 0) return;

  await db.$transaction(
    writes.map((w) =>
      db.setting.upsert({
        where: { key: w.key },
        update: { value: w.value },
        create: { key: w.key, value: w.value },
      })
    )
  );
}
