import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/settings", label: "General" },
  { href: "/admin/settings/services", label: "Services" },
  { href: "/admin/settings/team", label: "Team" },
] as const;

export function SettingsTabs({ active }: { active: "general" | "services" | "team" }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
      {TABS.map((tab, i) => {
        const key = (["general", "services", "team"] as const)[i];
        const isActive = key === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "min-h-11 shrink-0 rounded-md px-4 py-2 text-center text-sm font-medium leading-[1.75rem] transition-colors",
              isActive
                ? "bg-primary/[0.12] text-primary"
                : "text-muted-foreground hover:bg-elevated hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
