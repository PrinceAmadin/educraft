import Link from "next/link";
import { cn } from "@/lib/utils";

export type RevenueView = "payments" | "outstanding";

/** The tracker's two views, as a segmented control on a zone (same as the ambassador tabs). */
export function RevenueViewTabs({ active, outstandingCount = 0 }: { active: RevenueView; outstandingCount?: number }) {
  const tabs: { key: RevenueView; href: string; label: string }[] = [
    { key: "payments", href: "/admin/finance/revenue", label: "Payments" },
    { key: "outstanding", href: "/admin/finance/revenue?view=outstanding", label: "Outstanding balances" },
  ];
  return (
    <nav aria-label="Revenue views" className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors sm:px-4",
              isActive ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.key === "outstanding" && outstandingCount > 0 ? (
              <span className="rounded-full bg-gold/15 px-1.5 font-mono text-[11px] font-semibold tabular-nums text-gold">
                {outstandingCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
