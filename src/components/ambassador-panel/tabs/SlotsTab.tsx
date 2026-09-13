"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrigin, usePanel } from "@/components/ambassador-panel/context";
import { CopyButton, Empty, Pills, SearchBox, Stat, StatusPill } from "@/components/ambassador-panel/shared";
import { referralPath, referralUrl, slotLabel } from "@/lib/ambassador-panel/links";

type Filter = "all" | "active" | "vacant";

/** Every general slot with its client link — the original "Ambassadors" tab. */
export function SlotsTab() {
  const { data } = usePanel();
  const origin = useOrigin();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const entries = React.useMemo(
    () => Object.entries(data.roster.slots).sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10)),
    [data.roster.slots]
  );
  const total = entries.length;
  const active = entries.filter(([, s]) => s.status === "active").length;
  const needle = q.trim().toLowerCase();
  const rows = entries.filter(
    ([id, s]) =>
      (filter === "all" || s.status === filter) &&
      (!needle || id.includes(needle) || s.name.toLowerCase().includes(needle) || s.school.toLowerCase().includes(needle))
  );

  return (
    <div className="space-y-8">
      <section aria-label="Slot summary" className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        <Stat label="Total slots" value={total} />
        <Stat label="Active" value={active} tone="primary" />
        <Stat label="Vacant" value={total - active} tone="gold" />
        <Stat label="Fill rate" value={`${total ? Math.round((active / total) * 100) : 0}%`} />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, slot ID or school" className="sm:max-w-sm sm:flex-1" />
        <Pills
          label="Filter slots"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "vacant", label: "Vacant" },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Empty>No slots match your search.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-border/80 md:hidden">
            {rows.map(([id, s]) => (
              <li key={id} className="py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{slotLabel(id)}</span>
                  <StatusPill status={s.status} />
                </div>
                <p className="mt-1 text-[15px] text-foreground">
                  {s.status === "active" && s.name ? s.name : <span className="italic text-subtle">Unassigned</span>}
                  {s.school ? <span className="text-[13px] text-muted-foreground"> · {s.school}</span> : null}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">{referralPath(id)}</span>
                  <CopyButton value={referralUrl(origin, id)} disabled={s.status === "vacant"} label="Copy link" />
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Slot</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>
                    <span className="sr-only">Copy link</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(([id, s]) => (
                  <TableRow key={id}>
                    <TableCell className="font-mono text-sm font-medium">{slotLabel(id)}</TableCell>
                    <TableCell>
                      {s.status === "active" && s.name ? s.name : <span className="italic text-subtle">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.school || "—"}</TableCell>
                    <TableCell>
                      <StatusPill status={s.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{referralPath(id)}</TableCell>
                    <TableCell className="text-right">
                      <CopyButton value={referralUrl(origin, id)} disabled={s.status === "vacant"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
