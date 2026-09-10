import { LuGitCommitVertical } from "react-icons/lu";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/services/projects";

export function TimelineTab({ project }: { project: ProjectDetail }) {
  if (project.statusLog.length === 0) {
    return (
      <EmptyState
        icon={LuGitCommitVertical}
        title="No history yet"
        description="Each status change is recorded here with who made it and when."
        className="py-10"
      />
    );
  }

  return (
    <ol className="relative space-y-5 pl-6">
      <span
        className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
        aria-hidden
      />
      {project.statusLog.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className="absolute -left-6 top-1 size-3.5 rounded-full border-2 border-background bg-primary"
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.toStatus} />
            <span className="text-xs text-muted-foreground">
              from {entry.fromStatus.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(entry.createdAt)}
            {entry.changedBy?.displayName || entry.changedBy?.email
              ? ` · ${entry.changedBy.displayName ?? entry.changedBy.email}`
              : ""}
          </p>
          {entry.notes ? (
            <p className="mt-1 text-sm text-foreground">{entry.notes}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
