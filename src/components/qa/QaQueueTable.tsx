import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { cn, deadlineInfo, formatDate } from "@/lib/utils";
import type { QaQueueRow } from "@/lib/services/qa";

const DEADLINE_TEXT = {
  none: "text-muted-foreground",
  ok: "text-muted-foreground",
  soon: "text-gold",
  urgent: "text-gold",
  critical: "text-danger",
  overdue: "text-danger font-medium",
} as const;

export function QaQueueTable({ rows }: { rows: QaQueueRow[] }) {
  return (
    <>
      {/* Mobile */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => {
          const info = deadlineInfo(row.deadline);
          return (
            <li key={row.id}>
              <Link
                href={`/admin/qa/${row.projectId}`}
                className="block surface p-4 transition-shadow hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{row.workerName ?? "Unassigned"}</span>
                  <span className={DEADLINE_TEXT[info.urgency]}>
                    {info.daysLeft !== null ? info.label : "No deadline"}
                  </span>
                  {row.revisionCount > 0 ? (
                    <span className="text-gold">Rev #{row.revisionCount}</span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Project</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="text-center">Rev #</TableHead>
              <TableHead>
                <span className="sr-only">Review</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const info = deadlineInfo(row.deadline);
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/admin/qa/${row.projectId}`}
                      className="font-mono text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                    >
                      {row.projectId}
                    </Link>
                    <div className="max-w-[24ch] truncate text-xs text-muted-foreground">
                      {row.projectTitle ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.workerName ?? <span className="text-subtle">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.serviceName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.submittedAt ? formatDate(row.submittedAt) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={DEADLINE_TEXT[info.urgency]}>
                      {formatDate(row.deadline)}
                      {info.daysLeft !== null ? ` · ${info.label}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        row.revisionCount >= 3
                          ? "text-danger"
                          : row.revisionCount > 0
                            ? "text-gold"
                            : "text-muted-foreground"
                      )}
                    >
                      {row.revisionCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant={row.status === "SUBMITTED" ? "default" : "outline"}>
                      <Link href={`/admin/qa/${row.projectId}`}>
                        {row.status === "SUBMITTED" ? "Start" : "Continue"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
