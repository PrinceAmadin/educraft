import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { splitEmailList, type GeneralSettingsInput } from "@/lib/validations/settings";
import { DEFAULT_FX_MARGIN_PERCENT, FX_RATE_SETTING_KEYS, clampMargin, resolveFxRate, type FxRateSnapshot } from "@/lib/fx-rate";
import { HQ_CONTACT_KEYS, revalidateHqContact } from "@/lib/services/hq-contact";
import { hqContactChanges, type HqContactChange, type HqContactField } from "@/lib/hq-contact-rules";

export { hqContactChanges, type HqContactChange } from "@/lib/hq-contact-rules";

/**
 * Setting keys this module owns. Everything else lives in its own service;
 * every commission figure (tier rates, the Core override, the downpayment
 * baseline) is in the published cashflow structure, never here.
 */
const KEYS = {
  companyName: HQ_CONTACT_KEYS.name,
  companyPhone: HQ_CONTACT_KEYS.phone,
  companyEmail: HQ_CONTACT_KEYS.email,
  hqWhatsapp: HQ_CONTACT_KEYS.whatsapp,
  hqTelegram: HQ_CONTACT_KEYS.telegram,
  hqAddress: HQ_CONTACT_KEYS.address,
  bankName: "company_bank_name",
  accountNumber: "company_account_number",
  accountName: "company_account_name",
  alertEmails: "alert_emails",
  fxMargin: FX_RATE_SETTING_KEYS.marginPercent,
  fxManualOverride: FX_RATE_SETTING_KEYS.manualOverride,
  fxManualOverrideSetAt: FX_RATE_SETTING_KEYS.manualOverrideSetAt,
} as const;

/** Setting keys the cashflow structure replaced (removed by `cashflow:seed`); listed so nothing new writes them. */
export const RETIRED_SETTING_KEYS = ["default_downpayment_percentage", "commission_rate_bronze", "commission_rate_silver", "commission_rate_gold", "commission_rate_platinum", "parent_commission_rate"] as const;

/** Hard-coded fallbacks — what the app has always shipped with. */
const DEFAULTS = {
  companyName: "EduCraft",
  companyPhone: "07063421088",
  companyEmail: "educraft611@gmail.com",
  hqWhatsapp: "",
  hqTelegram: "",
  hqAddress: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
  /** The founder's own Gmail: a different account from the sender, so alerts land in the inbox. */
  alertEmails: "amadinprince26@gmail.com",
};

export interface GeneralSettings {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  /** The WhatsApp line, as typed; empty = the contact phone is the line. */
  hqWhatsapp: string;
  /** Telegram username without the @; empty = none. */
  hqTelegram: string;
  hqAddress: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** The founder's inboxes, comma-separated: every team alert (the COO and HOG get theirs at their login email). */
  alertEmails: string;
  /** Margin % applied on top of the base ₦/$ rate (0–20). */
  fxRateMarginPercent: number;
  /** Manual override for the base ₦/$ rate; empty string when unset. */
  fxRateManualOverride: string;
  /** The resolved rate snapshot, so the form can show the live effective figure. */
  fxRateSnapshot: FxRateSnapshot;
}

/**
 * The founder's inboxes, which get every team alert (new ambassador / worker
 * application, paid client order; see team-alerts.ts for the executives who
 * also get them). Falls back to the founder's Gmail when the setting is unset.
 * Not the sender (educraft611@gmail.com): Gmail files mail an account sends to
 * itself under Sent, so no inbox alert would show.
 */
export async function getAlertEmails(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: KEYS.alertEmails } });
  const emails = splitEmailList(row?.value ?? "");
  return emails.length > 0 ? emails : splitEmailList(DEFAULTS.alertEmails);
}

async function readAll(): Promise<Record<string, string | undefined>> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const [s, fxRateSnapshot] = await Promise.all([readAll(), resolveFxRate()]);
  const num = (raw: string | undefined, fallback: number) => {
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    companyName: s[KEYS.companyName]?.trim() || DEFAULTS.companyName,
    companyPhone: s[KEYS.companyPhone]?.trim() || DEFAULTS.companyPhone,
    companyEmail: s[KEYS.companyEmail]?.trim() || DEFAULTS.companyEmail,
    hqWhatsapp: s[KEYS.hqWhatsapp]?.trim() || DEFAULTS.hqWhatsapp,
    hqTelegram: s[KEYS.hqTelegram]?.trim().replace(/^@/, "") || DEFAULTS.hqTelegram,
    hqAddress: s[KEYS.hqAddress]?.trim() || DEFAULTS.hqAddress,
    bankName: s[KEYS.bankName]?.trim() || DEFAULTS.bankName,
    accountNumber: s[KEYS.accountNumber]?.trim() || DEFAULTS.accountNumber,
    accountName: s[KEYS.accountName]?.trim() || DEFAULTS.accountName,
    alertEmails: splitEmailList(s[KEYS.alertEmails] ?? "").join(", ") || DEFAULTS.alertEmails,
    fxRateMarginPercent: clampMargin(num(s[KEYS.fxMargin], DEFAULT_FX_MARGIN_PERCENT)),
    fxRateManualOverride: s[KEYS.fxManualOverride] ?? "",
    fxRateSnapshot,
  };
}

/**
 * The HQ contact (the number, WhatsApp line, mailbox, Telegram and address),
 * where the founder's alerts go and the ₦/$ rate are the founder's; the route
 * forwards only the bank details for anyone else. Commission figures are not
 * here: Settings > EduCraft Cashflow.
 *
 * A change to the HQ contact reaches every public page, ambassador link,
 * receipt and email footer at once: the cached contact is flushed and the
 * change is written to the cashflow audit log under `actor`.
 */
export async function updateGeneralSettings(input: GeneralSettingsInput, actor?: { userId: string }): Promise<{ contactChanges: HqContactChange[] }> {
  const writes: { key: string; value: string }[] = [];

  if (input.companyName !== undefined) writes.push({ key: KEYS.companyName, value: input.companyName });
  if (input.companyPhone !== undefined) writes.push({ key: KEYS.companyPhone, value: input.companyPhone });
  if (input.companyEmail !== undefined) writes.push({ key: KEYS.companyEmail, value: input.companyEmail });
  if (input.hqWhatsapp !== undefined) writes.push({ key: KEYS.hqWhatsapp, value: input.hqWhatsapp.trim() });
  if (input.hqTelegram !== undefined) writes.push({ key: KEYS.hqTelegram, value: input.hqTelegram.trim().replace(/^@/, "") });
  if (input.hqAddress !== undefined) writes.push({ key: KEYS.hqAddress, value: input.hqAddress.trim() });
  if (input.bankName !== undefined) writes.push({ key: KEYS.bankName, value: input.bankName });
  if (input.accountNumber !== undefined)
    writes.push({ key: KEYS.accountNumber, value: input.accountNumber });
  if (input.accountName !== undefined) writes.push({ key: KEYS.accountName, value: input.accountName });
  if (input.alertEmails !== undefined)
    writes.push({ key: KEYS.alertEmails, value: splitEmailList(input.alertEmails).join(", ") });

  if (input.fxRateMarginPercent !== undefined)
    writes.push({ key: KEYS.fxMargin, value: String(clampMargin(input.fxRateMarginPercent)) });
  if (input.fxRateManualOverride !== undefined) {
    const trimmed = input.fxRateManualOverride.trim();
    if (trimmed === "") {
      // An empty override clears the row so the auto value wins again.
      await db.setting.deleteMany({
        where: { key: { in: [KEYS.fxManualOverride, KEYS.fxManualOverrideSetAt] } },
      });
    } else {
      writes.push({ key: KEYS.fxManualOverride, value: trimmed });
      writes.push({ key: KEYS.fxManualOverrideSetAt, value: new Date().toISOString() });
    }
  }

  if (writes.length === 0) return { contactChanges: [] };

  // What the contact was before the write, for the audit line and the cache flush.
  const current = await getGeneralSettings();
  const contactChanges = hqContactChanges(current, input);

  await db.$transaction(async (tx) => {
    for (const w of writes) {
      await tx.setting.upsert({
        where: { key: w.key },
        update: { value: w.value },
        create: { key: w.key, value: w.value },
      });
    }
    if (contactChanges.length > 0) {
      const pick = (source: Record<HqContactField, string>) => Object.fromEntries(contactChanges.map((c) => [c.field, source[c.field]]));
      await tx.cashflowAuditLog.create({
        data: {
          actorUserId: actor?.userId ?? "unknown",
          action: "changed_hq_contact",
          entityType: "HqContact",
          entityId: "hq",
          beforeJson: pick(current) as Prisma.InputJsonValue,
          afterJson: Object.fromEntries(contactChanges.map((c) => [c.field, c.after])) as Prisma.InputJsonValue,
        },
      });
    }
  });

  if (contactChanges.length > 0) revalidateHqContact();
  return { contactChanges };
}
