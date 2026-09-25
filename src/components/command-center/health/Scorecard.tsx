import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RAG_META } from "@/lib/command-center/presentation";
import type { ScorecardDomain, ScorecardRow } from "@/lib/command-center/types";
import { IconArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The Business health scorecard (Phase 5): every tracked metric against its
 * target, grouped by domain, with a red/amber/green badge that always
 * carries an icon and a word — never colour alone.
 *
 * From md it is a borderless table with faint dividers (the table is the
 * content, no container). On phones each metric is a divided Link row
 * showing "actual / target" in mono and the badge, because a five-column
 * table cannot fit 375px without sideways scrolling.
 */

const DOMAIN_ORDER: readonly ScorecardDomain[] = ["OPERATIONS", "GROWTH", "FINANCE", "QUALITY"];

const DOMAIN_LABELS: Record<ScorecardDomain, string> = {
  OPERATIONS: "Operations",
  GROWTH: "Growth",
  FINANCE: "Finance",
  QUALITY: "Quality",
};

function groupByDomain(rows: ScorecardRow[]): { domain: ScorecardDomain; rows: ScorecardRow[] }[] {
  return DOMAIN_ORDER.map((domain) => ({
    domain,
    rows: rows.filter((r) => r.domain === domain),
  })).filter((g) => g.rows.length > 0);
}

function RagBadge({ status }: { status: ScorecardRow["status"] }) {
  const meta = RAG_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.badge} className="whitespace-nowrap">
      <Icon className="size-3 shrink-0" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function Scorecard({ rows }: { rows: ScorecardRow[] }) {
  const groups = groupByDomain(rows);

  return (
    <section aria-labelledby="cc-health-scorecard" className="min-w-0">
      <h2 id="cc-health-scorecard" className="text-[15px] font-semibold leading-tight text-foreground">
        Scorecard
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Each part of the business against its target. Open a metric to see where the figure comes from.
      </p>

      {groups.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing to score yet
        </p>
      ) : (
        <>
          {/* Phones: one divided list per domain, each metric a tappable row. */}
          <div className="mt-2 space-y-6 md:hidden">
            {groups.map((group) => (
              <div key={group.domain}>
                <p className="meta-label">{DOMAIN_LABELS[group.domain]}</p>
                <ul className="mt-1 divide-y divide-border/70">
                  {group.rows.map((row) => (
                    <li key={row.key}>
                      <Link
                        href={row.href}
                        className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{row.metric}</p>
                          {row.note ? (
                            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{row.note}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <p className="font-mono text-sm tabular-nums">
                            <span className={row.actual === null ? "text-muted-foreground" : "text-foreground"}>
                              {row.actualLabel}
                            </span>
                            <span className="text-subtle"> / {row.targetLabel}</span>
                          </p>
                          <RagBadge status={row.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* md and up: the table is the content — no container, faint dividers. */}
          <div className="mt-3 hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Metric
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Actual
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Target
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.domain} className="divide-y divide-border/70">
                  <tr>
                    <th scope="rowgroup" colSpan={4} className="pb-1.5 pt-5 text-left">
                      <span className="meta-label">{DOMAIN_LABELS[group.domain]}</span>
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    // The metric link is stretched over the whole row, so any cell opens it.
                    <tr key={row.key} className="group/row relative transition-colors hover:bg-zone/70">
                      <td className="py-3 pr-3">
                        <Link
                          href={row.href}
                          className="inline-flex items-center gap-1.5 rounded-md font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {row.metric}
                          <IconArrowRight
                            className="size-3 text-subtle opacity-0 transition-opacity group-hover/row:opacity-100"
                            aria-hidden
                          />
                        </Link>
                        {row.note ? (
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{row.note}</p>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          "py-3 pr-3 text-right font-mono tabular-nums",
                          row.actual === null ? "text-muted-foreground" : "text-foreground"
                        )}
                      >
                        {row.actualLabel}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                        {row.targetLabel}
                      </td>
                      <td className="py-3">
                        <RagBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function ScorecardSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      <div className="mt-4 space-y-6">
        {Array.from({ length: 3 }, (_, g) => (
          <div key={g}>
            <Skeleton className="h-3 w-20" />
            <div className="mt-2 divide-y divide-border/70">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex min-h-12 items-center justify-between gap-3 py-3">
                  <Skeleton className="h-3.5 w-40 max-w-[50%]" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
