import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { canVerifyPayments } from "@/lib/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { MonthPicker } from "@/components/reports/MonthPicker";
import { DistributeDraws } from "@/components/finance/draws/DistributeDraws";
import { SemesterDecision } from "@/components/finance/draws/SemesterDecision";
import { AnnualActions } from "@/components/finance/draws/AnnualActions";
import { getAnnualPanel, getDrawHistory, getMonthlyDrawPanel, getSemesterPanel } from "@/lib/services/finance/founder-draws";
import { currentMonthKey } from "@/lib/services/finance/surplus";
import { drawsQuerySchema } from "@/lib/validations/finance-draws";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Founder draws" };
export const dynamic = "force-dynamic";

function tierLabel(t: { minRevenue: number; maxRevenue: number }): string {
  if (t.minRevenue === 0) return `Below ${formatNaira(t.maxRevenue + 1, { compact: true })}`;
  if (t.maxRevenue >= 1_000_000_000) return `${formatNaira(t.minRevenue, { compact: true })}+`;
  return `${formatNaira(t.minRevenue, { compact: true })} – ${formatNaira(t.maxRevenue, { compact: true })}`;
}

/**
 * The three channels of founder income: the tiered monthly draw, the
 * semester bonus, the annual profit share — and twelve months of history.
 */
export default async function FounderDrawsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await auth();
  const role = session?.user?.role;
  const canAct = canVerifyPayments(role);
  const isFounder = role === "SUPER_ADMIN";
  const parsed = drawsQuerySchema.safeParse(searchParams);
  const currentMonth = currentMonthKey();
  const requested = parsed.success ? parsed.data.month : undefined;
  const month = requested && requested <= currentMonth ? requested : currentMonth;
  const year = Number(month.slice(0, 4));

  const [monthly, semester, annual, history] = await Promise.all([getMonthlyDrawPanel(month), getSemesterPanel(month), getAnnualPanel(year), getDrawHistory(year)]);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Founder draws"
        description="Monthly draws set by the month's revenue tier, the semester bonus the CFO recommends and the founder approves, and the annual profit share."
        back={{ href: "/admin/finance", label: "Finance" }}
        actions={<MonthPicker month={month} currentMonth={currentMonth} basePath="/admin/finance/founder-draws" />}
      />

      {/* ── Monthly draws ── */}
      <section aria-labelledby="monthly-heading" className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <h2 id="monthly-heading" className="text-[15px] font-semibold text-foreground">
            Founder monthly draws — {monthly.monthLabel}
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="meta-label">Revenue this month</dt>
              <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(monthly.monthRevenue)}</dd>
            </div>
            <div>
              <dt className="meta-label">Revenue tier</dt>
              <dd className="mt-1 text-sm text-foreground">{tierLabel(monthly.tier)}</dd>
            </div>
            <div>
              <dt className="meta-label">Draw each founder</dt>
              <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{formatNaira(monthly.drawEach)}</dd>
            </div>
            <div>
              <dt className="meta-label">Founder Distribution in</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums text-foreground">{formatNaira(monthly.bucketInflowThisMonth)}</dd>
            </div>
            <div>
              <dt className="meta-label">Draws this month</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums text-foreground">
                {formatNaira(monthly.drawsTotal)}
                {monthly.distributedTotal > 0 ? <span className="ml-1 text-xs text-success">({formatNaira(monthly.distributedTotal)} paid)</span> : null}
              </dd>
            </div>
            <div>
              <dt className="meta-label">Bucket after draws</dt>
              <dd className={cn("mt-1 font-mono text-sm tabular-nums", monthly.remainingAfterDraws < 0 ? "text-danger" : "text-foreground")}>
                {formatNaira(monthly.remainingAfterDraws)}
                <span className="ml-1 font-sans text-xs text-muted-foreground">of {formatNaira(monthly.bucketBalance)} held</span>
              </dd>
            </div>
          </dl>
          <DistributeDraws panel={monthly} canAct={canAct} isFounder={isFounder} />
        </div>

        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Draw tier reference</h3>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 font-medium">Monthly revenue</th>
                <th scope="col" className="py-1.5 text-right font-medium">Draw (each)</th>
                <th scope="col" className="py-1.5 pl-3 font-medium">
                  <span className="sr-only">Current</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {monthly.tiers.map((t) => (
                <tr key={t.minRevenue} className={t.current ? "font-medium text-foreground" : "text-muted-foreground"}>
                  <td className="py-2">{tierLabel(t)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{formatNaira(t.drawEach)}</td>
                  <td className="py-2 pl-3 text-xs text-primary">{t.current ? "← you are here" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Semester bonus ── */}
      <section aria-labelledby="semester-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="semester-heading" className="text-[15px] font-semibold text-foreground">
            Semester bonus
          </h2>
          <p className="text-[13px] text-muted-foreground">{semester.analysis.semester.label}</p>
        </div>
        <div className="mt-3">
          <SemesterDecision
            month={month}
            semesterLabel={semester.analysis.semester.label}
            recommendation={semester.recommendation}
            isFounder={isFounder}
            canRecommend={canAct}
            available={semester.analysis.analysis.each}
          />
        </div>
      </section>

      {/* ── Annual profit share ── */}
      <section aria-labelledby="annual-heading" className="rounded-2xl bg-zone p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="annual-heading" className="text-[15px] font-semibold text-foreground">
            Annual profit share — {annual.year}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            All buckets {formatNaira(annual.share.totalBalances)} · next-quarter reserve {formatNaira(annual.share.q1Reserve)} · available {formatNaira(annual.share.available)}
          </p>
        </div>
        <div className="mt-3">
          <AnnualActions panel={annual} isFounder={isFounder} canAct={canAct} />
        </div>
      </section>

      {/* ── History ── */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-[15px] font-semibold text-foreground">
          Draw history — {year}
        </h2>
        <ul className="mt-3 divide-y divide-border/70 md:hidden">
          {history.map((h) => (
            <li key={h.month} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{h.monthLabel}</p>
                <HistoryStatus status={h.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Revenue {formatNaira(h.revenue, { compact: true })} · {tierLabel(h.tier)} · {formatNaira(h.drawEach)} each · distributed {formatNaira(h.distributed)}
                {h.semesterBonus > 0 ? ` · semester bonus ${formatNaira(h.semesterBonus)}` : ""}
                {h.annualShare > 0 ? ` · profit share ${formatNaira(h.annualShare)}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 font-medium">Month</th>
                <th scope="col" className="py-2 text-right font-medium">Revenue</th>
                <th scope="col" className="py-2 pl-4 font-medium">Tier</th>
                <th scope="col" className="py-2 text-right font-medium">Draw (each)</th>
                <th scope="col" className="py-2 text-right font-medium">Distributed</th>
                <th scope="col" className="py-2 text-right font-medium">Semester bonus</th>
                <th scope="col" className="py-2 pl-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {history.map((h) => (
                <tr key={h.month}>
                  <td className="py-2.5 text-foreground">{h.monthLabel}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{formatNaira(h.revenue, { compact: true })}</td>
                  <td className="py-2.5 pl-4 text-muted-foreground">{tierLabel(h.tier)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{formatNaira(h.drawEach)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{h.distributed > 0 ? formatNaira(h.distributed) : "—"}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{h.semesterBonus > 0 ? formatNaira(h.semesterBonus) : "—"}</td>
                  <td className="py-2.5 pl-4">
                    <HistoryStatus status={h.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HistoryStatus({ status }: { status: "PAID" | "PARTIAL" | "PENDING" | "NONE" }) {
  const tone = status === "PAID" ? "text-success" : status === "PARTIAL" ? "text-gold" : status === "PENDING" ? "text-gold" : "text-muted-foreground";
  const label = status === "PAID" ? "Paid" : status === "PARTIAL" ? "Partly paid" : status === "PENDING" ? "Pending" : "No draw";
  return <span className={cn("text-xs font-medium", tone)}>{label}</span>;
}
