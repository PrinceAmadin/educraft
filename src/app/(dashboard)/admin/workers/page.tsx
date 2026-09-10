import type { Metadata } from "next";
import Link from "next/link";
import { LuUserCog, LuSearchX, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { WorkersFilterBar } from "@/components/workers/WorkersFilterBar";
import { WorkersTable } from "@/components/workers/WorkersTable";
import { getWorkerSpecialties, listWorkers, WORKER_PAGE_SIZE } from "@/lib/services/workers";
import { workerListParamsSchema } from "@/lib/validations/workers";

export const metadata: Metadata = { title: "Workers" };
export const dynamic = "force-dynamic";

export default async function WorkersListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parsed = workerListParamsSchema.parse(flat);

  const [{ rows, total, page, pageCount }, specialties] = await Promise.all([
    listWorkers({
      status: parsed.status,
      specialty: parsed.specialty,
      availability: parsed.availability,
      q: parsed.q,
      page: parsed.page,
    }),
    getWorkerSpecialties(),
  ]);

  const hasFilters = Boolean(
    parsed.status || parsed.specialty || parsed.availability || parsed.q
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Workers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The people who deliver the work. Load, quality, and payout balance at a glance.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/admin/workers/new">
            <LuPlus className="size-4" aria-hidden />
            Add worker
          </Link>
        </Button>
      </div>

      <WorkersFilterBar specialties={specialties} />

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={LuSearchX}
            title="No workers match these filters"
            description="Try a different status, specialty, or clear the filters."
          />
        ) : (
          <EmptyState
            icon={LuUserCog}
            title="No workers yet"
            description="Add your first worker to start assigning projects."
            action={{ label: "Add worker", href: "/admin/workers/new" }}
          />
        )
      ) : (
        <div className="space-y-4">
          <WorkersTable rows={rows} />
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={WORKER_PAGE_SIZE} />
        </div>
      )}
    </div>
  );
}
