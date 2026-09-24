import Link from "next/link";
import type { BucketHealthLevel } from "@/lib/finance/commission-config";
import type { BucketCard } from "@/lib/services/finance/buckets";
import { cn, formatNaira } from "@/lib/utils";

const BAR: Record<BucketHealthLevel, string> = { healthy: "bg-success", monitor: "bg-gold", attention: "bg-danger" };
const TEXT: Record<BucketHealthLevel, string> = { healthy: "text-success", monitor: "text-gold", attention: "text-danger" };
const LABEL: Record<BucketHealthLevel, string> = { healthy: "Healthy", monitor: "Monitor", attention: "Needs attention" };

/** The four buckets at a glance — balance, bar, health — each linking to the Bucket manager. */
export function BucketHealthGrid({ cards }: { cards: BucketCard[] }) {
  return (
    <section aria-labelledby="buckets-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="buckets-heading" className="text-[15px] font-semibold text-foreground">
          Bucket health
        </h2>
        <Link href="/admin/finance/buckets" className="text-[13px] font-medium text-primary hover:underline">
          Bucket manager
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.bucket} href={`/admin/finance/buckets?bucket=${c.bucket}`} className="group/bucket min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="truncate text-[13px] font-medium text-muted-foreground group-hover/bucket:text-foreground">{c.label}</p>
            <p className="mt-1 font-mono text-xl font-medium tabular-nums text-foreground">{formatNaira(c.balance)}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated" role="img" aria-label={`${c.health.percent}% of target`}>
              <div className={cn("h-full rounded-full", BAR[c.health.level])} style={{ width: `${c.health.percent}%` }} />
            </div>
            <p className="mt-1 flex items-center justify-between text-xs">
              <span className={cn("font-medium", TEXT[c.health.level])}>{LABEL[c.health.level]}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{c.health.percent}%</span>
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
