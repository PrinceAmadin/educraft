import { LuScale, LuTriangleAlert } from "react-icons/lu";
import type { ClaudeBurnVsFunding } from "@/lib/services/finance/pots";
import { formatNaira } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Burn against funding — the reconciliation the pot never had. The structure
 * funds the claude_api pot from every project's retained share; Claude burn is
 * logged per call. These are independent series, and the pot once sat at
 * −₦19,643 before anyone noticed. This card reads them side by side and says
 * plainly whether the month's spend is inside what the month's projects funded.
 */
export function BurnVsFundingCard({ data }: { data: ClaudeBurnVsFunding }) {
  const over = data.burnNaira > data.fundedNaira;
  const avgOverBudget = data.avgBurnPerProject > data.fundedPerStandardReport;
  return (
    <section className="rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="burn-funding-heading" data-burn-vs-funding>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="burn-funding-heading" className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <LuScale className="size-4 text-primary" aria-hidden />
          Burn against funding
        </h2>
        <span className="text-xs text-muted-foreground">{data.month} (UTC month, like the buckets)</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <div>
          <dt className="meta-label">Claude burn this month</dt>
          <dd className={cn("mt-1 font-mono text-xl font-medium tabular-nums", over ? "text-danger" : "text-foreground")}>{formatNaira(data.burnNaira)}</dd>
        </div>
        <div>
          <dt className="meta-label">Funded by projects</dt>
          <dd className="mt-1 font-mono text-xl font-medium tabular-nums text-foreground">{formatNaira(data.fundedNaira)}</dd>
        </div>
        <div>
          <dt className="meta-label">Avg burn / project</dt>
          <dd className={cn("mt-1 font-mono text-xl font-medium tabular-nums", avgOverBudget ? "text-danger" : "text-foreground")}>
            {data.projectsWithSpend ? formatNaira(data.avgBurnPerProject) : "—"}
          </dd>
        </div>
        <div>
          <dt className="meta-label">Budget / report</dt>
          <dd className="mt-1 font-mono text-xl font-medium tabular-nums text-foreground">{formatNaira(data.fundedPerStandardReport)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">
        {over ? (
          <span className="inline-flex items-start gap-1.5 text-danger">
            <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Claude spent more this month than the month&apos;s projects put into its pot. The gap comes out of Operations Reserve.
          </span>
        ) : (
          <>Inside budget: this month&apos;s projects funded the pot with more than Claude burned.</>
        )}
        {" "}The per-report budget is what one standard referred {formatNaira(data.referencePrice)} report puts into the claude_api pot under the
        active structure; the average counts every project with any Claude spend this month, reports still mid-generation included.
      </p>
    </section>
  );
}
