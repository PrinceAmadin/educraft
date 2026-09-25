import Link from "next/link";
import { IconArrowRight } from "@/lib/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { ALERT_KIND_ICON, SEVERITY_STYLES } from "@/lib/command-center/presentation";
import type { CcAlert, TodayPayload } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";

/**
 * "Needs attention" — the Today tab's alert list (Phase 5).
 *
 * Renders nothing at all when there is no alert: a quiet page is the good
 * news, so there is no empty-state line to read past. Critical rows come
 * first (danger bubble), then attention rows (gold bubble); every row is a
 * Link to the filtered page where the problem lives, with the payload's own
 * link label trailing it.
 */
export function AlertsSection({ alerts }: { alerts: TodayPayload["alerts"] }) {
  const rows = [...alerts.critical, ...alerts.attention];
  if (rows.length === 0) return null;

  const summary = [
    alerts.critical.length > 0 ? `${alerts.critical.length} critical` : null,
    alerts.attention.length > 0 ? `${alerts.attention.length} to watch` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-labelledby="cc-today-alerts" className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="cc-today-alerts" className="text-[15px] font-semibold leading-tight text-foreground">
            Needs attention — {rows.length} {rows.length === 1 ? "item" : "items"}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{summary}</p>
        </div>
      </div>

      <ul className="mt-2 divide-y divide-border/70">
        {rows.map((alert) => (
          <li key={alert.key}>
            <AlertRow alert={alert} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlertRow({ alert }: { alert: CcAlert }) {
  const styles = SEVERITY_STYLES[alert.severity];
  const Icon = ALERT_KIND_ICON[alert.kind];
  return (
    <Link
      href={alert.href}
      className="-mx-2 flex min-h-12 items-start gap-3 rounded-lg px-2 py-3 transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className={cn("mt-0.5 shrink-0 rounded-md p-1.5", styles.icon)}>
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{alert.severity === "critical" ? "Critical" : "Attention"}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{alert.title}</span>
        {alert.detail ? (
          <span className="mt-0.5 block text-[13px] text-muted-foreground">{alert.detail}</span>
        ) : null}
        {alert.meta ? <span className="mt-1 block text-xs text-subtle">{alert.meta}</span> : null}
      </span>
      {/* Phones give the title the full width: the whole row is the link, so only the arrow shows there. */}
      <span className="inline-flex shrink-0 items-center gap-1 self-center whitespace-nowrap text-[13px] font-medium text-primary">
        <span className="sr-only sm:not-sr-only">{alert.hrefLabel}</span>
        <IconArrowRight className="size-4 sm:size-3" aria-hidden />
      </span>
    </Link>
  );
}

export function AlertsSectionSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-2 h-3 w-24" />
      <div className="mt-3 space-y-1">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex min-h-12 items-start gap-3 py-3">
            <Skeleton className="size-7 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
