import type { Metadata } from "next";
import Link from "next/link";
import { LuUserCog, LuSearchX, LuInbox } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { WorkerDirectoryFilterBar } from "@/components/operations/WorkerDirectoryFilterBar";
import { WorkerDirectoryTable } from "@/components/operations/WorkerDirectoryTable";
import { AddWorkerDialog } from "@/components/operations/AddWorkerDialog";
import { WorkerRegistrationLinkCard } from "@/components/workers/WorkerRegistrationLinkCard";
import { listWorkerDirectory, WORKER_DIRECTORY_PAGE_SIZE } from "@/lib/services/operations/workers-ops";
import { countPendingWorkerApplications } from "@/lib/services/worker-applications";
import { workerDirectoryQuerySchema } from "@/lib/validations/operations";

export const metadata: Metadata = { title: "Manage Workers" };
export const dynamic = "force-dynamic";

/**
 * The worker directory: who can take work, how loaded they are, how they
 * perform, and who has gone quiet — with the COO's Add worker form a click away.
 */
export default async function WorkersListPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const flat = Object.fromEntries(Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = workerDirectoryQuerySchema.parse(flat);

  const [{ rows, total, page, pageCount, departments }, pendingApplications] = await Promise.all([
    listWorkerDirectory({ dept: parsed.dept, status: parsed.status, q: parsed.q, page: parsed.page }),
    countPendingWorkerApplications(),
  ]);

  const hasFilters = Boolean(parsed.status || parsed.dept || parsed.q);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Manage Workers"
        description="The people who deliver the work: load, quality, reference flags and who has gone quiet."
        actions={
          <>
            <Button asChild size="sm" variant="outline" className="relative">
              <Link href="/admin/workers/applications">
                <LuInbox className="size-4" aria-hidden />
                Applications
                {pendingApplications > 0 ? (
                  <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gold px-1.5 py-0.5 text-[11px] font-semibold leading-none text-gold-foreground">
                    {pendingApplications}
                  </span>
                ) : null}
              </Link>
            </Button>
            <AddWorkerDialog />
          </>
        }
      />

      <WorkerRegistrationLinkCard />

      <WorkerDirectoryFilterBar departments={departments} />

      {rows.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={LuSearchX} title="No workers match these filters" description="Try a different status or department, or clear the filters." />
        ) : (
          <EmptyState icon={LuUserCog} title="No workers yet" description="Add your first worker to start assigning projects." action={{ label: "Add worker", href: "/admin/workers/new" }} />
        )
      ) : (
        <div className="space-y-4">
          <WorkerDirectoryTable rows={rows} />
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={WORKER_DIRECTORY_PAGE_SIZE} />
        </div>
      )}
    </div>
  );
}
