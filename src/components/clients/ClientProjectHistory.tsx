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
import {
  PAYMENT_BADGE,
  paymentStanding,
  paymentStandingLabel,
} from "@/lib/project-display";
import { cn, formatDate, formatNaira } from "@/lib/utils";
import type { ClientDetail } from "@/lib/services/clients";

export function ClientProjectHistory({ projects }: { projects: ClientDetail["projects"] }) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={LuFolderOpen}
        title="No projects yet"
        description="When you create a project for this client it will show up here."
        className="py-10"
      />
    );
  }

  return (
    <>
      {/* Mobile */}
      <ul className="space-y-3 md:hidden">
        {projects.map((p) => {
          const standing = paymentStanding(p);
          return (
            <li key={p.id}>
              <Link
                href={`/admin/projects/${p.projectId}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors duration-fast hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {p.projectId}
                  </span>
                  <StatusBadge status={p.status} short />
                </div>
                <p className="mt-1 truncate text-sm text-foreground">
                  {p.projectTitle ?? p.service.serviceName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">{p.service.serviceName}</span>
                  <span className="font-mono text-foreground">{formatNaira(p.price)}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 font-medium",
                      PAYMENT_BADGE[standing]
                    )}
                  >
                    {paymentStandingLabel(p)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-card hover:bg-card">
              <TableHead>Project</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => {
              const standing = paymentStanding(p);
              return (
                <TableRow key={p.id} className="bg-card">
                  <TableCell>
                    <Link
                      href={`/admin/projects/${p.projectId}`}
                      className="font-mono text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                    >
                      {p.projectId}
                    </Link>
                    {p.projectTitle ? (
                      <div className="max-w-[26ch] truncate text-xs text-muted-foreground">
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
                    {formatDate(p.createdAt)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatNaira(p.price)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                        PAYMENT_BADGE[standing]
                      )}
                    >
                      {paymentStandingLabel(p)}
                    </span>
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
