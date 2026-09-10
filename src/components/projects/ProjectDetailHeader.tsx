import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { ProjectHoldControl } from "@/components/projects/ProjectHoldControl";
import { cn, deadlineInfo, formatDate, formatNaira } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/services/projects";

const DEADLINE_TEXT = {
  none: "text-muted-foreground",
  ok: "text-muted-foreground",
  soon: "text-gold",
  urgent: "text-gold",
  critical: "text-danger",
  overdue: "text-danger font-semibold",
} as const;

export function ProjectDetailHeader({ project }: { project: ProjectDetail }) {
  const deadline = project.internalDeadline ?? project.clientDeadline;
  const info = deadlineInfo(deadline);
  const client = project.client;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All projects
        </Link>
        <ProjectHoldControl projectCode={project.projectId} status={project.status} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">
                {project.projectId}
              </h1>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-1 text-sm text-foreground">
              {project.service.serviceName}
              {project.projectTitle ? (
                <span className="text-muted-foreground"> · {project.projectTitle}</span>
              ) : null}
            </p>
          </div>
          <span className="font-mono text-lg font-medium tabular-nums text-foreground">
            {formatNaira(project.price)}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <Field label="Client">
            {client.fullName}
            <span className="block text-xs text-muted-foreground">
              {client.university?.abbreviation ?? "—"}
              {client.department ? ` · ${client.department}` : ""}
            </span>
          </Field>

          <Field label="Worker">
            {project.worker ? (
              <>
                {project.worker.fullName}
                <span className="block text-xs text-muted-foreground">
                  Assigned {formatDate(project.assignedDate)}
                </span>
              </>
            ) : (
              <span className="text-subtle">Unassigned</span>
            )}
          </Field>

          <Field label="Deadline">
            {formatDate(deadline)}
            {info.daysLeft !== null ? (
              <span className={cn("block text-xs", DEADLINE_TEXT[info.urgency])}>
                {info.label}
              </span>
            ) : (
              <span className="block text-xs text-muted-foreground">Not set</span>
            )}
          </Field>
        </dl>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
