import type { Metadata } from "next";
import { LuFolderKanban, LuCircleCheck, LuWallet, LuStar, LuInbox } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getWorkerByUserId, getWorkerDashboard } from "@/lib/services/worker-portal";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { WorkerAssignmentList } from "@/components/worker/WorkerAssignmentList";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { firstName, formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "My work" };
export const dynamic = "force-dynamic";

export default async function WorkerDashboardPage() {
  const session = await auth();
  const worker = session?.user ? await getWorkerByUserId(session.user.id) : null;

  if (!worker) {
    return (
      <EmptyState
        icon={LuInbox}
        title="No worker profile yet"
        description="Your account isn't linked to a worker profile. Contact an admin to get set up."
      />
    );
  }

  const { name, stats, assignments } = await getWorkerDashboard(worker.id);

  return (
    <div className="space-y-10">
      <PageHeader title={`Welcome back, ${firstName(name)}`} description="Here's what needs your attention." />

      <section aria-label="Your numbers" className={STATS_GRID}>
        <StatsCard label="Active assignments" value={String(stats.activeAssignments)} icon={LuFolderKanban} tone="primary" />
        <StatsCard label="Completed this month" value={String(stats.completedThisMonth)} icon={LuCircleCheck} tone="success" />
        <StatsCard
          label="Earnings this month"
          value={formatNaira(stats.earningsThisMonth, { compact: true })}
          icon={LuWallet}
          tone="gold"
        />
        <StatsCard
          label="Rating"
          value={stats.rating != null ? `${stats.rating.toFixed(1)}/5` : "—"}
          icon={LuStar}
          tone="primary"
        />
      </section>

      <section aria-labelledby="assignments-heading">
        <h2 id="assignments-heading" className="mb-4 text-[15px] font-semibold text-foreground">
          Active assignments
        </h2>
        {assignments.length === 0 ? (
          <EmptyState
            icon={LuFolderKanban}
            title="No active assignments"
            description="When an admin assigns you a project, it will show up here."
          />
        ) : (
          <WorkerAssignmentList rows={assignments} />
        )}
      </section>
    </div>
  );
}
