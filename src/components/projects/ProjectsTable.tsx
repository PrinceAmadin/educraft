import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/projects/StatusBadge";
import {
  PAYMENT_BADGE,
  ROW_ACCENT_CLASS,
  paymentStanding,
  paymentStandingLabel,
  rowAccent,
} from "@/lib/project-display";
import { cn, deadlineInfo, formatDate, formatNaira } from "@/lib/utils";
import type { ProjectListRow } from "@/lib/services/projects";

const DEADLINE_TEXT = {
  none: "text-muted-foreground",
  ok: "text-muted-foreground",
  soon: "text-gold",
  urgent: "text-gold",
  critical: "text-danger",
  overdue: "text-danger font-medium",
} as const;

function DeadlineCell({ row }: { row: ProjectListRow }) {
  const deadline = row.internalDeadline ?? row.clientDeadline;
  const info = deadlineInfo(deadline);
  return (
    <div className="whitespace-nowrap">
      <div className="text-foreground">{formatDate(deadline)}</div>
      {info.daysLeft !== null ? (
        <div className={cn("text-xs", DEADLINE_TEXT[info.urgency])}>{info.label}</div>
      ) : null}
    </div>
  );
}

export function ProjectsTable({ rows }: { rows: ProjectListRow[] }) {
  return (
    <>
      {/* Mobile: cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => {
          const accent = rowAccent(row);
          const deadline = row.internalDeadline ?? row.clientDeadline;
          const info = deadlineInfo(deadline);
          const standing = paymentStanding(row);

          return (
            <li key={row.id}>
              <Link
                href={`/admin/projects/${row.projectId}`}
                className={cn(
                  "block rounded-xl border border-border bg-card p-4",
                  "transition-colors duration-fast hover:border-border-hover",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  ROW_ACCENT_CLASS[accent]
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {row.projectId}
                  </span>
                  <StatusBadge status={row.status} short />
                </div>

                <p className="mt-2 truncate text-sm text-foreground">
                  {row.projectTitle ?? "Untitled project"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.client.fullName}
                  {row.client.university?.abbreviation
                    ? ` · ${row.client.university.abbreviation}`
                    : ""}{" "}
                  · {row.service.serviceName}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">
                    {row.worker ? row.worker.fullName : "Unassigned"}
                  </span>
                  <span className={DEADLINE_TEXT[info.urgency]}>
                    {info.daysLeft !== null ? info.label : "No deadline"}
                  </span>
                  <span className="font-mono text-foreground">{formatNaira(row.price)}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 font-medium",
                      PAYMENT_BADGE[standing]
                    )}
                  >
                    {paymentStandingLabel(row)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-card hover:bg-card">
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const accent = rowAccent(row);
              const standing = paymentStanding(row);

              return (
                <TableRow key={row.id} className={cn("bg-card", ROW_ACCENT_CLASS[accent])}>
                  <TableCell>
                    <Link
                      href={`/admin/projects/${row.projectId}`}
                      className="font-mono text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                    >
                      {row.projectId}
                    </Link>
                    {row.projectTitle ? (
                      <div className="mt-0.5 max-w-[22ch] truncate text-xs text-muted-foreground">
                        {row.projectTitle}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.client.fullName}
                    {row.client.university?.abbreviation ? (
                      <div className="text-xs text-muted-foreground">
                        {row.client.university.abbreviation}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.service.serviceName}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} short />
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.worker ? (
                      row.worker.fullName
                    ) : (
                      <span className="text-subtle">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <DeadlineCell row={row} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatNaira(row.price)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                        PAYMENT_BADGE[standing]
                      )}
                    >
                      {paymentStandingLabel(row)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/projects/${row.projectId}`}
                      aria-label={`Open ${row.projectId}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
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
