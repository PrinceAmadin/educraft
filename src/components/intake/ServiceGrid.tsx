import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import { resolveTemplate } from "@/lib/intake-templates";
import { groupServices, priceLabel } from "@/lib/service-groups";
import type { PublicService } from "@/lib/services/intake";

/**
 * Service picker for /intake. Same grouping as the public price list, set as
 * compact rows with faint dividers rather than a wall of bordered tiles.
 */
export function ServiceGrid({
  services,
  referralCode,
}: {
  services: PublicService[];
  referralCode?: string;
}) {
  const sections = groupServices(services);
  const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : "";

  return (
    <div className="space-y-10">
      {sections.map(({ group, services: rows }) => (
        <section key={group.key} aria-labelledby={`pick-${group.key}`}>
          <h2
            id={`pick-${group.key}`}
            className="border-b border-border pb-2.5 text-base font-semibold tracking-tight text-foreground"
          >
            {group.label}
          </h2>
          <ul className="divide-y divide-border/80">
            {rows.map((service) => {
              const online = resolveTemplate(service.intakeFormTemplate) != null;
              return (
                <li key={service.id}>
                  <Link
                    href={`/intake/${service.serviceCode}${query}`}
                    className="group -mx-3 flex min-h-[60px] items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-zone"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-foreground">
                        {service.serviceName}
                      </span>
                      <span className="mt-0.5 block font-mono text-[13px] tabular-nums text-muted-foreground">
                        {priceLabel(service)}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                      {online ? "Start" : "Enquire"}
                      <LuArrowRight
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
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
