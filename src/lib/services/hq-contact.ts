import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { toWaNumber } from "@/lib/whatsapp";

/**
 * EduCraft's own contact details — the WhatsApp line every ambassador link
 * opens, the number and mailbox in email footers, receipts and public pages.
 * Setting rows edited on Settings > General (Company info), read through one
 * cached function so a change reaches every screen at once and no number is
 * ever typed into a template again.
 */

export const HQ_CONTACT_TAG = "hq-contact";

export const HQ_CONTACT_KEYS = {
  name: "company_name",
  phone: "company_phone",
  email: "company_email",
  whatsapp: "hq_whatsapp",
  telegram: "hq_telegram",
  address: "hq_address",
} as const;

/** What the app has always shipped with (the founder's line and the business Gmail). */
const DEFAULTS = {
  name: "EduCraft",
  phone: "07063421088",
  email: "educraft611@gmail.com",
} as const;

export interface HqContact {
  name: string;
  /** As people dial it: "07063421088". */
  phone: string;
  /** International digits for wa.me: "2347063421088". */
  whatsapp: string;
  /** "https://wa.me/2347063421088" */
  whatsappUrl: string;
  email: string;
  /** Without the @, or null. */
  telegram: string | null;
  address: string | null;
}

const readContact = unstable_cache(
  async (): Promise<HqContact> => {
    const rows = await db.setting.findMany({ where: { key: { in: Object.values(HQ_CONTACT_KEYS) } } });
    const val = (key: string) => rows.find((r) => r.key === key)?.value?.trim() || "";
    const phone = val(HQ_CONTACT_KEYS.phone) || DEFAULTS.phone;
    // The WhatsApp line defaults to the phone line, in international digits.
    const whatsapp = toWaNumber(val(HQ_CONTACT_KEYS.whatsapp) || phone) ?? toWaNumber(DEFAULTS.phone)!;
    return {
      name: val(HQ_CONTACT_KEYS.name) || DEFAULTS.name,
      phone,
      whatsapp,
      whatsappUrl: `https://wa.me/${whatsapp}`,
      email: val(HQ_CONTACT_KEYS.email) || DEFAULTS.email,
      telegram: val(HQ_CONTACT_KEYS.telegram).replace(/^@/, "") || null,
      address: val(HQ_CONTACT_KEYS.address) || null,
    };
  },
  ["hq-contact", "1"],
  { tags: [HQ_CONTACT_TAG], revalidate: 3600 }
);

export async function getHqContact(): Promise<HqContact> {
  return readContact();
}

/** Flush the cached contact after Settings > General saves a change (the settings service calls this). */
export function revalidateHqContact(): void {
  revalidateTag(HQ_CONTACT_TAG);
}
