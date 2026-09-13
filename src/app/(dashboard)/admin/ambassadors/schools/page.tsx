import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LuBuilding2 } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { getSchoolCoverage } from "@/lib/services/ambassadors";
import { formatNaira } from "@/lib/utils";

export const metadata: Metadata = { title: "School coverage" };
export const dynamic = "force-dynamic";

export default async function SchoolCoveragePage() {
  const schools = await getSchoolCoverage();
  const covered = schools.filter((s) => s.total > 0);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/ambassadors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All ambassadors
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          School coverage
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ambassador presence and revenue by university. {covered.length} of {schools.length}{" "}
          universities have at least one ambassador.
        </p>
      </div>

      {covered.length === 0 ? (
        <EmptyState
          icon={LuBuilding2}
          title="No school coverage yet"
          description="Add ambassadors and assign them to universities to see coverage here."
          action={{ label: "Add ambassador", href: "/admin/ambassadors/new" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {covered.map((s) => {
            const fill = s.total > 0 ? Math.round((s.active / s.total) * 100) : 0;
            return (
              <div key={s.id} className="surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.abbreviation}</p>
                    <p className="text-xs text-muted-foreground">{s.name}</p>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {s.active}/{s.total}
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {formatNaira(s.revenueGenerated)} generated
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
