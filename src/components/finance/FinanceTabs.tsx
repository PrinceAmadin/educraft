"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface FinanceTab {
  href: string;
  label: string;
  /** Phone label, when the full one is long. */
  short?: string;
}

/**
 * The Finance Platform's sub-navigation, under the topbar on every
 * /admin/finance page: a segmented control on a zone that scrolls sideways
 * on phones with the active tab brought into view. The layout decides which
 * tabs a role gets (the COO sees only Payouts).
 */
export function FinanceTabs({ tabs }: { tabs: FinanceTab[] }) {
  const pathname = usePathname();
  const active = tabs.reduce<FinanceTab | null>((best, t) => {
    const hit = pathname === t.href || pathname.startsWith(`${t.href}/`);
    return hit && (!best || t.href.length > best.href.length) ? t : best;
  }, null);
  const ref = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active?.href]);

  if (tabs.length <= 1) return null;

  return (
    <nav ref={ref} aria-label="Finance sections" className="no-scrollbar -mx-4 flex max-w-[100vw] gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-xl bg-zone p-1">
        {tabs.map((tab) => {
          const isActive = active?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                isActive ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.short ? (
                <>
                  <span className="sm:hidden">{tab.short}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : (
                tab.label
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
