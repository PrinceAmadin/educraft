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
import { formatDate, formatNaira, timeAgo } from "@/lib/utils";
import type { ClientListRow } from "@/lib/services/clients";

export function ClientsTable({ rows }: { rows: ClientListRow[] }) {
  return (
    <>
      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/clients/${row.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors duration-fast hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{row.fullName}</span>
                <span className="font-mono text-xs text-muted-foreground">{row.clientId}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.university ?? "—"} · {row.department}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">
                  {row.projectsCount} project{row.projectsCount === 1 ? "" : "s"}
                </span>
                <span className="font-mono text-foreground">{formatNaira(row.totalSpent)}</span>
                <span className="text-muted-foreground">
                  {row.lastActive ? `Active ${timeAgo(row.lastActive)}` : "No activity"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-card hover:bg-card">
              <TableHead>Client</TableHead>
              <TableHead>University</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="text-right">Total spent</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead>
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="bg-card">
                <TableCell>
                  <Link
                    href={`/admin/clients/${row.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                  >
                    {row.fullName}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{row.clientId}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.university ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.department}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.projectsCount}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatNaira(row.totalSpent)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.lastActive ? timeAgo(row.lastActive) : formatDate(null)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/clients/${row.id}`}
                    aria-label={`Open ${row.fullName}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
