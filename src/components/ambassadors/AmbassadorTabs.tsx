import Link from "next/link";
import { cn } from "@/lib/utils";

export type AmbassadorTab = "list" | "tracking" | "applications" | "schools";

/** `short` is the phone label, so all four tabs fit at 375px. */
const TABS: { key: AmbassadorTab; href: string; label: string; short?: string }[] = [
  { key: "list", href: "/admin/ambassadors", label: "Ambassadors", short: "All" },
  { key: "tracking", href: "/admin/ambassadors/tracking", label: "Tracking" },
  { key: "applications", href: "/admin/ambassadors/applications", label: "Applications" },
  { key: "schools", href: "/admin/ambassadors/schools", label: "Schools" },
];

/**
 * The ambassador section's views — what the original panel had as its own
 * tab bar, as a segmented control on a zone like Settings.
 */
export function AmbassadorTabs({
  active,
  pendingApplications = 0,
}: {
  active: AmbassadorTab;
  pendingApplications?: number;
}) {
  return (
    <nav
      aria-label="Ambassador sections"
      className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors sm:px-4",
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
            {tab.key === "applications" && pendingApplications > 0 ? (
              <span className="rounded-full bg-gold/15 px-1.5 font-mono text-[11px] font-semibold tabular-nums text-gold">
                {pendingApplications}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
