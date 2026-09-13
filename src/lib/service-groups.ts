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
  { key: "academic", label: "Academic writing", pill: "Academic" },
  { key: "research", label: "Research & analysis", pill: "Research" },
  { key: "presentations", label: "Presentations", pill: "Presentations" },
  { key: "career", label: "Career & professional", pill: "Career" },
  { key: "letters", label: "Letters & essays", pill: "Letters" },
  { key: "editing", label: "Editing & formatting", pill: "Editing" },
  { key: "documents", label: "Documents & diagrams", pill: "Documents" },
  { key: "combos", label: "Final year combos", pill: "Combos" },
];

const CODE_RULES: [RegExp, string][] = [
  [/^COMBO/, "combos"],
  [/^PPT/, "presentations"],
  [/^(EDIT|FORMAT|PROOF)/, "editing"],
  [/^(WATERMARK|WM-|PDF|IMG-|DIAGRAM|UML|GD-)/, "documents"],
  [/^(CV|PROFILE|LTR-APP)/, "career"],
  [/^(LTR|ESSAY)/, "letters"],
  [/^(THESIS|CASE|BIZ|DATA)/, "research"],
];

const CATEGORY_FALLBACK: Record<string, string> = {
  ACADEMIC: "academic",
  LEARNING: "academic",
  DESIGN: "presentations",
  CAREER: "career",
  DIGITAL: "documents",
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
  if (service.pricingModel === "QUOTE") return "Custom quote";
  if (service.pricingModel === "VARIABLE" && service.basePrice === 0) {
    const pct = service.description?.match(/(\d+(?:\.\d+)?)\s?%/);
    return pct ? `${pct[1]}% of cost` : "Quote on request";
  }
  const from = service.variants.length > 0 || service.pricingModel === "VARIABLE";
  return `${from ? "from " : ""}${formatNaira(service.basePrice)}`;
}

export function turnaroundLabel(days: number): string {
  return `~${days} day${days === 1 ? "" : "s"}`;
}
