import type { GeneralSettingsInput } from "@/lib/validations/settings";

/**
 * The HQ contact fields on Settings > General and what changing them means —
 * pure, so the form can show a change back before it is saved and the
 * settings service can write the same list to the audit log.
 */

export const HQ_CONTACT_FIELDS = ["companyName", "companyPhone", "companyEmail", "hqWhatsapp", "hqTelegram", "hqAddress"] as const;
export type HqContactField = (typeof HQ_CONTACT_FIELDS)[number];

/** What each contact field is called in the audit log and the confirmation. */
export const HQ_CONTACT_LABELS: Record<HqContactField, string> = {
  companyName: "Company name",
  companyPhone: "Contact phone",
  companyEmail: "Contact email",
  hqWhatsapp: "WhatsApp line",
  hqTelegram: "Telegram",
  hqAddress: "Address",
};

export interface HqContactChange {
  field: HqContactField;
  label: string;
  before: string;
  after: string;
}

/** A field as it is stored: trimmed, and a Telegram name without its @. */
function stored(field: HqContactField, raw: string): string {
  const value = raw.trim();
  return field === "hqTelegram" ? value.replace(/^@/, "") : value;
}

/** The contact fields `input` would change, against what is stored now (blank means "not set"). */
export function hqContactChanges(current: Record<HqContactField, string>, input: GeneralSettingsInput): HqContactChange[] {
  const changes: HqContactChange[] = [];
  for (const field of HQ_CONTACT_FIELDS) {
    const raw = input[field];
    if (raw === undefined) continue;
    const before = stored(field, current[field] ?? "");
    const after = stored(field, raw);
    if (after !== before) changes.push({ field, label: HQ_CONTACT_LABELS[field], before, after });
  }
  return changes;
}
