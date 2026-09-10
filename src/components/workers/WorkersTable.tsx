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
import { WORKER_STATUS_BADGE } from "@/lib/worker-metrics";
import { cn, formatNaira } from "@/lib/utils";
import type { WorkerListRow } from "@/lib/services/workers";

function pctText(v: number | null) {
  return v == null ? "—" : `${v}%`;
}

function ratingText(v: number | null) {
  return v == null ? "—" : `${v.toFixed(1)}/5`;
}

function LoadPill({ row }: { row: WorkerListRow }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs tabular-nums",
        row.atCapacity
          ? "border-transparent bg-danger/15 text-danger"
          : "border-transparent bg-success/15 text-success"
      )}
    >
      {row.load}
    </span>
  );
}

export function WorkersTable({ rows }: { rows: WorkerListRow[] }) {
  return (
    <>
      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/workers/${row.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors duration-fast hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{row.fullName}</span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    WORKER_STATUS_BADGE[row.status] ?? "border-border bg-elevated text-muted-foreground"
                  )}
                >
                  {row.status}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.workerId}</p>
              {row.specialties.length > 0 ? (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {row.specialties.join(", ")}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  Load <LoadPill row={row} />
                </span>
                <span className="text-muted-foreground">Rating {ratingText(row.rating)}</span>
                <span className="text-muted-foreground">On-time {pctText(row.onTimeRate)}</span>
                <span className="font-mono text-foreground">{formatNaira(row.payoutBalance)}</span>
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
              <TableHead>Worker</TableHead>
              <TableHead>Specialties</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Load</TableHead>
              <TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right">On-time</TableHead>
              <TableHead className="text-right">Revisions</TableHead>
              <TableHead className="text-right">Balance</TableHead>
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
                    href={`/admin/workers/${row.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                  >
                    {row.fullName}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{row.workerId}</div>
                </TableCell>
                <TableCell className="max-w-[22ch] text-sm text-muted-foreground">
                  <span className="line-clamp-1">
                    {row.specialties.length > 0 ? row.specialties.join(", ") : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      WORKER_STATUS_BADGE[row.status] ??
                        "border-border bg-elevated text-muted-foreground"
                    )}
                  >
                    {row.status}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <LoadPill row={row} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {ratingText(row.rating)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {pctText(row.onTimeRate)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {pctText(row.revisionRate)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatNaira(row.payoutBalance)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/workers/${row.id}`}
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
