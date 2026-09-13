"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LuArrowRight, LuChevronDown, LuSearch, LuSearchX, LuX } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import {
  groupKeyFor,
  groupServices,
  priceLabel,
  turnaroundLabel,
} from "@/lib/service-groups";
import type { PublicService } from "@/lib/services/intake";
import { cn, formatNaira } from "@/lib/utils";

/**
 * The public price list.
 *
 * Search filters by name (and by option and description, so "data analysis"
 * finds the FYP variant). Category pills narrow to one group. Rows are compact
 * and separated by faint dividers — no card per service. A service with
 * options expands in place to show each price; "Details" leads to the service
 * page, which is where the primary call to action lives.
 */
export function ServicesCatalogue({ services }: { services: PublicService[] }) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState("all");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const pills = React.useMemo(() => groupServices(services).map(({ group }) => group), [services]);

  const q = query.trim().toLowerCase();
  const visible = services.filter((s) => {
    if (active !== "all" && groupKeyFor(s) !== active) return false;
    if (!q) return true;
    return (
      s.serviceName.toLowerCase().includes(q) ||
      (s.description?.toLowerCase().includes(q) ?? false) ||
      s.variants.some((v) => v.name.toLowerCase().includes(q))
    );
  });
  const sections = groupServices(visible);

  return (
    <div>
      {/* ── Search ── */}
      <label className="relative block">
        <span className="sr-only">Search services</span>
        <LuSearch
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-subtle"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          className="h-[52px] rounded-xl pl-11 pr-11 text-base"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition-colors hover:text-foreground"
          >
            <LuX className="size-4" aria-hidden />
          </button>
        ) : null}
      </label>

      {/* ── Category pills — scroll sideways on phones ── */}
      <div
        role="group"
        aria-label="Filter by category"
        className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {[{ key: "all", pill: "All" }, ...pills].map((p) => {
          const on = active === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => setActive(p.key)}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors duration-fast",
                on
                  ? "bg-foreground text-background"
                  : "bg-zone text-muted-foreground hover:bg-elevated hover:text-foreground"
              )}
            >
              {p.pill}
            </button>
          );
        })}
      </div>

      {/* ── Results ── */}
      <div className="mt-10 space-y-12" aria-live="polite">
        {sections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-14 text-center">
            <LuSearchX className="size-6 text-subtle" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              No services match {q ? `“${query.trim()}”` : "this filter"}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActive("all");
              }}
              className="text-sm font-medium text-primary hover:underline"
            >
              Show every service
            </button>
          </div>
        ) : (
          sections.map(({ group, services: rows }) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              <h2
                id={`group-${group.key}`}
                className="border-b border-border pb-3 text-lg font-semibold tracking-tight text-foreground"
              >
                {group.label}
              </h2>
              <ul className="divide-y divide-border/80">
                {rows.map((s) => (
                  <ServiceRow
                    key={s.id}
                    service={s}
                    open={expanded === s.id}
                    onToggle={() => setExpanded((cur) => (cur === s.id ? null : s.id))}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/** "With Data Analysis" → the base option reads "Without Data Analysis". */
function baseOptionLabel(variants: { name: string }[]): string {
  if (variants.length > 0 && variants.every((v) => /^with\s/i.test(v.name))) {
    return `Without ${variants[0].name.replace(/^with\s/i, "")}`;
  }
  return "Standard";
}

function ServiceRow({
  service,
  open,
  onToggle,
}: {
  service: PublicService;
  open: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const hasOptions = service.variants.length > 0;
  const showRange = service.pricingModel === "VARIABLE" && service.basePrice > 0 && service.description;
  const panelId = `options-${service.id}`;

  const name = hasOptions ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      className="group/name inline-flex min-h-11 items-center gap-2 text-left text-[15px] font-medium text-foreground"
    >
      {service.serviceName}
      <LuChevronDown
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-subtle transition-transform duration-fast group-hover/name:text-foreground",
          open && "rotate-180"
        )}
      />
    </button>
  ) : (
    <p className="flex min-h-11 items-center text-[15px] font-medium text-foreground">
      {service.serviceName}
    </p>
  );

  return (
    <li className="py-3 sm:py-2">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[1fr_6.5rem_9.5rem_auto]">
        <div className="min-w-0">
          {name}
          {showRange ? (
            <p className="-mt-1 line-clamp-2 pb-1 text-[13px] text-muted-foreground">{service.description}</p>
          ) : null}
        </div>

        {/* Turnaround + price: stacked under the name on phones, columns from sm */}
        <span className="col-start-1 row-start-2 text-[13px] text-muted-foreground sm:col-start-auto sm:row-start-auto">
          {turnaroundLabel(service.estimatedDays)}
          <span className="font-mono font-medium tabular-nums text-foreground sm:hidden">
            {" · "}
            {priceLabel(service)}
          </span>
        </span>
        <span className="hidden text-right font-mono text-sm font-medium tabular-nums text-foreground sm:block">
          {priceLabel(service)}
        </span>

        <Link
          href={`/services/${service.serviceCode}`}
          className="col-start-2 row-span-2 row-start-1 inline-flex min-h-11 items-center gap-1 justify-self-end text-sm font-medium text-primary hover:text-primary-hover sm:col-start-auto sm:row-span-1 sm:row-start-auto"
          aria-label={`${service.serviceName} details`}
        >
          Details
          <LuArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>

      <AnimatePresence initial={false}>
        {hasOptions && open ? (
          <motion.ul
            id={panelId}
            key="options"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="overflow-hidden"
          >
            {[
              { name: baseOptionLabel(service.variants), total: service.basePrice },
              ...service.variants.map((v) => ({ name: v.name, total: service.basePrice + v.priceAddon })),
            ].map((opt) => (
              <li
                key={opt.name}
                className="flex items-baseline justify-between gap-4 py-1.5 pl-4 text-[13.5px] first:mt-1 last:mb-2"
              >
                <span className="text-muted-foreground">{opt.name}</span>
                <span className="font-mono font-medium tabular-nums text-foreground">{formatNaira(opt.total)}</span>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
