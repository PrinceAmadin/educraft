import type { Metadata } from "next";
import { LuCircleCheck, LuMoonStar, LuSparkles, LuUsers } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { BroadcastAction } from "@/components/ambassadors/BroadcastAction";
import { DirectoryFilters } from "@/components/ambassadors/platform/DirectoryFilters";
import { DirectoryTable } from "@/components/ambassadors/platform/DirectoryTable";
import { NewAmbassadorDialog } from "@/components/ambassadors/platform/NewAmbassadorDialog";
import { db } from "@/lib/db";
import { MAX_SUB_AMBASSADORS } from "@/lib/commission";
import { directoryActivityCounts, directoryFilterOptions, listDirectory, listCoreOptions } from "@/lib/services/ambassador-platform/directory";
import { partnershipOptions } from "@/lib/services/ambassador-platform/partnerships";
import { directoryQuerySchema } from "@/lib/validations/ambassador-platform";

export const metadata: Metadata = { title: "Ambassador directory" };
export const dynamic = "force-dynamic";

/**
 * Phase 3 Section 2 — the Ambassador Directory: every ambassador with their
 * tier (from lifetime conversions), activity (from dates) and team, with
 * filters, sort and the "New ambassador" modal.
 */
export default async function AmbassadorDirectoryPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const flat = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const query = directoryQuerySchema.parse(flat);
  const now = new Date();
  const [result, options, universities, cores, pendingApplications, activity, partnerships] = await Promise.all([
    listDirectory(query, now),
    directoryFilterOptions(),
    db.university.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, abbreviation: true } }),
    listCoreOptions(),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
    directoryActivityCounts(now),
    partnershipOptions(),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassador directory"
        description="Every ambassador, their tier from lifetime conversions, and whether they are bringing students in right now."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BroadcastAction />
            <NewAmbassadorDialog universities={universities} cores={cores.filter((c) => c.subCount < MAX_SUB_AMBASSADORS)} partnerships={partnerships} />
          </div>
        }
      />
      <AmbassadorTabs active="directory" pendingApplications={pendingApplications} />

      <section className={STATS_GRID} aria-label="Network activity">
        <StatsCard label="Ambassadors" value={String(activity.total)} detail="Open accounts" icon={LuUsers} />
        <StatsCard label="Active" value={String(activity.ACTIVE)} detail="Converted in the last 30 days" icon={LuCircleCheck} tone="success" />
        <StatsCard label="Dormant" value={String(activity.DORMANT)} detail="No conversion for 30–60 days" icon={LuMoonStar} tone="gold" />
        <StatsCard label="New" value={String(activity.NEW)} detail="Joined in the last 30 days" icon={LuSparkles} />
      </section>

      <DirectoryFilters schools={options.schools} />

      <div className="space-y-4">
        <DirectoryTable rows={result.rows} sort={query.sort ?? "conversions"} dir={query.dir ?? (query.sort === "name" ? "asc" : "desc")} now={now.toISOString()} />
        <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} noun="ambassador" />
      </div>
    </div>
  );
}
