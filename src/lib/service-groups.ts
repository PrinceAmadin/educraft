import { formatNaira } from "@/lib/utils";

/**
 * How the public catalogue is organised.
 *
 * The database category (ACADEMIC / DESIGN / CAREER / DIGITAL) is too coarse
 * for a student scanning a price list — "ACADEMIC" holds final year projects,
 * letters and editing alike. These groups follow the flyers instead, and a
 * service is placed by its code so a new service lands in the right group
 * without a schema change. Anything unmatched falls back on its category.
 */

export interface ServiceGroup {
  key: string;
  /** Section heading. */
  label: string;
  /** Filter pill — kept to one short word. */
  pill: string;
}

export const SERVICE_GROUPS: ServiceGroup[] = [
  { key: "fyp", label: "Final year reports", pill: "Final year" },
  { key: "chapters", label: "Chapter-based reports", pill: "Chapters" },
  { key: "combos", label: "Final year combos", pill: "Combos" },
  { key: "academic", label: "Academic writing", pill: "Academic" },
  { key: "research", label: "Research & analysis", pill: "Research" },
  { key: "presentations", label: "Presentations", pill: "Presentations" },
  { key: "career", label: "Career & professional", pill: "Career" },
  { key: "letters", label: "Letters & essays", pill: "Letters" },
  { key: "editing", label: "Editing & formatting", pill: "Editing" },
];

/**
 * The tabs on the price list. Final year is first because it is the core
 * product; "Other services" is everything else; "All" is the whole list.
 */
export interface ServiceTab {
  key: "fyp" | "other" | "all";
  label: string;
  /** Group keys shown under this tab; null means every group. */
  groups: string[] | null;
}

export const SERVICE_TABS: ServiceTab[] = [
  { key: "fyp", label: "Final year", groups: ["fyp", "chapters", "combos"] },
  { key: "other", label: "Other", groups: ["academic", "research", "presentations", "career", "letters", "editing"] },
  { key: "all", label: "All", groups: null },
];

const CODE_RULES: [RegExp, string][] = [
  [/^COMBO/, "combos"],
  [/^FYP-CHAP/, "chapters"],
  [/^(FYP|THESIS|SEM$|PUB$|PPT-FYP|EDIT-FYP)/, "fyp"],
  [/^PPT/, "presentations"],
  [/^(EDIT|FORMAT|PROOF)/, "editing"],
  [/^(CV|PROFILE|LTR-APP)/, "career"],
  [/^(LTR|ESSAY)/, "letters"],
  [/^(CASE|BIZ|DATA)/, "research"],
];

const CATEGORY_FALLBACK: Record<string, string> = {
  ACADEMIC: "academic",
  LEARNING: "academic",
  DESIGN: "presentations",
  CAREER: "career",
  DIGITAL: "academic",
};

export function groupKeyFor(service: { serviceCode: string; category: string }): string {
  const code = service.serviceCode.toUpperCase();
  for (const [rule, key] of CODE_RULES) if (rule.test(code)) return key;
  return CATEGORY_FALLBACK[service.category] ?? "academic";
}

export function groupServices<T extends { serviceCode: string; category: string }>(
  services: T[]
): { group: ServiceGroup; services: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const s of services) {
    const key = groupKeyFor(s);
    buckets.set(key, [...(buckets.get(key) ?? []), s]);
  }
  return SERVICE_GROUPS.filter((g) => buckets.has(g.key)).map((group) => ({
    group,
    services: buckets.get(group.key) ?? [],
  }));
}

interface PricedService {
  serviceCode?: string;
  basePrice: number;
  pricingModel: string;
  description: string | null;
  variants: { priceAddon: number }[];
}

/**
 * The one price string a row shows. Percentage-priced editing carries its rate
 * in the description ("Priced at 20% of the original project cost"), so that is
 * read back rather than duplicated into a second column.
 */
export function priceLabel(service: PricedService): string {
  if (service.serviceCode?.toUpperCase().startsWith("FYP-CHAP")) return "by chapter";
  if (service.pricingModel === "QUOTE") return "Custom quote";
  if (service.pricingModel === "VARIABLE" && service.basePrice === 0) {
    const pct = service.description?.match(/(\d+(?:\.\d+)?)\s?%/);
    return pct ? `${pct[1]}% of cost` : "Quote on request";
  }
  const from = service.variants.length > 0 || service.pricingModel === "VARIABLE";
  return `${from ? "from " : ""}${formatNaira(service.basePrice)}`;
}

/** "With Data Analysis" means the base option reads "Without Data Analysis". */
export function baseOptionLabel(variants: { name: string }[]): string {
  if (variants.length > 0 && variants.every((v) => /^with\s/i.test(v.name))) {
    return `Without ${variants[0].name.replace(/^with\s/i, "")}`;
  }
  return "Standard";
}

export function turnaroundLabel(days: number): string {
  return `~${days} day${days === 1 ? "" : "s"}`;
}
