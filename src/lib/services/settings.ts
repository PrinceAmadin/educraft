import type { AmbassadorTier } from "@prisma/client";
import { db } from "@/lib/db";
import { DOWNPAYMENT_PERCENTAGE, TIER_COMMISSION_RATE } from "@/lib/constants";
import { DEFAULT_PARENT_COMMISSION_RATE } from "@/lib/commission";
import { splitEmailList, type GeneralSettingsInput } from "@/lib/validations/settings";

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
  alertEmails: "alert_emails",
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
  /** The founder's own Gmail: a different account from the sender, so alerts land in the inbox. */
  alertEmails: "amadinprince26@gmail.com",
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
  /** Comma-separated inboxes for new-application and paid-order alerts. */
  alertEmails: string;
}

/**
 * Inboxes that get the team alerts (new ambassador / worker application, paid
 * client order). Falls back to the founder's Gmail when the setting is unset.
 * Not the sender (educraft611@gmail.com): Gmail files mail an account sends to
 * itself under Sent, so no inbox alert would show.
 */
export async function getAlertEmails(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: KEYS.alertEmails } });
  const emails = splitEmailList(row?.value ?? "");
  return emails.length > 0 ? emails : splitEmailList(DEFAULTS.alertEmails);
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
    alertEmails: splitEmailList(s[KEYS.alertEmails] ?? "").join(", ") || DEFAULTS.alertEmails,
  };
}

/**
 * `pricingFields` gated separately from company info: OPS_MANAGER can update
 * contact/bank details but never the downpayment default or commission rates
 * (CLAUDE.md — "no pricing changes" for that role), nor where the founder's
 * alerts go. The route enforces this by omitting the fields from the payload
 * it forwards here for that role.
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
  if (input.alertEmails !== undefined)
    writes.push({ key: KEYS.alertEmails, value: splitEmailList(input.alertEmails).join(", ") });

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
