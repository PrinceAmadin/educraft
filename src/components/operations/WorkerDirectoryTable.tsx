import Link from "next/link";
import { LuArrowRight, LuMessageCircle, LuTriangleAlert } from "react-icons/lu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toWaNumber, waLink, greetingName } from "@/lib/whatsapp";
import { cn, timeAgo } from "@/lib/utils";
import type { WorkerDirectoryRow } from "@/lib/services/operations/workers-ops";
import type { WorkerActivityStatus } from "@/lib/operations/worker-performance";

const ACTIVITY_BADGE: Record<WorkerActivityStatus, string> = {
  Active: "bg-success/15 text-success",
  Busy: "bg-gold/15 text-gold",
  Inactive: "bg-danger/15 text-danger",
  "On Break": "bg-elevated text-muted-foreground",
  Suspended: "bg-danger/15 text-danger",
  Terminated: "bg-elevated text-subtle line-through",
};

function ActivityChip({ status }: { status: WorkerActivityStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", ACTIVITY_BADGE[status])}>{status === "Busy" ? "Busy — at capacity" : status}</span>;
}

function LoadPill({ row }: { row: WorkerDirectoryRow }) {
  const full = row.activeProjects >= row.maxConcurrentProjects;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs tabular-nums", full ? "bg-danger/15 text-danger" : row.busy ? "bg-gold/15 text-gold" : "bg-success/15 text-success")}>
      {row.activeProjects}/{row.maxConcurrentProjects}
    </span>
  );
}

function Flags({ row }: { row: WorkerDirectoryRow }) {
  if (row.tier2Flags === 0) return <span className="text-muted-foreground">0 flags</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono tabular-nums", row.tier2Warning ? "font-medium text-danger" : "text-gold")}>
      {row.tier2Flags} flag{row.tier2Flags === 1 ? "" : "s"}
      {row.tier2Warning ? <LuTriangleAlert className="size-3.5" aria-label="Three or more flags in 30 days" /> : null}
    </span>
  );
}

const quality = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}/5`);
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

function ContactLink({ row, className }: { row: WorkerDirectoryRow; className?: string }) {
  const wa = toWaNumber(row.phone);
  if (!wa) return null;
  return (
    <a
      href={waLink(wa, `Hi ${greetingName(row.fullName)}, this is EduCraft.`)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 text-[13px] text-primary underline-offset-4 hover:underline", className)}
    >
      <LuMessageCircle className="size-3.5" aria-hidden />
      Contact
    </a>
  );
}

/**
 * The worker directory: departments, live status (Active / Busy / Inactive /
 * Suspended), load against capacity, projects done, quality, Tier 2 flags
 * over the last 30 days and last activity. Cards on phones.
 */
export function WorkerDirectoryTable({ rows }: { rows: WorkerDirectoryRow[] }) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="surface p-4">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/admin/workers/${row.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                {row.fullName}
              </Link>
              <ActivityChip status={row.activity} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.workerId}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{row.departments.join(", ") || "No departments recorded"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                Load <LoadPill row={row} />
              </span>
              <span className="text-muted-foreground">Done {row.projectsDone}</span>
              <span className="text-muted-foreground">Quality {quality(row.avgQuality)}</span>
              <Flags row={row} />
              <span className="text-muted-foreground">{row.lastActiveAt ? `Active ${timeAgo(row.lastActiveAt)}` : "No activity yet"}</span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Link href={`/admin/workers/${row.id}`} className="text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                View
              </Link>
              <ContactLink row={row} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Departments</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Load</TableHead>
              <TableHead className="text-right">Done</TableHead>
              <TableHead className="text-right">Quality</TableHead>
              <TableHead className="text-right">On-time</TableHead>
              <TableHead>Tier 2 flags</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/admin/workers/${row.id}`} className="text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline">
                    {row.fullName}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.workerId}
                    {row.isQaReviewer ? " · QA reviewer" : ""}
                  </div>
                </TableCell>
                <TableCell className="max-w-[22ch] text-sm text-muted-foreground">
                  <span className="line-clamp-2">{row.departments.length ? row.departments.join(", ") : "—"}</span>
                </TableCell>
                <TableCell>
                  <ActivityChip status={row.activity} />
                </TableCell>
                <TableCell className="text-center">
                  <LoadPill row={row} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{row.projectsDone}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{quality(row.avgQuality)}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{pct(row.onTimeRate)}</TableCell>
                <TableCell className="text-sm">
                  <Flags row={row} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.lastActiveAt ? timeAgo(row.lastActiveAt) : "—"}</TableCell>
                <TableCell>
                  <span className="flex items-center justify-end gap-3">
                    {row.activity === "Inactive" ? <ContactLink row={row} /> : null}
                    <Link
                      href={`/admin/workers/${row.id}`}
                      aria-label={`Open ${row.fullName}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <LuArrowRight className="size-4" aria-hidden />
                    </Link>
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
