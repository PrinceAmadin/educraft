import Link from "next/link";
import { canAccessRoute } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "general", href: "/admin/settings", label: "General" },
  { key: "services", href: "/admin/settings/services", label: "Services" },
  { key: "team", href: "/admin/settings/team", label: "Team & roles" },
  { key: "bank", href: "/admin/settings/bank", label: "Bank details" },
] as const;

export type SettingsTab = (typeof TABS)[number]["key"];

/**
 * Segmented control on a zone — the active tab lifts as a surface. Only the
 * tabs this role may open are offered (an executive sees just Bank details,
 * and then no control at all: one tab is not a choice).
 */
export function SettingsTabs({ active, role }: { active: SettingsTab; role: string | undefined | null }) {
  const tabs = TABS.filter((tab) => canAccessRoute(role, tab.href));
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="Settings sections" className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-medium transition-colors",
              isActive ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
