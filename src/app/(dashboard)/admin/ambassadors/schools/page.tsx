import type { Metadata } from "next";
import { LuBuilding2, LuCircleCheck, LuCircleDashed, LuUsers } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { AmbassadorTabs } from "@/components/ambassadors/AmbassadorTabs";
import { db } from "@/lib/db";
import { getRosterSchools } from "@/lib/services/ambassador-roster";

export const metadata: Metadata = { title: "School coverage" };
export const dynamic = "force-dynamic";

const COLS = "md:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_5.5rem_5.5rem_minmax(0,11rem)_4.5rem]";

export default async function SchoolCoveragePage() {
  const [schools, pendingApplications] = await Promise.all([
    getRosterSchools(),
    db.ambassadorApplication.count({ where: { status: "PENDING" } }),
  ]);

  const total = schools.reduce((n, s) => n + s.total, 0);
  const active = schools.reduce((n, s) => n + s.active, 0);
  const vacant = total - active;
  const topShare = schools[0] && total ? Math.round((schools[0].total / total) * 100) : 0;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Ambassadors"
        description="Where EduCraft has ambassadors, ranked by presence. Counts include general slots, Core and Sub ambassadors."
      />
      <AmbassadorTabs active="schools" pendingApplications={pendingApplications} />

      {schools.length === 0 ? (
        <EmptyState
          icon={LuBuilding2}
          title="No school coverage yet"
          description="Add ambassadors in Manage to see coverage here."
        />
      ) : (
        <>
          <section className={STATS_GRID} aria-label="Coverage totals">
            <StatsCard label="Schools covered" value={String(schools.length)} icon={LuBuilding2} />
            <StatsCard label="Ambassadors" value={String(active)} detail={`${total} slots in total`} icon={LuUsers} />
            <StatsCard label="Vacant slots" value={String(vacant)} detail="Open to new applicants" icon={LuCircleDashed} tone="gold" />
            <StatsCard
              label="Largest school"
              value={schools[0].key}
              detail={`${topShare}% of the network`}
              icon={LuCircleCheck}
              tone="success"
            />
          </section>

          <section aria-label="Coverage by school">
            <div className={`hidden gap-4 border-b border-border/60 px-2 pb-2 md:grid ${COLS}`}>
              {["#", "School", "Slots", "Active", "Vacant", "Filled", "Share"].map((h, i) => (
                <span key={h} className={`meta-label ${i >= 2 && i !== 5 ? "text-right" : ""}`}>
                  {h}
                </span>
              ))}
            </div>

            <ul>
              {schools.map((s, i) => {
                const fill = s.total > 0 ? Math.round((s.active / s.total) * 100) : 0;
                const share = total > 0 ? Math.round((s.total / total) * 100) : 0;
                const showName = s.name && s.name !== s.key;
                return (
                  <li
                    key={s.key}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-border/40 px-2 py-3.5 last:border-0 ${COLS}`}
                  >
                    <span className="hidden font-mono text-xs tabular-nums text-muted-foreground md:block">{i + 1}</span>

                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{s.key}</span>
                      {showName ? <span className="block truncate text-xs text-muted-foreground">{s.name}</span> : null}
                    </span>

                    <span className="text-right font-mono text-sm tabular-nums text-foreground md:order-none">
                      {s.total}
                      <span className="ml-1 text-xs text-muted-foreground md:hidden">slots</span>
                    </span>
                    <span className="hidden text-right font-mono text-sm tabular-nums text-success md:block">{s.active}</span>
                    <span
                      className={`hidden text-right font-mono text-sm tabular-nums md:block ${s.vacant ? "text-gold" : "text-muted-foreground"}`}
                    >
                      {s.vacant}
                    </span>

                    <span className="col-span-2 flex items-center gap-3 md:col-span-1">
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border" aria-hidden>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{fill}%</span>
                    </span>

                    <span className="hidden text-right font-mono text-sm tabular-nums text-muted-foreground md:block">{share}%</span>

                    <span className="col-span-2 text-xs text-muted-foreground md:hidden">
                      {s.active} active · {s.vacant} vacant · {share}% of network
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
