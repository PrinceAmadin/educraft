import type { Metadata } from "next";
import { LuActivity, LuSparkles, LuTrendingUp, LuUsers } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { BroadcastAction } from "@/components/ambassadors/BroadcastAction";
import { AttentionPanel, TierBreakdown } from "@/components/ambassadors/platform/DashboardPanels";
import { WeeklyActivityChart } from "@/components/ambassadors/platform/WeeklyActivityChart";
import { RhythmPanel } from "@/components/ambassadors/platform/RhythmPanel";
import { db } from "@/lib/db";
import { getAmbassadorDashboard } from "@/lib/services/ambassador-platform/dashboard";

export const metadata: Metadata = { title: "Ambassadors" };
export const dynamic = "force-dynamic";

function vs(count: number, last: number, noun: string): { text: string; tone: "muted" | "success" | "danger" } {
  if (last === 0 && count === 0) return { text: `No ${noun} last month either`, tone: "muted" };
  const d = count - last;
  return { text: `vs ${last} last month${d === 0 ? "" : d > 0 ? ` (up ${d})` : ` (down ${Math.abs(d)})`}`, tone: d > 0 ? "success" : d < 0 ? "danger" : "muted" };
}

/**
 * Phase 3 Section 1 — the Ambassador Dashboard, the HOG's morning page:
 * what the network is doing right now.
 */
export default async function AmbassadorDashboardPage() {
  const [data, pendingApplications] = await Promise.all([getAmbassadorDashboard(), db.ambassadorApplication.count({ where: { status: "PENDING" } })]);
  const { stats, tiers, attention, weekly, rhythm, spotlight } = data;
  const refs = vs(stats.referralsMtd.count, stats.referralsMtd.lastMonth, "referrals");
  const convs = vs(stats.conversionsMtd.count, stats.conversionsMtd.lastMonth, "conversions");
  const activeDetail = `${stats.active.rate}% active · target ${stats.active.target}% · was ${stats.active.lastRate}%`;

  return (
    <div className="space-y-7">
      <PageHeader title="Ambassadors" description="What the ambassador network is doing right now: who is active, who is close to a promotion, and this week's rhythm." actions={<BroadcastAction />} />
      <AmbassadorTabs active="dashboard" pendingApplications={pendingApplications} />

      <section className={STATS_GRID} aria-label="Network this month">
        <StatsCard label="Total ambassadors" value={String(stats.total)} detail={stats.newThisMonth > 0 ? `+${stats.newThisMonth} this month` : "No new ambassadors this month"} detailTone={stats.newThisMonth > 0 ? "success" : "muted"} icon={LuUsers} href="/admin/ambassadors/list" />
        <StatsCard label="Active this month" value={String(stats.active.count)} detail={activeDetail} detailTone={stats.active.tone === "success" ? "success" : stats.active.tone === "gold" ? "gold" : "danger"} icon={LuActivity} tone={stats.active.tone} href="/admin/ambassadors/list?status=ACTIVE" wrapLabel />
        <StatsCard label="New referrals MTD" value={String(stats.referralsMtd.count)} detail={refs.text} detailTone={refs.tone} icon={LuSparkles} wrapLabel />
        <StatsCard label="Conversions MTD" value={String(stats.conversionsMtd.count)} detail={convs.text} detailTone={convs.tone} icon={LuTrendingUp} tone="success" wrapLabel />
      </section>

      <TierBreakdown tiers={tiers} total={stats.total} />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-7">
          <AttentionPanel attention={attention} />
          <section aria-labelledby="weekly-heading" className="surface p-4 sm:p-5">
            <h2 id="weekly-heading" className="text-[15px] font-semibold text-foreground">
              Weekly activity
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Last 12 weeks, Monday to Sunday: referrals submitted against conversions. The gap is the drop-off.</p>
            <WeeklyActivityChart data={weekly} />
          </section>
        </div>
        <RhythmPanel rhythm={rhythm} spotlight={spotlight} />
      </div>
    </div>
  );
}
