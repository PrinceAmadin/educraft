import type { BucketType } from "@prisma/client";
import { bucketShareOfRevenue, type BucketHealthLevel } from "@/lib/finance/commission-config";
import type { BucketCard as BucketCardData } from "@/lib/services/finance/buckets";
import type { GrowthFundQuarter } from "@/lib/services/finance/surplus";
import { cn, formatNaira } from "@/lib/utils";

const LEVEL_BAR: Record<BucketHealthLevel, string> = {
  healthy: "bg-success",
  monitor: "bg-gold",
  attention: "bg-danger",
};
const LEVEL_TEXT: Record<BucketHealthLevel, string> = {
  healthy: "text-success",
  monitor: "text-gold",
  attention: "text-danger",
};
const LEVEL_LABEL: Record<BucketHealthLevel, string> = {
  healthy: "Healthy",
  monitor: "Monitor",
  attention: "Needs attention",
};

function pct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

export interface BucketExtras {
  sponsorship: GrowthFundQuarter;
  founderDrawsPaidThisMonth: number;
}

/**
 * The four buckets, one soft surface each: balance against its target, a
 * health bar, the month's flow and what the bucket is for. Balances are
 * all-time; inflow and outflow belong to the month shown.
 */
export function BucketCards({ cards, extras }: { cards: BucketCardData[]; extras: BucketExtras }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cards.map((c) => (
        <BucketCard key={c.bucket} card={c} extras={extras} />
      ))}
    </div>
  );
}

function BucketCard({ card, extras }: { card: BucketCardData; extras: BucketExtras }) {
  const { health } = card;
  return (
    <section aria-labelledby={`bucket-${card.bucket}`} className="surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`bucket-${card.bucket}`} className="text-[15px] font-semibold text-foreground">
            {card.label}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pct(card.shareOfRetained)} of retained share · {pct(bucketShareOfRevenue(card.bucket as BucketType))} of revenue
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block font-mono text-xl font-medium tabular-nums text-foreground">{formatNaira(card.balance)}</span>
          <span className="block text-xs text-muted-foreground">of ~{formatNaira(health.target, { compact: true })}</span>
        </p>
      </div>

      <div className="mt-4" role="img" aria-label={`${health.percent}% of target`}>
        <div className="h-2 overflow-hidden rounded-full bg-elevated">
          <div className={cn("h-full rounded-full transition-[width]", LEVEL_BAR[health.level])} style={{ width: `${health.percent}%` }} />
        </div>
        <p className="mt-1.5 flex items-center justify-between text-xs">
          <span className={cn("font-medium", LEVEL_TEXT[health.level])}>
            {LEVEL_LABEL[health.level]}
            <span className="font-normal text-muted-foreground"> · target {health.rule}</span>
          </span>
          <span className="font-mono tabular-nums text-muted-foreground">{health.percent}%</span>
        </p>
      </div>

      <p className="mt-4 text-[13px] text-muted-foreground">{card.purpose}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div>
          <dt className="text-muted-foreground">Inflow this month</dt>
          <dd className="font-mono tabular-nums text-foreground">{formatNaira(card.month.inflow)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{card.bucket === "FOUNDER_DISTRIBUTION" ? "Out this month" : "Outflow this month"}</dt>
          <dd className="font-mono tabular-nums text-foreground">{formatNaira(card.month.outflow)}</dd>
        </div>
        {card.bucket === "GROWTH_FUND" ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground">HOG sponsorship budget, {extras.sponsorship.quarter.label}</dt>
            <dd className={cn("font-mono tabular-nums", extras.sponsorship.remaining < 0 ? "text-danger" : "text-foreground")}>
              {formatNaira(extras.sponsorship.remaining)} remaining of {formatNaira(extras.sponsorship.budget)}
            </dd>
          </div>
        ) : null}
        {card.bucket === "FOUNDER_DISTRIBUTION" ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Founder draws paid this month</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {formatNaira(extras.founderDrawsPaidThisMonth)}
              {extras.founderDrawsPaidThisMonth === 0 ? <span className="ml-1 font-sans text-muted-foreground">— the balance builds toward the semester bonus</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
