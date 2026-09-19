"use client";

import * as React from "react";
import Link from "next/link";
import { LuSearch, LuSearchX } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { CopyLinkButton } from "@/components/ambassadors/CopyLinkButton";
import { cn } from "@/lib/utils";
import type { RosterRow } from "@/lib/services/ambassador-roster";

type Filter = "all" | "active" | "vacant";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "vacant", label: "Vacant" },
];

export function StatusPill({ vacant }: { vacant: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        vacant ? "bg-gold/15 text-gold" : "bg-success/15 text-success"
      )}
    >
      {vacant ? "Vacant" : "Active"}
    </span>
  );
}

export function SchoolChip({ school }: { school: string }) {
  return (
    <span className="inline-block rounded-md bg-zone px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {school || "-"}
    </span>
  );
}

/**
 * The Ambassadors tab: every general slot (filled or vacant) with its
 * shareable link and a Copy button. Filtering is client-side; the whole
 * roster is a few dozen rows.
 */
export function RosterBoard({ rows }: { rows: RosterRow[] }) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const shown = rows.filter((r) => {
    if (filter === "active" && r.vacant) return false;
    if (filter === "vacant" && !r.vacant) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [r.code, r.name, r.school, `educrafta-${r.code}`].some((v) => v.toLowerCase().includes(needle));
  });

  return (
    <section className="space-y-4" aria-label="Ambassador slots">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <LuSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, slot ID, school"
            className="pl-10"
            aria-label="Search slots"
          />
        </div>
        <div className="inline-flex gap-1 rounded-xl bg-zone p-1" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "min-h-10 flex-1 rounded-lg px-4 text-sm font-medium transition-colors sm:flex-none",
                filter === f.key ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={LuSearchX} title="No slots match" description="Try a different search or clear the filter." />
      ) : (
        <div>
          <div className="hidden grid-cols-[3rem_9rem_minmax(0,1fr)_7rem_6rem_10rem_5.5rem] gap-3 border-b border-border/60 px-2 pb-2 text-left md:grid">
            {["No.", "Slot ID", "Name", "School", "Status", "Link", ""].map((h, i) => (
              <span key={i} className="meta-label">
                {h}
              </span>
            ))}
          </div>
          <ul>
            {shown.map((r, i) => (
              <li
                key={r.code}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border/40 px-2 py-3 last:border-0 md:grid-cols-[3rem_9rem_minmax(0,1fr)_7rem_6rem_10rem_5.5rem]"
              >
                <span className="hidden font-mono text-xs tabular-nums text-muted-foreground md:block">{i + 1}.</span>
                <span className="order-3 col-span-2 font-mono text-xs text-primary md:order-none md:col-span-1">
                  EduCraftA-{r.code}
                </span>
                <span className="min-w-0 md:order-none">
                  {r.vacant ? (
                    <span className="text-sm italic text-muted-foreground">Unassigned</span>
                  ) : r.ambassadorId ? (
                    <Link
                      href={`/admin/ambassadors/${r.ambassadorId}`}
                      className="truncate text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {r.name}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-semibold text-foreground">{r.name}</span>
                  )}
                </span>
                <span className="hidden md:block">
                  <SchoolChip school={r.school} />
                </span>
                <span className="justify-self-end md:justify-self-start">
                  <StatusPill vacant={r.vacant} />
                </span>
                <span className="hidden truncate font-mono text-xs text-gold md:block">{r.linkPath}</span>
                <span className="order-4 col-span-2 flex items-center justify-between gap-3 md:order-none md:col-span-1 md:justify-end">
                  <span className="md:hidden">
                    <SchoolChip school={r.school} />
                  </span>
                  <CopyLinkButton path={r.linkPath} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
