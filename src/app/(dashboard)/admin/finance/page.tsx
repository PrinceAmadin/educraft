import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowRight, LuMegaphone, LuPiggyBank, LuReceipt, LuUserCog, LuWallet } from "react-icons/lu";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RevenueTrendChart } from "@/components/finance/RevenueTrendChart";
import { RevenueBarChart } from "@/components/finance/RevenueBarChart";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  getRevenueCards,
  getRevenueSeries,
  getCashFlowBreakdown,
  getOutstandingBalances,
  getBusinessIntelligence,
} from "@/lib/services/finance-dashboard";
import { cn, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

/** Top 5 entries plotted individually; everything past that rolls into "Others". */
function topFivePlusOthers(rows: { label: string; value: number }[]): { label: string; value: number }[] {
  if (rows.length <= 5) return rows;
  const top = rows.slice(0, 5);
  const othersTotal = rows.slice(5).reduce((s, r) => s + r.value, 0);
  return [...top, { label: "Others", value: othersTotal }];
}

function changeLabel(pct: number | null) {
  return pct == null ? "No data last period" : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs last period`;
}
function changeTone(pct: number | null) {
  return pct == null ? "text-muted-foreground" : pct >= 0 ? "text-success" : "text-danger";
}

/**
 * Finance, read top to bottom: the month's revenue as one large number, the
 * trend chart under it, then the money breakdown in a single zone, what's still
 * owed, and the business intelligence. One big number first — not a grid of
 * equal cards competing for attention.
 */
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

  const month = revenueCards.thisMonth;

  return (
    <div className="space-y-12">
      <PageHeader
        title="Finance"
        description="Revenue, cash flow and business intelligence — generated from the database."
      />

      {/* ── The number ── */}
      <section aria-labelledby="month-revenue" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end">
        <div>
          <p id="month-revenue" className="meta-label">
            Revenue this month
          </p>
          <p className="mt-2 font-mono text-[clamp(2.5rem,7vw,3.75rem)] font-medium leading-none tracking-tight tabular-nums text-foreground">
            {formatNaira(month.amount)}
          </p>
          <p className={cn("mt-3 text-sm", changeTone(month.changePercent))}>{changeLabel(month.changePercent)}</p>
        </div>

        <dl className="grid grid-cols-3 gap-x-6 gap-y-4">
          <MiniStat label="Today" value={revenueCards.today.amount} pct={revenueCards.today.changePercent} />
          <MiniStat label="This week" value={revenueCards.thisWeek.amount} pct={revenueCards.thisWeek.changePercent} />
          <div className="min-w-0">
            <dt className="meta-label">This year</dt>
            <dd className="mt-1 truncate font-mono text-lg font-medium tabular-nums text-foreground">
              {formatNaira(revenueCards.thisYear.amount, { compact: true })}
            </dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">
              {revenueCards.thisYear.targetPercent}% of ₦1B target
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Chart second ── */}
      <RevenueTrendChart data={{ daily, weekly, monthly }} />

      {/* ── Breakdown, one zone ── */}
      <section aria-label="Cash flow this month" className="grid gap-x-10 gap-y-8 rounded-2xl bg-zone p-5 sm:p-7 lg:grid-cols-3">
        <Breakdown title="Income">
          <Row label="Total revenue" value={formatNaira(cashFlow.income.totalRevenue)} />
          <Row label="Worker payouts" value={formatNaira(cashFlow.income.workerPayouts)} muted />
          <Row label="Ambassador commissions" value={formatNaira(cashFlow.income.ambassadorCommissions)} muted />
          <Row label="EduCraft share" value={formatNaira(cashFlow.income.educraftShare)} strong />
        </Breakdown>

        <Breakdown title="Expenses" action={{ href: "/admin/finance/expenses", label: "Manage" }}>
          {cashFlow.expensesByCategory.length === 0 ? (
            <p className="py-1.5 text-sm text-muted-foreground">No expenses logged this month.</p>
          ) : (
            cashFlow.expensesByCategory.map((e) => (
              <Row key={e.category} label={e.category} value={formatNaira(e.amount)} muted />
            ))
          )}
          <Row label="Total expenses" value={formatNaira(cashFlow.totalExpenses)} strong />
        </Breakdown>

        <Breakdown title="Profit">
          <Row label="EduCraft share" value={formatNaira(cashFlow.income.educraftShare)} muted />
          <Row label="Less expenses" value={`− ${formatNaira(cashFlow.totalExpenses)}`} muted />
          <Row
            label="Net profit"
            value={formatNaira(cashFlow.netProfit)}
            strong
            tone={cashFlow.netProfit >= 0 ? "success" : "danger"}
          />
          <Row
            label="Profit margin"
            value={cashFlow.profitMarginPercent != null ? `${cashFlow.profitMarginPercent}%` : "—"}
          />
        </Breakdown>
      </section>

      {/* ── Still owed ── */}
      <section aria-labelledby="owed-heading">
        <h2 id="owed-heading" className="text-[15px] font-semibold text-foreground">
          Outstanding balances
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
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
      </section>

      {/* ── Business intelligence ── */}
      <section aria-labelledby="bi-heading">
        <h2 id="bi-heading" className="text-[15px] font-semibold text-foreground">
          Business intelligence
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Revenue by service</h3>
            <RevenueBarChart
              data={topFivePlusOthers(bi.byService.map((s) => ({ label: s.serviceName, value: s.revenue })))}
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Revenue by university</h3>
            <RevenueBarChart
              data={topFivePlusOthers(bi.byUniversity.map((u) => ({ label: u.abbreviation, value: u.revenue })))}
            />
          </div>

          <div>
            <ListHeader title="Top workers by revenue" href="/admin/workers" label="All workers" />
            <PerformerList rows={bi.topWorkers} icon={LuUserCog} basePath="/admin/workers" emptyLabel="No completed projects yet" />
          </div>
          <div>
            <ListHeader title="Top ambassadors by revenue" href="/admin/ambassadors" label="All ambassadors" />
            <PerformerList
              rows={bi.topAmbassadors}
              icon={LuMegaphone}
              basePath="/admin/ambassadors"
              emptyLabel="No completed projects yet"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, pct }: { label: string; value: number; pct: number | null }) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className="mt-1 truncate font-mono text-lg font-medium tabular-nums text-foreground">
        {formatNaira(value, { compact: true })}
      </dd>
      <dd className={cn("mt-0.5 text-xs", changeTone(pct))}>
        {pct == null ? "—" : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}%`}
      </dd>
    </div>
  );
}

function Breakdown({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {action ? (
          <Link href={action.href} className="text-[13px] font-medium text-primary hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({
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
      className={cn(
        "flex items-center justify-between gap-3 py-1.5 text-sm",
        strong && "mt-1.5 border-t border-border pt-3"
      )}
    >
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ListHeader({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
        {label}
        <LuArrowRight className="size-3" aria-hidden />
      </Link>
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
    return <p className="mt-3 rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="mt-2 divide-y divide-border/70">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link
            href={`${basePath}/${r.id}`}
            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-5 shrink-0 text-center font-mono text-xs font-medium text-muted-foreground">{i + 1}</span>
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
