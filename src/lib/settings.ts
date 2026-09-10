import { db } from "@/lib/db";

/**
 * Read one or more Setting rows by key. Returns a map with `null` for keys
 * that don't exist or are blank.
 */
export async function getSettings<K extends string>(
  keys: readonly K[]
): Promise<Record<K, string | null>> {
  const rows = await db.setting.findMany({ where: { key: { in: keys as unknown as string[] } } });
  const map = Object.fromEntries(keys.map((k) => [k, null])) as Record<K, string | null>;
  for (const row of rows) {
    map[row.key as K] = row.value.trim() === "" ? null : row.value;
  }
  return map;
}

export interface CompanyBankDetails {
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  /** True when all three fields are present. */
  complete: boolean;
}

export async function getCompanyBankDetails(): Promise<CompanyBankDetails> {
  const s = await getSettings([
    "company_bank_name",
    "company_account_number",
    "company_account_name",
  ] as const);
  const bankName = s.company_bank_name;
  const accountNumber = s.company_account_number;
  const accountName = s.company_account_name;
  return {
    bankName,
    accountNumber,
    accountName,
    complete: Boolean(bankName && accountNumber && accountName),
  };
}
