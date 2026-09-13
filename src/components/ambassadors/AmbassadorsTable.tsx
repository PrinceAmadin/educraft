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
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { formatNaira } from "@/lib/utils";
import type { AmbassadorListRow } from "@/lib/services/ambassadors";

export function AmbassadorsTable({ rows }: { rows: AmbassadorListRow[] }) {
  return (
    <>
      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/ambassadors/${row.id}`}
              className="block surface p-4 transition-shadow duration-fast hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{row.fullName}</span>
                <TierBadge tier={row.tier} />
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {row.ambassadorId} · {row.university ?? "—"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-mono text-foreground">{row.conversions}</span>/{row.referrals}{" "}
                  converted
                </span>
                <span className="font-mono">{row.rate}%</span>
                <span className="font-mono">{formatNaira(row.revenueGenerated)} generated</span>
                <span className="font-mono text-foreground">
                  {formatNaira(row.commissionBalance)} owed
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Ambassador</TableHead>
              <TableHead>University</TableHead>
              <TableHead className="text-right">Referrals</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/admin/ambassadors/${row.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                  >
                    {row.fullName}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{row.ambassadorId}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.university ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.referrals}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.conversions}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.rate}%
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatNaira(row.revenueGenerated)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {formatNaira(row.commissionBalance)}
                </TableCell>
                <TableCell>
                  <TierBadge tier={row.tier} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/ambassadors/${row.id}`}
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
