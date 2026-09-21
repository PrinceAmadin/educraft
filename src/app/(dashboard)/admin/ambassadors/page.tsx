import type { Metadata } from "next";
import { LuChartPie, LuCircleCheck, LuCircleDashed, LuLayoutGrid } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { BroadcastAction } from "@/components/ambassadors/BroadcastAction";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { RosterBoard } from "@/components/ambassadors/RosterBoard";
import { db } from "@/lib/db";
import { listRoster, rosterStats } from "@/lib/services/ambassador-roster";

export const metadata: Metadata = { title: "Ambassadors" };
export const dynamic = "force-dynamic";

export default async function AmbassadorsPage() {
  const [rows, pendingApplications] = await Promise.all([
    listRoster("GENERAL"),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);
  const stats = rosterStats(rows);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Every ambassador slot, and the link each one shares with students. Copy a link and it opens WhatsApp with their name already in the message."
        actions={<BroadcastAction />}
      />
      <AmbassadorTabs active="list" pendingApplications={pendingApplications} />

      <section className={STATS_GRID} aria-label="Slot totals">
        <StatsCard label="Total slots" value={String(stats.total)} icon={LuLayoutGrid} />
        <StatsCard label="Active" value={String(stats.active)} icon={LuCircleCheck} tone="success" />
        <StatsCard label="Vacant" value={String(stats.vacant)} detail="Filled first by new applicants" icon={LuCircleDashed} tone="gold" />
        <StatsCard label="Fill rate" value={`${stats.fillRate}%`} icon={LuChartPie} />
      </section>

      <RosterBoard rows={rows} />
    </div>
  );
}
