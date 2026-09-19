import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { RevenueBarChart } from "@/components/finance/RevenueBarChart";
import { AiBalanceCard, AiProjectSearch, AiSpendChart, AiWorkersTable } from "@/components/finance/AiUsage";
import {
  USAGE_PERIODS,
  getCreditBalance,
  getUsageAnomalies,
  getUsageBySubsystem,
  getUsageByWorker,
  getUsageSummary,
  parsePeriod,
} from "@/lib/services/ai-usage";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "AI usage" };
export const dynamic = "force-dynamic";

const PERIOD_LABEL = { today: "Today", week: "This week", month: "This month", year: "This year" } as const;
const num = (n: number) => new Intl.NumberFormat("en-NG").format(n);

export default async function AiUsagePage({ searchParams }: { searchParams: { period?: string } }) {
  const period = parsePeriod(searchParams.period);
  const [session, balance, summary, subsystems, workers, anomalies] = await Promise.all([
    auth(),
    getCreditBalance(),
    getUsageSummary(period),
    getUsageBySubsystem(period),
    getUsageByWorker(period),
    getUsageAnomalies(period),
  ]);

  return (
    <div className="space-y-12">
      <Link href="/admin/finance" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <LuArrowLeft className="size-4" aria-hidden />
        Finance
      </Link>

      <PageHeader
        title="AI usage"
        description="What Claude costs, which step and which worker spent it. Only calls made by EduCraft HQ are counted."
      />

      <AiBalanceCard balance={balance} canEdit={session?.user?.role === "SUPER_ADMIN"} />

      {summary.calls === 0 ? (
        <p className="rounded-2xl bg-zone px-5 py-6 text-sm text-muted-foreground">
          No Claude calls logged in this period yet. Usage appears here as soon as a worker runs research on a project;
          chapter generation will show up too once it goes live.
        </p>
      ) : null}

      <section aria-labelledby="spend-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="spend-heading" className="text-[15px] font-semibold text-foreground">
            Spend
          </h2>
          <nav aria-label="Period" className="grid w-full grid-cols-4 gap-1 rounded-lg bg-zone p-1 sm:flex sm:w-auto">
            {USAGE_PERIODS.map((p) => (
              <Link
                key={p}
                href={`?period=${p}`}
                aria-current={p === period ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-md px-2 py-1.5 text-center text-[13px] font-medium transition-colors sm:px-3",
                  p === period ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {PERIOD_LABEL[p]}
              </Link>
            ))}
          </nav>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          <Stat label="Total spend" value={formatNaira(summary.totalCost)} big />
          <Stat label="Input tokens" value={num(summary.inputTokens)} />
          <Stat label="Output tokens" value={num(summary.outputTokens)} />
          <Stat
            label="Avg per project"
            value={formatNaira(summary.avgCostPerProject)}
            detail={`${summary.projectCount} project${summary.projectCount === 1 ? "" : "s"}`}
          />
        </dl>
        <AiSpendChart data={summary.daily} />
      </section>

      <section aria-labelledby="sub-heading">
        <h2 id="sub-heading" className="text-[15px] font-semibold text-foreground">
          Cost by step
        </h2>
        <RevenueBarChart
          data={subsystems.slice(0, 8).map((s) => ({ label: s.label.replace("research_pipeline · ", ""), value: s.cost }))}
          emptyLabel="No calls logged in this period"
          valueLabel="Spend"
        />
      </section>

      <section aria-labelledby="workers-heading">
        <h2 id="workers-heading" className="text-[15px] font-semibold text-foreground">
          Usage by worker
        </h2>
        <AiWorkersTable rows={workers} period={period} />
      </section>

      <section aria-labelledby="project-heading">
        <h2 id="project-heading" className="text-[15px] font-semibold text-foreground">
          Project drill-down
        </h2>
        <AiProjectSearch />
      </section>

      <section aria-labelledby="anomaly-heading">
        <h2 id="anomaly-heading" className="text-[15px] font-semibold text-foreground">
          Needs attention
        </h2>
        {anomalies.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing unusual in this period.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border/70">
            {anomalies.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">{formatNaira(a.cost)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, detail, big }: { label: string; value: string; detail?: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono font-medium tabular-nums text-foreground", big ? "text-2xl" : "text-lg")}>
        {value}
      </dd>
      {detail ? <dd className="mt-0.5 text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}
