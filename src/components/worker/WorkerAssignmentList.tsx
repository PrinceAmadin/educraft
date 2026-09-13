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

const DEADLINE_DOT = {
  none: "bg-transparent",
  ok: "bg-success/60",
  soon: "bg-gold",
  urgent: "bg-gold",
  critical: "bg-danger",
  overdue: "bg-danger",
} as const;

/** A worker's assignments as soft surfaces; urgency reads from a dot, not a coloured edge. */
export function WorkerAssignmentList({ rows }: { rows: WorkerAssignmentRow[] }) {
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {rows.map((row) => {
        const info = deadlineInfo(row.deadline);
        return (
          <li key={row.id}>
            <Link
              href={`/worker/projects/${row.projectId}`}
              className="surface block p-4 transition-shadow duration-fast hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-mono text-sm font-medium text-foreground">
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DEADLINE_DOT[info.urgency])} />
                  {row.projectId}
                </span>
                <StatusBadge status={row.status} short />
              </div>
              <p className="mt-2 truncate text-[15px] text-foreground">{row.projectTitle ?? row.serviceName}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {row.serviceName} · {row.clientName}
              </p>
              <div className="mt-4 flex items-center justify-between">
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
