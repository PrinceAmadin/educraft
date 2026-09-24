import type { Metadata } from "next";
import Link from "next/link";
import { LuFolderKanban, LuGift, LuPlus, LuSearchX } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ProjectsFilterBar } from "@/components/projects/ProjectsFilterBar";
import { ProjectsTable, type ProjectListRowWithAge } from "@/components/projects/ProjectsTable";
import { OpsPipelineBar } from "@/components/operations/OpsPipelineBar";
import { OpsActionRequired } from "@/components/operations/OpsActionRequired";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { getFilterFacets, listProjects, PAGE_SIZE } from "@/lib/services/projects";
import { getOperationsOverview } from "@/lib/services/operations/pipeline";
import { statusAge } from "@/lib/operations/pipeline-stages";
import { projectListParamsSchema } from "@/lib/validations/projects";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(params: SearchParams): Record<string, string | undefined> {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  return flat;
}

/**
 * The project pipeline, the COO's command centre: the pipeline bar (click a
 * stage to filter), what needs a hand today, then the list with days in
 * status and one-click assignment.
 */
export default async function ProjectsListPage({ searchParams }: { searchParams: SearchParams }) {
  const parsed = projectListParamsSchema.parse(firstValue(searchParams));
  const now = new Date();
  const session = await auth();

  const [{ rows, total, page, pageCount }, facets, overview] = await Promise.all([
    listProjects(
      {
        status: parsed.status,
        stage: parsed.stage,
        serviceId: parsed.service,
        universityId: parsed.university,
        workerId: parsed.worker,
        department: parsed.dept,
        payment: parsed.payment,
        deadline: parsed.deadline,
        from: parsed.from,
        to: parsed.to,
        q: parsed.q,
        flag: parsed.flag,
        page: parsed.page,
      },
      now
    ),
    getFilterFacets(),
    getOperationsOverview(now),
  ]);

  const enriched: ProjectListRowWithAge[] = rows.map((row) => ({
    ...row,
    age: statusAge(row.statusLog[0]?.createdAt ?? row.createdAt, row.status, overview.expected, now),
  }));

  const hasFilters = Boolean(
    parsed.status || parsed.stage || parsed.service || parsed.university || parsed.worker || parsed.dept || parsed.payment || parsed.deadline || parsed.from || parsed.to || parsed.q || parsed.flag
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Every project between payment and completion. The bar shows where the work sits; the list below is what needs a hand."
        actions={
          <div className="flex flex-wrap gap-2">
            {session?.user?.role === "SUPER_ADMIN" ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/projects/probono">
                  <LuGift className="size-4" aria-hidden />
                  Pro bono links
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm">
              <Link href="/admin/projects/new">
                <LuPlus className="size-4" aria-hidden />
                New project
              </Link>
            </Button>
          </div>
        }
      />

      <OpsPipelineBar summary={overview.summary} activeStage={parsed.stage} />

      <OpsActionRequired actions={overview.actions} />

      <div className="space-y-5">
        <h2 className="text-[15px] font-semibold text-foreground">
          All projects
          <span className="ml-2 font-mono text-[13px] font-normal tabular-nums text-muted-foreground">{total}</span>
        </h2>
        <ProjectsFilterBar facets={facets} />

        {enriched.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={LuSearchX} title="No projects match these filters" description="Try widening the date range or clearing a filter." />
          ) : (
            <EmptyState
              icon={LuFolderKanban}
              title="No projects yet"
              description="Projects will appear here when clients submit through the intake form, or when you create one manually."
            />
          )
        ) : (
          <div className="space-y-4">
            <ProjectsTable rows={enriched} />
            <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} />
          </div>
        )}
      </div>
    </div>
  );
}
