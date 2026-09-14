import type { Metadata } from "next";
import { LuBriefcase, LuMail, LuMousePointerClick, LuWallet } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { TrackingBoard } from "@/components/ambassadors/TrackingBoard";
import { BroadcastButton } from "@/components/ambassadors/BroadcastButton";
import { db } from "@/lib/db";
import { getAmbassadorTracking } from "@/lib/services/ambassador-tracking";
import { listAllocatableAmbassadors } from "@/lib/services/ambassador-commission";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "Ambassador tracking" };
export const dynamic = "force-dynamic";

/**
 * The original panel's Tracking tab on HQ's data: a leaderboard, and "Log job"
 * — allocating a job to an ambassador, which logs the commission as an
 * expense and emails them.
 */
export default async function AmbassadorTrackingPage() {
  const [tracking, ambassadors, pendingApplications] = await Promise.all([
    getAmbassadorTracking(),
    listAllocatableAmbassadors(),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);
  const { totals } = tracking;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Who is bringing in work, and what they've earned. Log a job to an ambassador to take their commission off it and email them."
        actions={<BroadcastButton recipientCount={totals.withEmail} />}
      />

      <AmbassadorTabs active="tracking" pendingApplications={pendingApplications} />

      <section className={STATS_GRID} aria-label="Tracking totals">
        <StatsCard
          label="Jobs logged"
          value={String(totals.jobs)}
          detail={`${tracking.openJobs.length} open job${tracking.openJobs.length === 1 ? "" : "s"} with no ambassador`}
          icon={LuBriefcase}
        />
        <StatsCard
          label="Commission logged"
          value={formatNaira(totals.commissionLogged)}
          detail="Counted under Expenses"
          icon={LuWallet}
          tone="gold"
          href="/admin/finance/expenses?category=Ambassador+commission"
        />
        <StatsCard
          label="Link clicks"
          value={totals.clicks == null ? "—" : String(totals.clicks)}
          detail={totals.clicks == null ? "Click counts unavailable right now" : "On original panel links"}
          icon={LuMousePointerClick}
        />
        <StatsCard
          label="On email"
          value={`${totals.withEmail}/${totals.ambassadors}`}
          detail="Can receive commission emails"
          icon={LuMail}
          tone="success"
        />
      </section>

      <TrackingBoard
        rows={tracking.rows}
        openJobs={tracking.openJobs}
        recent={tracking.recent}
        ambassadors={ambassadors}
      />
    </div>
  );
}
