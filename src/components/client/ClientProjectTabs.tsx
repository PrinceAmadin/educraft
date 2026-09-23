import Link from "next/link";
import { LuActivity, LuFileText, LuMessageCircle, LuWallet } from "react-icons/lu";
import type { IconType } from "react-icons";
import { cn } from "@/lib/utils";

/**
 * The tabs of a client's project page. Links (?tab=), so the server renders
 * only the open tab. On phones every tab is an equal column (icon over a short
 * label) so all of them fit a 320px screen without sideways scrolling; from
 * `sm` up it is the usual segmented bar. Requirements joins when it ships.
 */
export const CLIENT_TABS = [
  { key: "progress", label: "Progress", icon: LuActivity },
  { key: "documents", label: "Documents", icon: LuFileText },
  { key: "payments", label: "Payments", icon: LuWallet },
  { key: "messages", label: "Messages", icon: LuMessageCircle },
] as const satisfies readonly { key: string; label: string; icon: IconType }[];

export type ClientTabKey = (typeof CLIENT_TABS)[number]["key"];

export function parseClientTab(v: string | undefined): ClientTabKey {
  return (CLIENT_TABS.find((t) => t.key === v)?.key ?? "progress") as ClientTabKey;
}

export function ClientProjectTabs({
  basePath,
  active,
  badges = {},
}: {
  /** The page the tabs live on (the client's project page, or the admin preview). */
  basePath: string;
  active: ClientTabKey;
  /** A number shows a gold count; "dot" shows a small marker (e.g. balance due). */
  badges?: Partial<Record<ClientTabKey, number | "dot">>;
}) {
  const base = basePath;
  return (
    <nav
      aria-label="Project sections"
      className="sticky top-16 z-20 -mx-4 bg-background/85 px-4 py-2 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
    >
      <div
        className="grid gap-1 rounded-xl bg-zone p-1 sm:inline-flex sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${CLIENT_TABS.length}, minmax(0, 1fr))` }}
      >
        {CLIENT_TABS.map((t) => {
          const Icon = t.icon;
          const badge = badges[t.key];
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.key === "progress" ? base : `${base}?tab=${t.key}`}
              scroll={false}
              replace
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-medium transition-colors sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
                isActive ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <Icon className="size-5 sm:size-4" aria-hidden />
                {badge === "dot" ? (
                  <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-gold sm:hidden" aria-hidden />
                ) : null}
              </span>
              <span>{t.label}</span>
              {typeof badge === "number" && badge > 0 ? (
                <span className="absolute right-1.5 top-1 min-w-5 rounded-full bg-gold px-1.5 text-center text-[11px] font-semibold leading-5 text-gold-foreground sm:static sm:ml-0.5">
                  {badge > 9 ? "9+" : badge}
                  <span className="sr-only"> new</span>
                </span>
              ) : null}
              {badge === "dot" ? <span className="hidden size-2 rounded-full bg-gold sm:inline-block" aria-hidden /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
