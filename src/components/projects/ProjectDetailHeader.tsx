import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
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

/**
 * Project identity on the page — ID, status, service and price as type — with
 * the three facts that matter most (client, worker, deadline) in one quiet zone
 * beneath. No card around any of it.
 */
export function ProjectDetailHeader({ project }: { project: ProjectDetail }) {
  const deadline = project.internalDeadline ?? project.clientDeadline;
  const info = deadlineInfo(deadline);
  const client = project.client;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/projects"
          className="-ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LuArrowLeft className="size-4" aria-hidden />
          All projects
        </Link>
        <ProjectHoldControl projectCode={project.projectId} status={project.status} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              {project.projectId}
            </h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1.5 text-[15px] text-foreground">
            {project.service.serviceName}
            {project.projectTitle ? (
              <span className="text-muted-foreground"> · {project.projectTitle}</span>
            ) : null}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="meta-label">Project price</p>
          <p className="mt-1 font-mono text-2xl font-medium leading-none tabular-nums text-foreground">
            {formatNaira(project.price)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 rounded-2xl bg-zone p-5 text-sm sm:grid-cols-3">
        <Field label="Client">
          {client.fullName}
          <span className="block text-[13px] text-muted-foreground">
            {client.university?.abbreviation ?? "—"}
            {client.department ? ` · ${client.department}` : ""}
          </span>
        </Field>

        <Field label="Worker">
          {project.worker ? (
            <>
              {project.worker.fullName}
              <span className="block text-[13px] text-muted-foreground">
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
            <span className={cn("block text-[13px]", DEADLINE_TEXT[info.urgency])}>{info.label}</span>
          ) : (
            <span className="block text-[13px] text-muted-foreground">Not set</span>
          )}
        </Field>
      </dl>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="meta-label">{label}</dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}
