import type { Metadata } from "next";
import Link from "next/link";
import {
  LuTrendingUp,
  LuCalendarDays,
  LuCalendarRange,
  LuTarget,
  LuWallet,
  LuReceipt,
  LuPiggyBank,
  LuUserCog,
  LuMegaphone,
  LuArrowRight,
} from "react-icons/lu";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RevenueTrendChart } from "@/components/finance/RevenueTrendChart";
import { RevenueBarChart } from "@/components/finance/RevenueBarChart";
import {
  getRevenueCards,
  getRevenueSeries,
  getCashFlowBreakdown,
  getOutstandingBalances,
  getBusinessIntelligence,
} from "@/lib/services/finance-dashboard";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

/** Top 5 entries plotted individually; everything past that rolls into "Others". */
function topFivePlusOthers(
  rows: { label: string; value: number }[]
): { label: string; value: number }[] {
  if (rows.length <= 5) return rows;
  const top = rows.slice(0, 5);
  const othersTotal = rows.slice(5).reduce((s, r) => s + r.value, 0);
  return [...top, { label: "Others", value: othersTotal }];
}

export default async function FinancePage() {
  const [revenueCards, daily, weekly, monthly, cashFlow, outstanding, bi] = await Promise.all([
    getRevenueCards(),
    getRevenueSeries("daily"),
    getRevenueSeries("weekly"),
    getRevenueSeries("monthly"),
    getCashFlowBreakdown(),
    getOutstandingBalances(),
    getBusinessIntelligence(),
  ]);

  const changeDetail = (pct: number | null) =>
    pct == null ? "no data last period" : `${pct > 0 ? "+" : ""}${pct}% vs last period`;
  const changeTone = (pct: number | null): "success" | "danger" | "muted" =>
    pct == null ? "muted" : pct >= 0 ? "success" : "danger";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Finance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue, cash flow, and business intelligence — auto-generated from the database.
        </p>
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          label="Revenue today"
          value={formatNaira(revenueCards.today.amount)}
          detail={changeDetail(revenueCards.today.changePercent)}
          detailTone={changeTone(revenueCards.today.changePercent)}
          icon={LuCalendarDays}
        />
        <StatsCard
          label="Revenue this week"
          value={formatNaira(revenueCards.thisWeek.amount)}
          detail={changeDetail(revenueCards.thisWeek.changePercent)}
          detailTone={changeTone(revenueCards.thisWeek.changePercent)}
          icon={LuCalendarRange}
        />
        <StatsCard
          label="Revenue this month"
          value={formatNaira(revenueCards.thisMonth.amount)}
          detail={changeDetail(revenueCards.thisMonth.changePercent)}
          detailTone={changeTone(revenueCards.thisMonth.changePercent)}
          icon={LuTrendingUp}
          tone="gold"
        />
        <StatsCard
          label="Revenue this year"
          value={formatNaira(revenueCards.thisYear.amount)}
          detail={`${revenueCards.thisYear.targetPercent}% of ₦1B target`}
          detailTone="muted"
          icon={LuTarget}
        />
      </div>

      {/* Revenue trend */}
      <RevenueTrendChart data={{ daily, weekly, monthly }} />

      {/* Financial breakdown */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BreakdownCard title="Income">
          <BreakdownRow label="Total revenue" value={formatNaira(cashFlow.income.totalRevenue)} />
          <BreakdownRow label="Worker payouts" value={formatNaira(cashFlow.income.workerPayouts)} muted />
          <BreakdownRow
            label="Ambassador commissions"
            value={formatNaira(cashFlow.income.ambassadorCommissions)}
            muted
          />
          <BreakdownRow label="EduCraft share" value={formatNaira(cashFlow.income.educraftShare)} strong />
        </BreakdownCard>

        <BreakdownCard
          title="Expenses"
          action={{ href: "/admin/finance/expenses", label: "Manage" }}
        >
          {cashFlow.expensesByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses logged this month.</p>
          ) : (
            cashFlow.expensesByCategory.map((e) => (
              <BreakdownRow key={e.category} label={e.category} value={formatNaira(e.amount)} muted />
            ))
          )}
          <BreakdownRow label="Total expenses" value={formatNaira(cashFlow.totalExpenses)} strong />
        </BreakdownCard>

        <BreakdownCard title="Profit">
          <BreakdownRow label="EduCraft share" value={formatNaira(cashFlow.income.educraftShare)} muted />
          <BreakdownRow label="Less: expenses" value={`- ${formatNaira(cashFlow.totalExpenses)}`} muted />
          <BreakdownRow
            label="Net profit"
            value={formatNaira(cashFlow.netProfit)}
            strong
            tone={cashFlow.netProfit >= 0 ? "success" : "danger"}
          />
          <BreakdownRow
            label="Profit margin"
            value={cashFlow.profitMarginPercent != null ? `${cashFlow.profitMarginPercent}%` : "—"}
          />
        </BreakdownCard>
      </div>

      {/* Outstanding balances */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Outstanding balances
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatsCard
            label="Unpaid client balances"
            value={formatNaira(outstanding.unpaidClientBalance.amount)}
            detail={`${outstanding.unpaidClientBalance.count} project${outstanding.unpaidClientBalance.count === 1 ? "" : "s"} approved, awaiting balance`}
            icon={LuReceipt}
            tone="gold"
            href="/admin/projects?status=APPROVED"
          />
          <StatsCard
            label="Pending worker payouts"
            value={formatNaira(outstanding.pendingWorkerPayouts.amount)}
            detail={`${outstanding.pendingWorkerPayouts.count} worker${outstanding.pendingWorkerPayouts.count === 1 ? "" : "s"} owed`}
            icon={LuWallet}
            href="/admin/finance/payouts"
          />
          <StatsCard
            label="Pending ambassador commissions"
            value={formatNaira(outstanding.pendingAmbassadorCommissions.amount)}
            detail={`${outstanding.pendingAmbassadorCommissions.count} ambassador${outstanding.pendingAmbassadorCommissions.count === 1 ? "" : "s"} owed`}
            icon={LuPiggyBank}
            href="/admin/finance/payouts"
          />
        </div>
      </div>

      {/* Business intelligence */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Business intelligence
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <p className="text-sm font-semibold text-foreground">Revenue by service</p>
            <RevenueBarChart
              data={topFivePlusOthers(
                bi.byService.map((s) => ({ label: s.serviceName, value: s.revenue }))
              )}
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <p className="text-sm font-semibold text-foreground">Revenue by university</p>
            <RevenueBarChart
              data={topFivePlusOthers(
                bi.byUniversity.map((u) => ({ label: u.abbreviation, value: u.revenue }))
              )}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Top workers by revenue</p>
              <Link
                href="/admin/workers"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                All workers
                <LuArrowRight className="size-3" aria-hidden />
              </Link>
            </div>
            <PerformerList
              rows={bi.topWorkers}
              icon={LuUserCog}
              basePath="/admin/workers"
              emptyLabel="No completed projects yet"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Top ambassadors by revenue</p>
              <Link
                href="/admin/ambassadors"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                All ambassadors
                <LuArrowRight className="size-3" aria-hidden />
              </Link>
            </div>
            <PerformerList
              rows={bi.topAmbassadors}
              icon={LuMegaphone}
              basePath="/admin/ambassadors"
              emptyLabel="No completed projects yet"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {action ? (
          <Link href={action.href} className="text-xs font-medium text-primary hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: "success" | "danger";
}) {
  return (
    <div
      className={
        strong
          ? "flex items-center justify-between gap-3 border-t border-border pt-2 text-sm"
          : "flex items-center justify-between gap-3 text-sm"
      }
    >
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span
        className={
          "font-mono font-medium tabular-nums " +
          (tone === "success"
            ? "text-success"
            : tone === "danger"
              ? "text-danger"
              : strong
                ? "text-foreground"
                : "text-foreground")
        }
      >
        {value}
      </span>
    </div>
  );
}

function PerformerList({
  rows,
  icon: Icon,
  basePath,
  emptyLabel,
}: {
  rows: { id: string; code: string; name: string; revenue: number; completed: number }[];
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  basePath: string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="mt-3 space-y-1">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link
            href={`${basePath}/${r.id}`}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-xs font-medium text-muted-foreground">
              {i + 1}
            </span>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.name}</span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-sm font-medium tabular-nums text-foreground">
                {formatNaira(r.revenue, { compact: true })}
              </span>
              <span className="block text-[11px] text-muted-foreground">{r.completed} completed</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
