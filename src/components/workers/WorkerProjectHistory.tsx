import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/projects/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LuFolderOpen } from "react-icons/lu";
import { formatDate, formatNaira } from "@/lib/utils";
import type { WorkerDetail } from "@/lib/services/workers";

export function WorkerProjectHistory({ projects }: { projects: WorkerDetail["projects"] }) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={LuFolderOpen}
        title="No assignments yet"
        description="Projects assigned to this worker will appear here."
        className="py-10"
      />
    );
  }

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/projects/${p.projectId}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors duration-fast hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium text-foreground">{p.projectId}</span>
                <StatusBadge status={p.status} short />
              </div>
              <p className="mt-1 truncate text-sm text-foreground">
                {p.projectTitle ?? p.service.serviceName}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{p.client.fullName}</span>
                <span className="font-mono">
                  {p.workerPayout != null ? formatNaira(p.workerPayout) : "—"}
                  {p.workerPayoutPaid ? " · paid" : ""}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-card hover:bg-card">
              <TableHead>Project</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="text-right">Payout</TableHead>
              <TableHead>Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id} className="bg-card">
                <TableCell>
                  <Link
                    href={`/admin/projects/${p.projectId}`}
                    className="font-mono text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                  >
                    {p.projectId}
                  </Link>
                  {p.projectTitle ? (
                    <div className="max-w-[24ch] truncate text-xs text-muted-foreground">
                      {p.projectTitle}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.service.serviceName}
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} short />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(p.internalDeadline)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {p.workerPayout != null ? formatNaira(p.workerPayout) : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {p.workerPayoutPaid ? (
                    <span className="text-success">Paid</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
