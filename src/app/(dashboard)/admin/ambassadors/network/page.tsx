import type { Metadata } from "next";
import { LuGauge, LuNetwork, LuUsers, LuUserCheck } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { NetworkTree } from "@/components/ambassadors/platform/NetworkTree";
import { db } from "@/lib/db";
import { getNetworkMap } from "@/lib/services/ambassador-platform/network";

export const metadata: Metadata = { title: "Ambassador network" };
export const dynamic = "force-dynamic";

/** Phase 3 Section 3 — the Network Map: every Core with their Sub-team, and the solo ambassadors. */
export default async function NetworkPage() {
  const [data, pendingApplications] = await Promise.all([getNetworkMap(), db.ambassadorApplication.count({ where: { status: "PENDING" } })]);
  const { stats } = data;
  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassador network"
        description={`${stats.ambassadors} ambassador${stats.ambassadors === 1 ? "" : "s"} in ${stats.clusters} Core cluster${stats.clusters === 1 ? "" : "s"}. A Core earns an override on their Sub-team's clients; EduCraft always pays 15% in total.`}
      />
      <AmbassadorTabs active="network" pendingApplications={pendingApplications} />

      <NetworkTree data={data} />

      <section className={STATS_GRID} aria-label="Network structure">
        <StatsCard label="Core clusters" value={String(stats.clusters)} detail="Cores with at least one Sub" icon={LuNetwork} />
        <StatsCard label="Sub-ambassadors" value={String(stats.subs)} detail="Working under a Core" icon={LuUsers} />
        <StatsCard label="Average Subs per Core" value={stats.averageSubs.toFixed(1)} detail={`Out of a maximum of ${stats.maxSubs}`} icon={LuGauge} />
        <StatsCard label="Cores at max capacity" value={String(stats.atCapacity)} detail={`${stats.maxSubs}/${stats.maxSubs} Subs — cannot take more`} icon={LuUserCheck} tone={stats.atCapacity > 0 ? "gold" : "primary"} wrapLabel />
      </section>
    </div>
  );
}
