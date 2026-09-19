import Link from "next/link";
import { cn } from "@/lib/utils";

export const LINK_TABS = [
  { key: "overview", label: "Overview" },
  { key: "analytics", label: "Analytics" },
  { key: "quality", label: "Quality" },
  { key: "history", label: "History" },
  { key: "log", label: "Raw log" },
] as const;

export type LinkTab = (typeof LINK_TABS)[number]["key"];

export function parseLinkTab(v: string | undefined): LinkTab {
  return (LINK_TABS.find((t) => t.key === v)?.key ?? "overview") as LinkTab;
}

/** Segmented control on a zone, same look as the admin ambassador tabs. */
export function LinkTabs({
  active,
  basePath,
  extraParams,
}: {
  active: LinkTab;
  basePath: string;
  /** Kept on every tab link (the admin view's `view`, `from` and `to`). */
  extraParams?: Record<string, string | undefined>;
}) {
  const hrefFor = (tab: LinkTab) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) if (v) q.set(k, v);
    if (tab !== "overview") q.set("tab", tab);
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav
      aria-label="Link analytics sections"
      className="no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zone p-1"
    >
      {LINK_TABS.map((t) => (
        <Link
          key={t.key}
          href={hrefFor(t.key)}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors sm:px-4",
            t.key === active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
