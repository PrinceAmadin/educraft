import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowRight, LuBanknote, LuFolderCheck, LuMegaphone, LuPiggyBank, LuUserCog, LuWallet } from "react-icons/lu";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { RevenueBarChart } from "@/components/finance/RevenueBarChart";
import { RevenuePayoutsChart } from "@/components/finance/RevenuePayoutsChart";
import { BucketHealthGrid } from "@/components/finance/BucketHealthGrid";
import { NeedsAttention } from "@/components/finance/NeedsAttention";
import { PageHeader } from "@/components/shared/PageHeader";
import { getFinanceDashboard } from "@/lib/services/finance/dashboard";
import { getBusinessIntelligence, getPaymentMethodBreakdown } from "@/lib/services/finance-dashboard";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

/** Top 5 entries plotted individually; everything past that rolls into "Others". */
function topFivePlusOthers(rows: { label: string; value: number }[]): { label: string; value: number }[] {
  if (rows.length <= 5) return rows;
  const top = rows.slice(0, 5);
  const othersTotal = rows.slice(5).reduce((s, r) => s + r.value, 0);
  return [...top, { label: "Others", value: othersTotal }];
}

function change(pct: number | null, what = "last month"): { text: string; tone: "muted" | "success" | "danger" } {
  if (pct == null) return { text: `No ${what} to compare`, tone: "muted" };
  if (pct === 0) return { text: `Same as ${what}`, tone: "muted" };
  return { text: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${what}`, tone: pct > 0 ? "success" : "danger" };
}

/**
 * The CFO's morning screen: this month in four numbers, the four buckets,
 * what needs a hand, six months of revenue against payouts — then the
 * business intelligence underneath.
 */
export default async function FinancePage() {
  const [d, paymentMethods, bi] = await Promise.all([getFinanceDashboard(), getPaymentMethodBreakdown(), getBusinessIntelligence()]);
  const m = d.currentMonth;
  const rev = change(d.changes.revenue);
  const ret = change(d.changes.retained);
  const proj = change(d.changes.projects);

  return (
    <div className="space-y-12">
      <PageHeader title="Finance" description={`${m.label}: how EduCraft's money stands right now, from confirmed payments, the payout engine and the buckets.`} />

      <section aria-label="This month" className={STATS_GRID}>
        <StatsCard label="Revenue this month" value={formatNaira(m.revenue)} detail={rev.text} detailTone={rev.tone} icon={LuBanknote} tone="success" href="/admin/finance/revenue" />
        <StatsCard
          label="Payouts this month"
          value={formatNaira(m.payouts)}
          detail={m.payouts > 0 ? `${formatNaira(m.payoutsPaid)} confirmed paid` : "Nothing owed yet"}
          detailTone={m.payouts > 0 && m.payoutsPaid < m.payouts ? "gold" : "muted"}
          icon={LuWallet}
          tone="gold"
          href="/admin/finance/payouts"
        />
        <StatsCard label="Net retained" value={formatNaira(m.retained)} detail={m.retained > 0 ? `After all payouts · ${ret.text}` : "After all payouts"} detailTone={ret.tone} icon={LuPiggyBank} href="/admin/finance/buckets" />
        <StatsCard label="Projects this month" value={String(m.projectCount)} detail={`${m.projectCount} completed · ${proj.text}`} detailTone={proj.tone} icon={LuFolderCheck} href="/admin/projects?status=COMPLETED" />
      </section>

      <BucketHealthGrid cards={d.buckets} />

      <NeedsAttention alerts={d.alerts} />

      <RevenuePayoutsChart data={d.revenueHistory} />

      {/* ── Payment methods ── */}
      <section aria-labelledby="methods-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="methods-heading" className="text-[15px] font-semibold text-foreground">
            Payment methods this month
          </h2>
          <Link href="/admin/finance/reconciliation" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            Paystack reconciliation
            <LuArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
        <RevenueBarChart data={paymentMethods.map((pm) => ({ label: pm.method, value: pm.amount }))} emptyLabel="No confirmed payments this month yet" />
      </section>

      {/* ── Business intelligence ── */}
      <section aria-labelledby="bi-heading">
        <h2 id="bi-heading" className="text-[15px] font-semibold text-foreground">
          Business intelligence
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Revenue by service</h3>
            <RevenueBarChart data={topFivePlusOthers(bi.byService.map((s) => ({ label: s.serviceName, value: s.revenue })))} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Revenue by university</h3>
            <RevenueBarChart data={topFivePlusOthers(bi.byUniversity.map((u) => ({ label: u.abbreviation, value: u.revenue })))} />
          </div>
          <div>
            <ListHeader title="Top workers by revenue" href="/admin/workers" label="All workers" />
            <PerformerList rows={bi.topWorkers} icon={LuUserCog} basePath="/admin/workers" emptyLabel="No completed projects yet" />
          </div>
          <div>
            <ListHeader title="Top ambassadors by revenue" href="/admin/ambassadors" label="All ambassadors" />
            <PerformerList rows={bi.topAmbassadors} icon={LuMegaphone} basePath="/admin/ambassadors" emptyLabel="No completed projects yet" />
          </div>
        </div>
      </section>
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
              <span className="block font-mono text-sm font-medium tabular-nums text-foreground">{formatNaira(r.revenue, { compact: true })}</span>
              <span className="block text-[11px] text-muted-foreground">{r.completed} completed</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
