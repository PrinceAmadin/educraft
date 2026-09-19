import type { Metadata } from "next";
import { LuBuilding2 } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { db } from "@/lib/db";
import { getRosterSchools } from "@/lib/services/ambassador-roster";

export const metadata: Metadata = { title: "School coverage" };
export const dynamic = "force-dynamic";

export default async function SchoolCoveragePage() {
  const [schools, pendingApplications] = await Promise.all([
    getRosterSchools(),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Where EduCraft has ambassadors. Counts include general slots, Core and Sub ambassadors."
      />
      <AmbassadorTabs active="schools" pendingApplications={pendingApplications} />

      <div className="flex items-center gap-2">
        <span className="meta-label">School coverage</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {schools.length} schools
        </span>
      </div>

      {schools.length === 0 ? (
        <EmptyState
          icon={LuBuilding2}
          title="No school coverage yet"
          description="Add ambassadors in Manage to see coverage here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {schools.map((s) => {
            const fill = s.total > 0 ? Math.round((s.active / s.total) * 100) : 0;
            return (
              <div key={s.key} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-foreground">{s.key}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.name}</p>
                  </div>
                  <span className="font-mono text-2xl font-medium tabular-nums text-primary">{s.total}</span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-success">{s.active} active</span>
                  <span className="text-gold">{s.vacant} vacant</span>
                  <span className="text-muted-foreground">{fill}% filled</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
