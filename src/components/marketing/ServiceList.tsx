"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Service = {
  index: string;
  title: string;
  href: string;
  from: string;
  summary: string;
  /** Revealed on hover/focus — progressive disclosure, not a feature dump. */
  meta: string[];
};

const SERVICES: Service[] = [
  {
    index: "01",
    title: "Final Year Projects",
    href: "/services#final-year",
    from: "₦70,000",
    summary:
      "Full five-chapter reports, proposals and data analysis, matched to your department's format.",
    meta: ["5 chapters", "Data analysis", "21 days"],
  },
  {
    index: "02",
    title: "Reports & Papers",
    href: "/services#reports",
    from: "₦10,000",
    summary:
      "Seminar reports, IT reports, term papers, case studies and assignment-based work.",
    meta: ["SIWES & IT", "Case studies", "7 days"],
  },
  {
    index: "03",
    title: "Presentations",
    href: "/services#presentations",
    from: "₦8,000",
    summary:
      "Defence slides and class presentations — design only, or design with written content.",
    meta: ["Defence ready", "Custom design", "4 days"],
  },
  {
    index: "04",
    title: "CV & Career",
    href: "/services#career",
    from: "₦8,000",
    summary:
      "Professional CVs, résumés and profiles written to get you past the first screen.",
    meta: ["ATS aware", "Cover letters", "3 days"],
  },
  {
    index: "05",
    title: "Editing & Formatting",
    href: "/services#editing",
    from: "₦5,000",
    summary:
      "Proofreading, full editing and department-standard formatting for work you have written.",
    meta: ["APA · Harvard · IEEE", "Proofreading", "4 days"],
  },
  {
    index: "06",
    title: "Combos",
    href: "/services#combos",
    from: "₦85,000",
    summary:
      "Bundle proposal, report and defence slides together and pay less than buying separately.",
    meta: ["Best value", "One timeline", "30 days"],
  },
];

export function ServiceList() {
  return (
    <ul className="mt-14 md:mt-20">
      {SERVICES.map((service, i) => (
        <li key={service.index}>
          {/* The only hairlines on the page that repeat — list separators */}
          {i === 0 && <div className="rule" />}

          <Link
            href={service.href}
            className={cn(
              "group relative grid items-baseline gap-x-5 gap-y-2 py-7 outline-none md:py-9",
              "grid-cols-[auto_1fr_auto]",
              "xl:grid-cols-[auto_minmax(0,1fr)_140px_auto_auto]"
            )}
          >
            {/* Tonal wash bleeds past the gutter — no box, no border */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-x-gutter inset-y-0 -z-10 origin-left scale-x-0 bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent opacity-0 transition-all duration-500 ease-editorial group-hover:scale-x-100 group-hover:opacity-100 group-focus-visible:scale-x-100 group-focus-visible:opacity-100"
            />

            {/* Index */}
            <span
              className={cn(
                "index-mark self-start pt-1.5 transition-all duration-400 ease-editorial",
                "text-subtle group-hover:-translate-y-0.5 group-hover:text-primary",
                "group-focus-visible:-translate-y-0.5 group-focus-visible:text-primary"
              )}
            >
              {service.index}
            </span>

            {/* Title + disclosure */}
            <span className="col-start-2 min-w-0">
              <span className="block text-[clamp(1.5rem,3.2vw,2.6rem)] font-medium leading-[1.08] tracking-[-0.03em] text-foreground transition-transform duration-400 ease-editorial group-hover:translate-x-1 group-focus-visible:translate-x-1">
                {service.title}
              </span>

              <span className="mt-2.5 block max-w-measure-lg text-[14.5px] leading-[1.6] text-muted-foreground transition-colors duration-400 group-hover:text-foreground/80 group-focus-visible:text-foreground/80">
                {service.summary}
              </span>

              {/* Metadata only surfaces on intent */}
              <span
                className={cn(
                  "mt-0 flex flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden opacity-0",
                  "max-h-0 transition-all duration-450 ease-editorial",
                  "group-hover:mt-3.5 group-hover:max-h-16 group-hover:opacity-100",
                  "group-focus-visible:mt-3.5 group-focus-visible:max-h-16 group-focus-visible:opacity-100"
                )}
              >
                {service.meta.map((m, mi) => (
                  <span key={m} className="flex items-center gap-3">
                    {mi > 0 && <span className="h-3 w-px bg-hairline/20" />}
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-subtle">
                      {m}
                    </span>
                  </span>
                ))}
              </span>
            </span>

            {/* Reserved preview gutter — empty whitespace until hover */}
            <span
              aria-hidden
              className="col-start-3 row-span-2 hidden self-center xl:block"
            >
              <span
                className={cn(
                  "paper-surface block w-[120px] -rotate-[5deg] rounded-[2px] px-2.5 py-2.5",
                  "translate-x-3 scale-[0.94] opacity-0",
                  "transition-all duration-450 ease-editorial",
                  "group-hover:translate-x-0 group-hover:rotate-[-2.5deg] group-hover:scale-100 group-hover:opacity-100",
                  "group-focus-visible:translate-x-0 group-focus-visible:scale-100 group-focus-visible:opacity-100"
                )}
              >
                <span className="block font-mono text-[7px] uppercase tracking-[0.16em] text-paper-muted">
                  {service.title}
                </span>
                <span className="mt-2 block space-y-[4px]">
                  <span className="block h-[3px] w-full rounded-[1px] bg-paper-ink/[0.14]" />
                  <span className="block h-[3px] w-[88%] rounded-[1px] bg-paper-ink/[0.14]" />
                  <span className="block h-[3px] w-[94%] rounded-[1px] bg-paper-ink/[0.14]" />
                  <span className="block h-[3px] w-[52%] rounded-[1px] bg-primary/60" />
                </span>
              </span>
            </span>

            {/* Price */}
            <span className="col-start-3 row-start-1 self-start pt-1 text-right xl:col-start-4">
              <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
                From
              </span>
              <span className="mt-1 block font-mono text-[15px] tabular-nums tracking-tight text-foreground md:text-[17px]">
                {service.from}
              </span>
            </span>

            {/* Arrow travels in from nothing */}
            <span
              aria-hidden
              className="col-start-3 hidden self-center xl:col-start-5 xl:block"
            >
              <ArrowRight
                className={cn(
                  "h-5 w-5 -translate-x-2 text-primary opacity-0",
                  "transition-all duration-400 ease-editorial",
                  "group-hover:translate-x-0 group-hover:opacity-100",
                  "group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                )}
              />
            </span>

            {/* Accent rule draws across the row on intent */}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-primary/70 transition-transform duration-600 ease-editorial group-hover:scale-x-100 group-focus-visible:scale-x-100"
            />
          </Link>

          <div className="rule" />
        </li>
      ))}
    </ul>
  );
}
