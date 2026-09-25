import Link from "next/link";
import { LuArrowRight, LuCircleAlert, LuInfo, LuZap } from "react-icons/lu";
import type { AttentionCounts, TierSlice } from "@/lib/services/ambassador-platform/dashboard";
import { tierCaption } from "@/lib/services/ambassador-platform/dashboard";
import { TIER_BADGE } from "@/lib/ambassador";
import { cn } from "@/lib/utils";

/** Second row: how the network splits across the four tiers, each with its share bar. */
export function TierBreakdown({ tiers, total }: { tiers: TierSlice[]; total: number }) {
  return (
    <section aria-label="Tier breakdown" className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4 lg:gap-x-10">
      {tiers.map((t) => (
        <Link key={t.tier} href={`/admin/ambassadors/list?tier=${t.tier}`} className="group/tier -m-2.5 block min-w-0 rounded-xl p-2.5 transition-colors hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", TIER_BADGE[t.tier])}>{t.label}</span>
            <span className="font-mono text-xl font-medium tabular-nums text-foreground">{t.count}</span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total > 0 ? t.percent : 0}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t.percent}% of the network · {tierCaption(t.tier)}
          </p>
        </Link>
      ))}
    </section>
  );
}

interface Line {
  tone: "warn" | "boost" | "info";
  text: string;
  href: string;
  cta: string;
}

function n(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** Third row: who needs a hand this week, each line pointing at the filtered directory. */
export function AttentionPanel({ attention }: { attention: AttentionCounts }) {
  const lines: Line[] = [];
  if (attention.inactive60 > 0) lines.push({ tone: "warn", text: `${n(attention.inactive60, "ambassador")} ${attention.inactive60 === 1 ? "hasn't" : "haven't"} converted a referral in 60+ days`, href: "/admin/ambassadors/list?status=INACTIVE", cta: "View inactive" });
  if (attention.nearPromotion > 0) lines.push({ tone: "boost", text: `${n(attention.nearPromotion, "ambassador")} approaching a tier promotion (within 2 conversions)`, href: "/admin/ambassadors/list?near=1", cta: "View near-promotion" });
  if (attention.platinumBonus > 0) lines.push({ tone: "boost", text: `${n(attention.platinumBonus, "Platinum ambassador")} eligible for the quarterly bonus payout`, href: "/admin/ambassadors/list?tier=PLATINUM", cta: "View Platinum" });
  if (attention.readySubTeams > 0) lines.push({ tone: "info", text: `${n(attention.readySubTeams, "ambassador")} ready to activate a sub-team (Silver+, no Subs yet)`, href: "/admin/ambassadors/list?ready=1", cta: "View ready" });
  if (attention.renewalsDue > 0) lines.push({ tone: "warn", text: `${n(attention.renewalsDue, "partnership")} due for renewal (within 30 days or overdue)`, href: "/admin/ambassadors/partnerships", cta: "View partnerships" });

  return (
    <section aria-labelledby="attention-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
      <h2 id="attention-heading" className="text-[15px] font-semibold text-foreground">
        Needs attention
      </h2>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing waiting: everyone is active, no promotions are pending and no bonus is due.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70">
          {lines.map((l) => (
            <li key={l.text} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="flex min-w-0 items-start gap-2 text-sm text-foreground">
                {l.tone === "warn" ? <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /> : l.tone === "boost" ? <LuZap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <LuInfo className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />}
                <span className={cn(l.tone === "info" && "text-muted-foreground")}>{l.text}</span>
              </span>
              <Link href={l.href} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                {l.cta}
                <LuArrowRight className="size-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
