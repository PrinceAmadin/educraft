import Link from "next/link";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconTransition } from "@/lib/icons";
import {
  formatCount,
  formatPercent,
  formatWatDate,
  RAG_META,
} from "@/lib/command-center/presentation";
import { ragStatus } from "@/lib/command-center/rag";
import type { GrowthPayload, RagStatus, TierPromotion } from "@/lib/command-center/types";
import { cn } from "@/lib/utils";

/**
 * The Growth tab's funnel (Phase 5): three groups of definition rows —
 * acquisition funnel, ambassador activity, school penetration — with no
 * container, separated by spacing and a small heading each. Every row is a
 * Link to the page that lists the figure; numbers are mono, names are not.
 * The activation rate carries a RAG badge against the settings target.
 */

const ROW =
  "-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors duration-fast hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-10";

interface FunnelRow {
  key: string;
  label: string;
  /** One quiet line under the label, e.g. the definition. */
  sub?: string | null;
  value: string;
  /** Numbers and money are mono; a school's abbreviation is plain text. */
  mono?: boolean;
  /** A small line under the value, right-aligned. */
  valueSub?: React.ReactNode;
  badge?: React.ReactNode;
  href: string;
}

function RagBadge({ status }: { status: RagStatus }) {
  const meta = RAG_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.badge} className="shrink-0">
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

function Row({ row }: { row: FunnelRow }) {
  const mono = row.mono ?? true;
  return (
    <li>
      <Link href={row.href} className={ROW}>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{row.label}</p>
          {row.sub ? <p className="mt-0.5 text-xs text-subtle">{row.sub}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.badge}
          <div className="text-right">
            <p
              className={cn(
                "text-sm font-medium text-foreground",
                mono && "font-mono tabular-nums"
              )}
            >
              {row.value}
            </p>
            {row.valueSub ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{row.valueSub}</p>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

function Group({
  title,
  rows,
  children,
}: {
  title: string;
  rows: FunnelRow[];
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="mt-1 divide-y divide-border/70">
        {rows.map((row) => (
          <Row key={row.key} row={row} />
        ))}
      </ul>
      {children}
    </div>
  );
}

function plural(n: number, noun: string): string {
  return `${formatCount(n)} ${n === 1 ? noun : `${noun}s`}`;
}

function acquisitionRows(funnel: GrowthPayload["funnel"], links: GrowthPayload["links"]): FunnelRow[] {
  const share =
    funnel.projectsCreated > 0
      ? Math.round((funnel.channel.ambassadorDriven / funnel.projectsCreated) * 100)
      : null;
  const logged = funnel.referralSource === "referrals";
  return [
    {
      key: "referrals",
      label: "Referrals",
      sub: logged ? "Referrals logged this month, by the HOG or at intake" : "Clients who came through an ambassador",
      value: formatCount(funnel.referrals),
      href: logged ? links.platform : "/admin/clients",
    },
    {
      key: "conversions",
      label: "Conversions",
      sub: "Referred clients who paid a downpayment",
      value: formatCount(funnel.conversions),
      href: links.leaderboard,
    },
    {
      key: "rate",
      label: "Conversion rate",
      sub: funnel.referrals === 0 ? "No referrals this month yet" : "Conversions ÷ referrals",
      value: formatPercent(funnel.conversionRate, 1),
      href: links.platform,
    },
    {
      key: "projects",
      label: "Projects created",
      value: formatCount(funnel.projectsCreated),
      href: "/admin/projects",
    },
    {
      key: "ambassador-driven",
      label: "Ambassador-driven",
      sub: share === null ? null : `${share}% of new projects`,
      value: formatCount(funnel.channel.ambassadorDriven),
      href: "/admin/projects",
    },
    {
      key: "direct",
      label: "Direct",
      sub: "No ambassador on the order",
      value: formatCount(funnel.channel.direct),
      href: "/admin/projects",
    },
  ];
}

function activityRows(stats: GrowthPayload["ambassadorStats"]): FunnelRow[] {
  // The same rule and thresholds as the Health scorecard and the Today alert: watch between the two levels.
  const amber = stats.activationAmber ?? stats.activationTarget;
  const status = ragStatus("higher", stats.activationRate, stats.activationTarget, amber);
  return [
    {
      key: "total",
      label: "Ambassadors",
      sub: "Not suspended or terminated",
      value: formatCount(stats.total),
      href: "/admin/ambassadors",
    },
    {
      key: "active",
      label: "Account active",
      value: formatCount(stats.active),
      href: "/admin/ambassadors",
    },
    {
      key: "active-month",
      label: "Active this month",
      sub: "Converted a client in the last 30 days",
      value: formatCount(stats.activeThisMonth),
      href: "/admin/ambassadors",
    },
    {
      key: "activation",
      label: "Activation rate",
      sub: amber < stats.activationTarget
        ? `Target ≥${stats.activationTarget}% · watch below ${amber}%`
        : `Target ≥${stats.activationTarget}%`,
      value: formatPercent(stats.activationRate),
      badge: <RagBadge status={status} />,
      href: "/admin/ambassadors",
    },
    {
      key: "new",
      label: "Joined this month",
      value: formatCount(stats.newThisMonth),
      href: "/admin/ambassadors",
    },
  ];
}

function schoolRows(schools: GrowthPayload["schoolPenetration"]): FunnelRow[] {
  const top = schools.topSchool;
  const newest = schools.newestSchool;
  return [
    {
      key: "count",
      label: "Schools with conversions",
      sub: "All time, by the client's university",
      value: formatCount(schools.count),
      href: "/admin/ambassadors/schools",
    },
    {
      key: "top",
      label: "Top school",
      sub: top?.name ?? "No conversions yet",
      value: top ? top.abbreviation : "—",
      mono: !top,
      valueSub: top ? plural(top.conversions, "conversion") : null,
      href: "/admin/ambassadors/schools",
    },
    {
      key: "newest",
      label: "Newest school",
      sub: newest?.name ?? "No conversions yet",
      value: newest ? newest.abbreviation : "—",
      mono: !newest,
      valueSub: newest?.since ? `Since ${formatWatDate(newest.since)}` : null,
      href: "/admin/ambassadors/schools",
    },
  ];
}

function Promotions({ promotions }: { promotions: TierPromotion[] }) {
  return (
    <div className="mt-5">
      <p className="meta-label">Tier promotions this month</p>
      {promotions.length === 0 ? (
        <p className="mt-1 py-2 text-sm text-muted-foreground">None recorded yet</p>
      ) : (
        <ul className="mt-1 divide-y divide-border/70">
          {promotions.map((p) => (
            <li key={`${p.ambassadorId}:${p.at}`}>
              <Link href={p.href} className={cn(ROW, "items-start")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{p.name}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <TierBadge tier={p.from} />
                    <IconTransition className="size-3 shrink-0 text-subtle" aria-hidden />
                    <span className="sr-only">to</span>
                    <TierBadge tier={p.to} />
                  </div>
                </div>
                <time
                  dateTime={p.at}
                  className="shrink-0 whitespace-nowrap pt-0.5 font-mono text-xs tabular-nums text-subtle"
                >
                  {formatWatDate(p.at)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Funnel({ data }: { data: GrowthPayload }) {
  return (
    <section aria-labelledby="cc-growth-funnel" className="min-w-0">
      <div className="min-w-0">
        <h2 id="cc-growth-funnel" className="text-[15px] font-semibold leading-tight text-foreground">
          Growth funnel
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {data.monthLabel} · from referral to paying client
        </p>
      </div>

      <div className="mt-4 grid gap-8 lg:grid-cols-3 lg:gap-x-10">
        <Group title="Acquisition funnel" rows={acquisitionRows(data.funnel, data.links)} />
        <Group title="Ambassador activity" rows={activityRows(data.ambassadorStats)}>
          <Promotions promotions={data.ambassadorStats.tierPromotions} />
        </Group>
        <Group title="School penetration" rows={schoolRows(data.schoolPenetration)} />
      </div>
    </section>
  );
}

export function FunnelSkeleton() {
  const rows = [6, 5, 3];
  return (
    <div className="min-w-0" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-52" />
      <div className="mt-4 grid gap-8 lg:grid-cols-3 lg:gap-x-10">
        {rows.map((count, g) => (
          <div key={g}>
            <Skeleton className="h-3.5 w-36" />
            <div className="mt-1 space-y-1">
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex min-h-12 items-center justify-between gap-3 py-2 sm:min-h-10">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3.5 w-10" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
