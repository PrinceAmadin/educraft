"use client";

import * as React from "react";
import Link from "next/link";
import { ChapterCalculator } from "@/components/services/ChapterCalculator";
import { CHAPTER_SERVICE_CODE } from "@/lib/chapter-pricing";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LuArrowRight, LuChevronDown, LuSearch, LuSearchX, LuX } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import {
  baseOptionLabel,
  groupKeyFor,
  groupServices,
  SERVICE_TABS,
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
  const [tab, setTab] = React.useState<(typeof SERVICE_TABS)[number]["key"]>("fyp");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const activeTab = SERVICE_TABS.find((t) => t.key === tab) ?? SERVICE_TABS[0];
  const visible = services.filter((s) => {
    // A search looks across every tab; a tab only narrows an empty search.
    if (!q && activeTab.groups && !activeTab.groups.includes(groupKeyFor(s))) return false;
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

      {/* ── Tabs: final year first (the core product), then everything else ── */}
      <div
        role="tablist"
        aria-label="Service categories"
        className="no-scrollbar mt-4 flex gap-1 overflow-x-auto rounded-xl bg-zone p-1"
      >
        {SERVICE_TABS.map((t) => {
          const on = !q && tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setQuery("");
                setTab(t.key);
              }}
              className={cn(
                "min-h-11 flex-1 shrink-0 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium sm:px-3.5 sm:text-sm transition-colors duration-fast",
                on ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
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
              No services match {q ? `“${query.trim()}”` : "this tab"}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTab("all");
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
                {group.key === "chapters"
                  ? null
                  : rows.map((s) => (
                      <ServiceRow
                        key={s.id}
                        service={s}
                        open={expanded === s.id}
                        onToggle={() => setExpanded((cur) => (cur === s.id ? null : s.id))}
                      />
                    ))}
              </ul>
              {group.key === "chapters"
                ? rows
                    .filter((s) => s.serviceCode === CHAPTER_SERVICE_CODE)
                    .map((s) => <ChapterSection key={s.id} service={s} />)
                : null}
            </section>
          ))
        )}
      </div>
    </div>
  );
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

/** The chapter-based report: pick chapters, see the sum, continue. Plain on purpose. */
function ChapterSection({ service }: { service: PublicService }) {
  const [chapters, setChapters] = React.useState<number[]>([]);
  const [withAnalysis, setWithAnalysis] = React.useState(false);
  const variant = service.variants[0];
  const addon = variant?.priceAddon ?? 0;

  const query = new URLSearchParams();
  if (chapters.length > 0) query.set("chapters", chapters.join(","));
  if (withAnalysis && variant) query.set("option", variant.id);

  return (
    <div className="pt-4">
      <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-muted-foreground">
        For final year projects only. Each chapter is charged as a fixed share of the full report price.
      </p>
      <div className="mt-5">
        <ChapterCalculator
          chapters={chapters}
          onChapters={setChapters}
          withAnalysis={withAnalysis}
          onWithAnalysis={setWithAnalysis}
          basePrice={service.basePrice}
          analysisAddon={addon}
        />
      </div>
      {chapters.length > 0 ? (
        <div className="mt-5">
          <Link
            href={`/intake/${service.serviceCode}?${query.toString()}`}
            className="inline-flex h-12 items-center justify-between gap-6 bg-primary px-6 text-[0.9375rem] font-medium text-primary-foreground [clip-path:polygon(0_0,100%_0,100%_calc(100%-11px),calc(100%-11px)_100%,0_100%)] hover:bg-primary-hover"
          >
            Continue
            <LuArrowRight className="size-[18px]" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
