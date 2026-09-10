import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  COMBO_GROUP,
  isCombo,
  resolveTemplate,
} from "@/lib/intake-templates";
import { formatNaira } from "@/lib/utils";
import type { PublicService } from "@/lib/services/intake";

interface Group {
  key: string;
  label: string;
  services: PublicService[];
}

function groupServices(services: PublicService[]): Group[] {
  const combos = services.filter((s) => isCombo(s.serviceCode));
  const rest = services.filter((s) => !isCombo(s.serviceCode));

  const byCategory = new Map<string, PublicService[]>();
  for (const s of rest) {
    const list = byCategory.get(s.category) ?? [];
    list.push(s);
    byCategory.set(s.category, list);
  }

  const ordered: Group[] = [];
  for (const cat of CATEGORY_ORDER) {
    const list = byCategory.get(cat);
    if (list && list.length > 0) {
      ordered.push({ key: cat, label: CATEGORY_LABELS[cat] ?? cat, services: list });
    }
  }
  // Any category not in the known order
  for (const [cat, list] of byCategory) {
    if (!CATEGORY_ORDER.includes(cat)) {
      ordered.push({ key: cat, label: CATEGORY_LABELS[cat] ?? cat, services: list });
    }
  }
  if (combos.length > 0) {
    ordered.push({ key: COMBO_GROUP.key, label: COMBO_GROUP.label, services: combos });
  }
  return ordered;
}

function priceLabel(service: PublicService): string {
  if (service.pricingModel === "QUOTE") return "Custom quote";
  if (service.pricingModel === "VARIABLE" && service.basePrice === 0) return "Quote on request";
  const hasVariants = service.variants.length > 0;
  const prefix = hasVariants || service.pricingModel === "VARIABLE" ? "from " : "";
  return `${prefix}${formatNaira(service.basePrice)}`;
}

export function ServiceGrid({
  services,
  referralCode,
}: {
  services: PublicService[];
  referralCode?: string;
}) {
  const groups = groupServices(services);
  const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : "";

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.services.map((service) => {
              const online = resolveTemplate(service.intakeFormTemplate) != null;
              return (
                <li key={service.id}>
                  <Link
                    href={`/intake/${service.serviceCode}${query}`}
                    className="group flex h-full min-h-[88px] flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{service.serviceName}</p>
                      {service.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {service.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-sm tabular-nums text-foreground">
                        {priceLabel(service)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        {online ? "Start" : "Enquire"}
                        <LuArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
