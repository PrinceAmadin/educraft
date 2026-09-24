import Link from "next/link";
import { cn } from "@/lib/utils";

export type AmbassadorTab = "dashboard" | "roster" | "directory" | "commissions" | "leaderboard" | "schools" | "core" | "sub" | "applications" | "tracking" | "sponsorship" | "manage";

/** `short` is the phone label, so the seven tabs scroll less at 375px. */
const TABS: { key: AmbassadorTab; href: string; label: string; short?: string }[] = [
  { key: "dashboard", href: "/admin/ambassadors", label: "Dashboard" },
  { key: "directory", href: "/admin/ambassadors/list", label: "Directory" },
  { key: "roster", href: "/admin/ambassadors/roster", label: "Slots" },
  { key: "commissions", href: "/admin/ambassadors/commissions", label: "Commissions" },
  { key: "leaderboard", href: "/admin/ambassadors/leaderboard", label: "Leaderboard" },
  { key: "schools", href: "/admin/ambassadors/schools", label: "Schools" },
  { key: "core", href: "/admin/ambassadors/core", label: "Core (ECCA)", short: "Core" },
  { key: "sub", href: "/admin/ambassadors/sub", label: "Sub (ECSA)", short: "Sub" },
  { key: "applications", href: "/admin/ambassadors/applications", label: "Applications", short: "Apps" },
  { key: "tracking", href: "/admin/ambassadors/tracking", label: "Tracking" },
  { key: "sponsorship", href: "/admin/ambassadors/sponsorship", label: "Sponsorship" },
  { key: "manage", href: "/admin/ambassadors/manage", label: "Manage" },
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
