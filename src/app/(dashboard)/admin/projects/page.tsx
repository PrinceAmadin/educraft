import type { Metadata } from "next";
import Link from "next/link";
import { LuFolderKanban, LuPlus, LuSearchX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { ProjectsFilterBar } from "@/components/projects/ProjectsFilterBar";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { getFilterFacets, listProjects, PAGE_SIZE } from "@/lib/services/projects";
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

export default async function ProjectsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const parsed = projectListParamsSchema.parse(firstValue(searchParams));

  const [{ rows, total, page, pageCount }, facets] = await Promise.all([
    listProjects({
      status: parsed.status,
      serviceId: parsed.service,
      universityId: parsed.university,
      workerId: parsed.worker,
      payment: parsed.payment,
      from: parsed.from,
      to: parsed.to,
      q: parsed.q,
      flag: parsed.flag,
      page: parsed.page,
    }),
    getFilterFacets(),
  ]);

  const hasFilters =
    Boolean(
      parsed.status ||
        parsed.service ||
        parsed.university ||
        parsed.worker ||
        parsed.payment ||
        parsed.from ||
        parsed.to ||
        parsed.q ||
        parsed.flag
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Projects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every project across the pipeline. Filter, search, and open one to manage it.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/admin/projects/new">
            <LuPlus className="size-4" aria-hidden />
            New project
          </Link>
        </Button>
      </div>

      <ProjectsFilterBar facets={facets} />

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={LuSearchX}
            title="No projects match these filters"
            description="Try widening the date range or clearing a filter."
          />
        ) : (
          <EmptyState
            icon={LuFolderKanban}
            title="No projects yet"
            description="Projects will appear here when clients submit through the intake form, or when you create one manually."
          />
        )
      ) : (
        <div className="space-y-4">
          <ProjectsTable rows={rows} />
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
    </div>
  );
}
