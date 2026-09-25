"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Every page under /admin/ambassadors names itself with one of these keys.
 * The keys map to the Ambassador Platform's eight sections (Phase 3):
 * pages that existed before the platform (applications, slots, schools,
 * Core/Sub lists, tracking, manage, sponsorship) live in a secondary row
 * under the section they belong to, so nothing becomes unreachable.
 */
export type AmbassadorTab =
  | "dashboard"
  | "directory"
  | "applications"
  | "roster"
  | "schools"
  | "core"
  | "sub"
  | "tracking"
  | "manage"
  | "network"
  | "commissions"
  | "leaderboard"
  | "partnerships"
  | "sponsorship"
  | "growth-associates"
  | "content";

type Section = "dashboard" | "ambassadors" | "network" | "commissions" | "leaderboard" | "partnerships" | "growth-associates" | "content";

interface NavItem<K extends string> {
  key: K;
  href: string;
  label: string;
  /** Shorter label on phones. */
  short?: string;
}

/** The spec's order: Dashboard, Ambassadors, Network Map, Commissions, Leaderboard, Partnerships, Growth Associates, Content Hub. */
export const PLATFORM_SECTIONS: NavItem<Section>[] = [
  { key: "dashboard", href: "/admin/ambassadors", label: "Dashboard" },
  { key: "ambassadors", href: "/admin/ambassadors/list", label: "Ambassadors" },
  { key: "network", href: "/admin/ambassadors/network", label: "Network Map", short: "Network" },
  { key: "commissions", href: "/admin/ambassadors/commissions", label: "Commissions" },
  { key: "leaderboard", href: "/admin/ambassadors/leaderboard", label: "Leaderboard" },
  { key: "partnerships", href: "/admin/ambassadors/partnerships", label: "Partnerships" },
  { key: "growth-associates", href: "/admin/ambassadors/growth-associates", label: "Growth Associates", short: "Associates" },
  { key: "content", href: "/admin/ambassadors/content", label: "Content Hub", short: "Content" },
];

const SECONDARY: Partial<Record<Section, NavItem<AmbassadorTab>[]>> = {
  ambassadors: [
    { key: "directory", href: "/admin/ambassadors/list", label: "Directory" },
    { key: "applications", href: "/admin/ambassadors/applications", label: "Applications" },
    { key: "roster", href: "/admin/ambassadors/roster", label: "Slots" },
    { key: "schools", href: "/admin/ambassadors/schools", label: "Schools" },
    { key: "core", href: "/admin/ambassadors/core", label: "Core (ECCA)" },
    { key: "sub", href: "/admin/ambassadors/sub", label: "Sub (ECSA)" },
    { key: "tracking", href: "/admin/ambassadors/tracking", label: "Link tracking" },
    { key: "manage", href: "/admin/ambassadors/manage", label: "Manage slots" },
  ],
  partnerships: [
    { key: "partnerships", href: "/admin/ambassadors/partnerships", label: "Partnerships" },
    { key: "sponsorship", href: "/admin/ambassadors/sponsorship", label: "Sponsorship log" },
  ],
};

const SECTION_OF: Record<AmbassadorTab, Section> = {
  dashboard: "dashboard",
  directory: "ambassadors",
  applications: "ambassadors",
  roster: "ambassadors",
  schools: "ambassadors",
  core: "ambassadors",
  sub: "ambassadors",
  tracking: "ambassadors",
  manage: "ambassadors",
  network: "network",
  commissions: "commissions",
  leaderboard: "leaderboard",
  partnerships: "partnerships",
  sponsorship: "partnerships",
  "growth-associates": "growth-associates",
  content: "content",
};

/** Scrolls a strip sideways (never the page) so its active item is in view on a phone. */
function useCentreActive(ref: React.RefObject<HTMLElement>) {
  React.useEffect(() => {
    const strip = ref.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !active) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
  }, [ref]);
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="rounded-full bg-gold/15 px-1.5 font-mono text-[11px] font-semibold tabular-nums text-gold">{count}</span>;
}

/**
 * The Ambassador Platform's horizontal sub-navigation: the eight sections
 * as a segmented control on a zone, and — for Ambassadors and Partnerships
 * — a quieter second row with the pages inside that section.
 */
export function AmbassadorTabs({ active, pendingApplications = 0 }: { active: AmbassadorTab; pendingApplications?: number }) {
  const section = SECTION_OF[active];
  const secondary = SECONDARY[section];
  const primaryRef = React.useRef<HTMLElement>(null);
  const secondaryRef = React.useRef<HTMLElement>(null);
  useCentreActive(primaryRef);
  useCentreActive(secondaryRef);

  return (
    <div className="space-y-2">
      <nav ref={primaryRef} aria-label="Ambassador Platform" className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1">
        {PLATFORM_SECTIONS.map((s) => {
          const isActive = s.key === section;
          return (
            <Link
              key={s.key}
              href={s.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors sm:px-4",
                isActive ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.short ? (
                <>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </>
              ) : (
                s.label
              )}
              {s.key === "ambassadors" ? <Badge count={pendingApplications} /> : null}
            </Link>
          );
        })}
      </nav>
      {secondary ? (
        <nav ref={secondaryRef} aria-label={`${PLATFORM_SECTIONS.find((s) => s.key === section)?.label} pages`} className="no-scrollbar flex max-w-full gap-1 overflow-x-auto px-1">
          {secondary.map((t) => {
            const isActive = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-zone hover:text-foreground"
                )}
              >
                {t.label}
                {t.key === "applications" ? <Badge count={pendingApplications} /> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
