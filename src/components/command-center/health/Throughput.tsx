import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/command-center/presentation";
import type { Throughput as ThroughputData } from "@/lib/command-center/types";
import { formatNaira } from "@/lib/utils";

/**
 * Throughput (Phase 5): three zone blocks — all time, this year, this month —
 * each a short list of label / mono value rows. Every row is a Link to the
 * page that lists what it counts. Zones only: no card, no border.
 */

interface ThroughputRow {
  key: string;
  label: string;
  value: string;
  href: string;
}

interface ThroughputBlock {
  key: string;
  title: string;
  rows: ThroughputRow[];
}

function blocksFor(t: ThroughputData): ThroughputBlock[] {
  return [
    {
      key: "all-time",
      title: "All time",
      rows: [
        { key: "projects", label: "Projects", value: formatCount(t.allTime.projects), href: "/admin/projects" },
        { key: "workers", label: "Active workers", value: formatCount(t.allTime.workers), href: "/admin/workers" },
        { key: "schools", label: "Schools served", value: formatCount(t.allTime.schools), href: "/admin/clients" },
      ],
    },
    {
      key: "this-year",
      title: "This year",
      rows: [
        { key: "projects", label: "Projects", value: formatCount(t.thisYear.projects), href: "/admin/projects" },
        { key: "revenue", label: "Revenue", value: formatNaira(t.thisYear.revenue), href: "/admin/finance/revenue" },
        { key: "clients", label: "New clients", value: formatCount(t.thisYear.clients), href: "/admin/clients" },
      ],
    },
    {
      key: "this-month",
      title: "This month",
      rows: [
        { key: "projects", label: "Projects", value: formatCount(t.thisMonth.projects), href: "/admin/projects" },
        { key: "revenue", label: "Revenue", value: formatNaira(t.thisMonth.revenue), href: "/admin/finance/revenue" },
        { key: "clients", label: "New clients", value: formatCount(t.thisMonth.clients), href: "/admin/clients" },
      ],
    },
  ];
}

export function Throughput({ throughput }: { throughput: ThroughputData }) {
  const blocks = blocksFor(throughput);

  return (
    <section aria-labelledby="cc-health-throughput" className="min-w-0">
      <h2 id="cc-health-throughput" className="text-[15px] font-semibold leading-tight text-foreground">
        Throughput
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        What has moved through EduCraft, from the first project to this month.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {blocks.map((block) => (
          <div key={block.key} className="min-w-0 rounded-2xl bg-zone px-4 py-4 sm:px-5 sm:py-5">
            <h3 className="text-sm font-medium text-muted-foreground">{block.title}</h3>
            <ul className="mt-2">
              {block.rows.map((row) => (
                <li key={row.key}>
                  <Link
                    href={row.href}
                    className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 text-sm sm:min-h-11 transition-colors duration-fast hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">{row.label}</span>
                    <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">{row.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ThroughputSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, b) => (
          <div key={b} className="rounded-2xl bg-zone px-4 py-4 sm:px-5 sm:py-5">
            <Skeleton className="h-3.5 w-20 bg-card/70" />
            <div className="mt-3 space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-24 bg-card/70" />
                  <Skeleton className="h-3.5 w-14 bg-card/70" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
