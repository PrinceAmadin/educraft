import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { cn, deadlineInfo, formatDate } from "@/lib/utils";
import type { WorkerAssignmentRow } from "@/lib/services/worker-portal";

const DEADLINE_TEXT = {
  none: "text-muted-foreground",
  ok: "text-muted-foreground",
  soon: "text-gold",
  urgent: "text-gold",
  critical: "text-danger",
  overdue: "text-danger font-medium",
} as const;

export function WorkerAssignmentList({ rows }: { rows: WorkerAssignmentRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const info = deadlineInfo(row.deadline);
        return (
          <li key={row.id}>
            <Link
              href={`/worker/projects/${row.projectId}`}
              className={cn(
                "block rounded-xl border border-border bg-card p-4 transition-colors",
                "hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                info.urgency === "overdue" && "border-l-2 border-l-danger",
                (info.urgency === "urgent" || info.urgency === "critical" || info.urgency === "soon") &&
                  "border-l-2 border-l-gold"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium text-foreground">
                  {row.projectId}
                </span>
                <StatusBadge status={row.status} short />
              </div>
              <p className="mt-1 truncate text-sm text-foreground">
                {row.projectTitle ?? row.serviceName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.serviceName} · {row.clientName}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className={cn("text-xs", DEADLINE_TEXT[info.urgency])}>
                  {row.deadline
                    ? `${formatDate(row.deadline)}${info.daysLeft !== null ? ` · ${info.label}` : ""}`
                    : "No deadline set"}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  View
                  <LuArrowRight className="size-3.5" aria-hidden />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
