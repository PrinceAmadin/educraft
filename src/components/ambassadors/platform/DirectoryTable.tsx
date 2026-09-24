"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LuArrowDown, LuArrowUp, LuArrowUpDown, LuEye, LuUsers } from "react-icons/lu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { ActivityBadge } from "@/components/ambassadors/platform/ActivityBadge";
import { SuspendControl } from "@/components/ambassadors/platform/SuspendControl";
import { EmptyState } from "@/components/shared/EmptyState";
import type { DirectoryRow } from "@/lib/services/ambassador-platform/directory";
import { relativeDays, shortMonthYear } from "@/lib/ambassadors/format";
import { cn } from "@/lib/utils";

type SortKey = "conversions" | "lastReferral" | "joined" | "name";

/**
 * The directory table: Name · School · Tier · Conversions · Active · Sub-team ·
 * Joined · Last referral · Actions. Cards on phones. Sorting is a link on
 * each sortable header (URL state, like the filters).
 */
export function DirectoryTable({ rows, sort, dir, now }: { rows: DirectoryRow[]; sort: SortKey; dir: "asc" | "desc"; now: string }) {
  const at = new Date(now);
  if (rows.length === 0) {
    return <EmptyState icon={LuUsers} title="No ambassadors match" description="Change or clear the filters, or add an ambassador." className="py-10" />;
  }
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/admin/ambassadors/${row.id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline">
                  {row.fullName}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">
                  {row.university ?? "—"} · {row.referralCode}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                <TierBadge tier={row.tier} />
                <ActivityBadge status={row.activity} />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <div>
                <dt className="meta-label">Conversions</dt>
                <dd className="font-mono text-sm text-foreground">{row.lifetimeConversions}</dd>
              </div>
              <div>
                <dt className="meta-label">Sub-team</dt>
                <dd className="text-sm text-foreground">
                  <TeamCell row={row} />
                </dd>
              </div>
              <div>
                <dt className="meta-label">Joined</dt>
                <dd className="text-sm text-foreground">{shortMonthYear(row.joinedAt)}</dd>
              </div>
              <div>
                <dt className="meta-label">Last referral</dt>
                <dd className="text-sm text-foreground">{relativeDays(row.lastReferralAt, at)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/admin/ambassadors/${row.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input-border bg-card px-3 text-sm font-medium text-foreground hover:bg-elevated">
                <LuEye className="size-4" aria-hidden />
                View
              </Link>
              <SuspendControl ambassadorId={row.id} fullName={row.fullName} status={row.status} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortHead label="Name" k="name" sort={sort} dir={dir} />
              <TableHead>School</TableHead>
              <TableHead>Tier</TableHead>
              <SortHead label="Conversions" k="conversions" sort={sort} dir={dir} align="right" />
              <TableHead>Active</TableHead>
              <TableHead>Sub-team</TableHead>
              <SortHead label="Joined" k="joined" sort={sort} dir={dir} />
              <SortHead label="Last referral" k="lastReferral" sort={sort} dir={dir} />
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/admin/ambassadors/${row.id}`} className="text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline">
                    {row.fullName}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{row.referralCode}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.university ?? "—"}</TableCell>
                <TableCell>
                  <TierBadge tier={row.tier} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{row.lifetimeConversions}</TableCell>
                <TableCell>
                  <ActivityBadge status={row.activity} />
                  {row.status !== "Active" ? <span className="ml-1.5 text-xs text-muted-foreground">{row.status}</span> : null}
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  <TeamCell row={row} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{shortMonthYear(row.joinedAt)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{relativeDays(row.lastReferralAt, at)}</TableCell>
                <TableCell>
                  <span className="flex items-center justify-end gap-1.5">
                    <Link href={`/admin/ambassadors/${row.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-elevated hover:text-foreground">
                      <LuEye className="size-4" aria-hidden />
                      View
                    </Link>
                    <SuspendControl ambassadorId={row.id} fullName={row.fullName} status={row.status} />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function TeamCell({ row }: { row: DirectoryRow }) {
  if (row.parent) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        Sub of{" "}
        <Link href={`/admin/ambassadors/${row.parent.id}`} className="text-foreground hover:text-primary">
          {row.parent.fullName}
        </Link>
      </span>
    );
  }
  if (row.subCount > 0) {
    return (
      <span>
        {row.subCount} Sub{row.subCount === 1 ? "" : "s"}
      </span>
    );
  }
  return <span className="text-subtle">—</span>;
}

function SortHead({ label, k, sort, dir, align }: { label: string; k: SortKey; sort: SortKey; dir: "asc" | "desc"; align?: "right" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = sort === k;
  const nextDir = active ? (dir === "desc" ? "asc" : "desc") : k === "name" ? "asc" : "desc";
  const next = new URLSearchParams(searchParams.toString());
  next.set("sort", k);
  next.set("dir", nextDir);
  next.delete("page");
  const Icon = active ? (dir === "desc" ? LuArrowDown : LuArrowUp) : LuArrowUpDown;
  return (
    <TableHead className={cn(align === "right" && "text-right")}>
      <Link
        href={`${pathname}?${next.toString()}`}
        scroll={false}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground", align === "right" && "flex-row-reverse")}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </Link>
    </TableHead>
  );
}
