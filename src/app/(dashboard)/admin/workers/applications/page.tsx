import type { Metadata } from "next";
import Link from "next/link";
import { LuArrowLeft, LuInbox } from "react-icons/lu";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { WorkerApplicationReview } from "@/components/workers/WorkerApplicationReview";
import { listWorkerApplications } from "@/lib/services/worker-applications";
import { countScreeningToReview, screeningStatusMap } from "@/lib/services/screening";
import { countFinalToReview, finalStatusMap } from "@/lib/services/final-practical";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Worker applications" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
] as const;

export default async function WorkerApplicationsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status =
    searchParams.status === "APPROVED" || searchParams.status === "REJECTED"
      ? searchParams.status
      : "PENDING";

  const rows = await listWorkerApplications(status);
  const [screening, final, toReview, finalToReview] = await Promise.all([
    status === "PENDING" ? screeningStatusMap(rows.map((r) => r.id)) : Promise.resolve({}),
    status === "PENDING" ? finalStatusMap(rows.map((r) => r.id)) : Promise.resolve({}),
    countScreeningToReview(),
    countFinalToReview(),
  ]);

  return (
    <div className="space-y-7">
      <Link
        href="/admin/workers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      >
        <LuArrowLeft className="size-4" aria-hidden />
        Manage Workers
      </Link>

      <PageHeader
        title="Worker applications"
        description="Review registrations submitted at /apply/worker. Approving creates the worker record and activates their login."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/workers/screening"
              className="inline-flex items-center gap-1.5 rounded-lg bg-zone px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-zone/70"
            >
              Screening results{toReview > 0 ? ` · ${toReview} to review` : ""}
            </Link>
            <Link
              href="/admin/workers/final"
              className="inline-flex items-center gap-1.5 rounded-lg bg-zone px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-zone/70"
            >
              Final assessments{finalToReview > 0 ? ` · ${finalToReview} to review` : ""}
            </Link>
          </div>
        }
      />

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/workers/applications?status=${t.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              status === t.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={LuInbox}
          title={`No ${status.toLowerCase()} applications`}
          description={
            status === "PENDING"
              ? "New registrations from /apply/worker show up here."
              : "Nothing here yet."
          }
        />
      ) : status === "PENDING" ? (
        <WorkerApplicationReview rows={rows} screening={screening} final={final} />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{row.fullName}</span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    row.status === "APPROVED"
                      ? "border-transparent bg-success/15 text-success"
                      : "border-transparent bg-danger/15 text-danger"
                  )}
                >
                  {row.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.phone} · {row.email} · applied {formatDate(row.createdAt)}
              </p>
              {row.reviewNote ? (
                <p className="mt-2 text-sm text-muted-foreground">Note: {row.reviewNote}</p>
              ) : null}
              {row.workerId ? (
                <Link
                  href={`/admin/workers/${row.workerId}`}
                  className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                >
                  View worker →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
