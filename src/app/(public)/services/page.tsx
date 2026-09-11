import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowRight, LuInbox } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { getActiveServices } from "@/lib/services/intake";
import { CATEGORY_LABELS, CATEGORY_ORDER, COMBO_GROUP, isCombo } from "@/lib/intake-templates";
import { formatNaira } from "@/lib/utils";
import type { PublicService } from "@/lib/services/intake";

export const metadata: Metadata = {
  title: "Services",
  description: "Every service EduCraft offers, with pricing.",
};
export const dynamic = "force-dynamic";

function priceLabel(s: PublicService): string {
  if (s.pricingModel === "QUOTE") return "Custom quote";
  if (s.pricingModel === "VARIABLE" && s.basePrice === 0) return "Quote on request";
  const prefix = s.variants.length > 0 || s.pricingModel === "VARIABLE" ? "from " : "";
  return `${prefix}${formatNaira(s.basePrice)}`;
}

function grouped(services: PublicService[]) {
  const combos = services.filter((s) => isCombo(s.serviceCode));
  const rest = services.filter((s) => !isCombo(s.serviceCode));
  const byCat = new Map<string, PublicService[]>();
  for (const s of rest) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);

  const out: { key: string; label: string; items: PublicService[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = byCat.get(cat);
    if (items?.length) out.push({ key: cat, label: CATEGORY_LABELS[cat] ?? cat, items });
  }
  for (const [cat, items] of byCat) {
    if (!CATEGORY_ORDER.includes(cat)) out.push({ key: cat, label: CATEGORY_LABELS[cat] ?? cat, items });
  }
  if (combos.length) out.push({ key: COMBO_GROUP.key, label: COMBO_GROUP.label, items: combos });
  return out;
}

export default async function ServicesPage() {
  const services = await getActiveServices();
  const groups = grouped(services);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          Services &amp; pricing
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Everything EduCraft does, with prices up front. Pick one to start — you pay 45% to begin
          and the balance once the work passes quality review.
        </p>
      </div>

      {services.length === 0 ? (
        <EmptyState icon={LuInbox} title="No services listed right now" description="Please check back shortly." />
      ) : (
        <div className="space-y-14">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="border-b border-border pb-2 font-display text-xl font-bold text-foreground">
                {group.label}
              </h2>
              <ul className="mt-4 divide-y divide-border">
                {group.items.map((s) => (
                  <li key={s.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-foreground">{s.serviceName}</p>
                      {s.description ? (
                        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{s.description}</p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Typical turnaround ~{s.estimatedDays} days
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                        {priceLabel(s)}
                      </span>
                      <Link
                        href={`/intake/${s.serviceCode}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Order now
                        <LuArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
