"use client";

import * as React from "react";
import Link from "next/link";
import { LuChevronDown, LuChevronRight, LuChevronsDownUp, LuChevronsUpDown, LuSearch, LuUsers } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TierBadge } from "@/components/ambassadors/TierBadge";
import { ActivityBadge } from "@/components/ambassadors/platform/ActivityBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { TIER_LADDER } from "@/lib/ambassador";
import type { NetworkCluster, NetworkMap, NetworkPerson, NetworkSolo } from "@/lib/services/ambassador-platform/network";
import { cn } from "@/lib/utils";

type Show = "all" | "core" | "solo";

/** A flattened, visible row — what the list (windowed past 200 rows) renders. */
type Row =
  | { kind: "core"; cluster: NetworkCluster; dim: boolean; expanded: boolean; shownSubs: number }
  | { kind: "sub"; person: NetworkPerson }
  | { kind: "hidden"; count: number; coreId: string }
  | { kind: "solo"; person: NetworkSolo };

const ROW_HEIGHT = 64;
const WINDOW_AFTER = 200;
const OVERSCAN = 8;

/**
 * The card tree: Core clusters with their Sub-team indented underneath
 * (expand / collapse per Core), then solo ambassadors. Filters are instant
 * (client side). Past 200 visible rows the list is windowed so a large
 * network stays smooth on a phone.
 */
export function NetworkTree({ data }: { data: NetworkMap }) {
  const [school, setSchool] = React.useState("");
  const [tier, setTier] = React.useState("");
  const [show, setShow] = React.useState<Show>("all");
  const [q, setQ] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());

  const needle = q.trim().toLowerCase();
  const matches = React.useCallback(
    (p: NetworkPerson) => (!school || p.schoolId === school) && (!tier || p.tier === tier) && (!needle || p.fullName.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle)),
    [school, tier, needle]
  );
  const filtering = Boolean(school || tier || needle);

  const rows = React.useMemo(() => {
    const out: Row[] = [];
    if (show !== "solo") {
      for (const c of data.clusters) {
        // Filters narrow people, not structure: a cluster shows when its Core or any Sub matches; a Core that
        // does not match is dimmed for context, and Subs that do not match are counted, not listed.
        const coreMatches = matches(c);
        const visibleSubs = filtering ? c.subs.filter(matches) : c.subs;
        if (!coreMatches && visibleSubs.length === 0) continue;
        const expanded = !collapsed.has(c.id);
        out.push({ kind: "core", cluster: c, dim: !coreMatches, expanded, shownSubs: visibleSubs.length });
        if (expanded) {
          for (const s of visibleSubs) out.push({ kind: "sub", person: s });
          if (visibleSubs.length < c.subs.length) out.push({ kind: "hidden", count: c.subs.length - visibleSubs.length, coreId: c.id });
        }
      }
    }
    if (show !== "core") for (const s of data.solos) if (matches(s)) out.push({ kind: "solo", person: s });
    return out;
  }, [data, show, matches, filtering, collapsed]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="relative col-span-2 block sm:col-span-1">
          <span className="mb-1 block meta-label">Search</span>
          <LuSearch className="pointer-events-none absolute left-3 top-[34px] size-4 text-subtle" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or ID" className="h-11 pl-9 text-sm" aria-label="Search the network" />
        </label>
        <label className="block">
          <span className="mb-1 block meta-label">School</span>
          <Select value={school} onChange={(e) => setSchool(e.target.value)} className="h-11 text-sm" aria-label="Filter by school">
            <option value="">All schools</option>
            {data.schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.abbreviation}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block meta-label">Tier</span>
          <Select value={tier} onChange={(e) => setTier(e.target.value)} className="h-11 text-sm" aria-label="Filter by tier">
            <option value="">All tiers</option>
            {TIER_LADDER.map((t) => (
              <option key={t.tier} value={t.tier}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <fieldset className="col-span-2 sm:col-span-1">
          <legend className="mb-1 block meta-label">Show only</legend>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-zone p-1">
            {(
              [
                ["all", "All"],
                ["core", "Cores"],
                ["solo", "Solo"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)} className={cn("min-h-9 rounded-lg text-sm font-medium transition-colors", show === v ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {show === "solo" ? "Solo ambassadors" : show === "core" ? "Cores with a Sub-team" : "Core clusters, then solo ambassadors"}
          {filtering ? " matching the filters" : ""} · <span className="font-mono">{rows.filter((r) => r.kind !== "hidden").length}</span> row{rows.length === 1 ? "" : "s"}
        </p>
        {show !== "solo" && data.clusters.length > 0 ? (
          <span className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setCollapsed(new Set())}>
              <LuChevronsUpDown className="size-4" aria-hidden />
              Expand all
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCollapsed(new Set(data.clusters.map((c) => c.id)))}>
              <LuChevronsDownUp className="size-4" aria-hidden />
              Collapse all
            </Button>
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={LuUsers} title="Nobody matches" description="Change or clear the filters." className="py-10" />
      ) : rows.length > WINDOW_AFTER ? (
        <WindowedRows rows={rows} onToggle={toggle} />
      ) : (
        <ul className="divide-y divide-border/70">
          {rows.map((r) => (
            <li key={rowKey(r)}>
              <RowView row={r} onToggle={toggle} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function rowKey(r: Row): string {
  return r.kind === "core" ? `c:${r.cluster.id}` : r.kind === "hidden" ? `h:${r.coreId}` : `${r.kind}:${r.person.id}`;
}

/** Fixed-height rows in a scroll box: only what is on screen (plus a margin) is in the DOM. */
function WindowedRows({ rows, onToggle }: { rows: Row[]; onToggle: (id: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [height, setHeight] = React.useState(600);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  return (
    <div ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="max-h-[70vh] overflow-y-auto" role="list" aria-label="Ambassador network">
      <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
        {rows.slice(start, end).map((r, i) => (
          <div key={rowKey(r)} role="listitem" style={{ position: "absolute", top: (start + i) * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }} className="border-b border-border/70">
            <RowView row={r} onToggle={onToggle} fixed />
          </div>
        ))}
      </div>
    </div>
  );
}

function RowView({ row, onToggle, fixed }: { row: Row; onToggle: (id: string) => void; fixed?: boolean }) {
  if (row.kind === "hidden") {
    return <p className={cn("py-2 pl-12 text-xs text-muted-foreground", fixed && "flex h-full items-center py-0")}>{row.count} more Sub{row.count === 1 ? "" : "s"} hidden by the filters</p>;
  }
  if (row.kind === "core") {
    const c = row.cluster;
    return (
      <div className={cn("flex items-center gap-2 py-2.5 sm:gap-3", fixed && "h-full py-0", row.dim && "opacity-60")}>
        <button type="button" onClick={() => onToggle(c.id)} aria-expanded={row.expanded} aria-label={`${row.expanded ? "Collapse" : "Expand"} ${c.fullName}'s Sub-team`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-elevated hover:text-foreground">
          {row.expanded ? <LuChevronDown className="size-4" aria-hidden /> : <LuChevronRight className="size-4" aria-hidden />}
        </button>
        <Person
          p={c}
          strong
          extra={
            <button type="button" onClick={() => onToggle(c.id)} className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", c.atCapacity ? "bg-gold/15 text-gold" : "bg-primary/10 text-primary")}>
              {c.subs.length}/10 Sub{c.subs.length === 1 ? "" : "s"}
              {row.expanded ? "" : <span className="hidden sm:inline"> — click to expand</span>}
            </button>
          }
        />
      </div>
    );
  }
  if (row.kind === "sub") {
    return (
      <div className={cn("flex items-center gap-2 py-2 pl-11 sm:gap-3 sm:pl-12", fixed && "h-full py-0")}>
        <span aria-hidden className="h-full min-h-8 w-3 shrink-0 self-stretch border-l-2 border-border/80" />
        <Person p={row.person} />
      </div>
    );
  }
  const s = row.person;
  return (
    <div className={cn("flex items-center gap-2 py-2.5 pl-11 sm:gap-3", fixed && "h-full py-0")}>
      <Person p={s} extra={<span className="truncate text-xs text-muted-foreground" title={s.formerCore ? `Solo — Core ${s.formerCore} has left` : undefined}>{s.formerCore ? `Solo — Core ${s.formerCore} has left` : "Solo"}</span>} />
    </div>
  );
}

/**
 * One person on a row: name | tier | school | conversions | status | extra.
 * Aligned columns from `sm`; on a phone two short lines (name and tier, then
 * school · conversions · status), which also fit the windowed rows' fixed
 * 64px height without clipping.
 */
function Person({ p, strong, extra }: { p: NetworkPerson; strong?: boolean; extra?: React.ReactNode }) {
  const convs = `${p.conversions} conv${p.conversions === 1 ? "" : "s"}`;
  const account = p.accountStatus ? <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">{p.accountStatus}</span> : null;
  return (
    <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_6.5rem_5rem_5.5rem_6rem_minmax(0,11rem)] sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Link href={`/admin/ambassadors/${p.id}`} className={cn("min-w-0 truncate text-sm hover:text-primary focus-visible:outline-none focus-visible:underline", strong ? "font-semibold text-foreground" : "text-foreground")}>
          {p.fullName}
        </Link>
        <span className="shrink-0 sm:hidden">
          <TierBadge tier={p.tier} />
        </span>
      </div>
      <span className="hidden sm:block">
        <TierBadge tier={p.tier} />
      </span>
      <span className="hidden truncate text-sm text-muted-foreground sm:block">{p.school ?? "—"}</span>
      <span className="hidden whitespace-nowrap font-mono text-sm tabular-nums text-foreground sm:block">{convs}</span>
      <span className="hidden sm:block">
        <ActivityBadge status={p.activity} />
      </span>
      <span className="hidden min-w-0 items-center justify-end gap-2 sm:flex">
        {account}
        {extra}
      </span>
      <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted-foreground sm:hidden">
        <span className="shrink-0">{p.school ?? "—"}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0 font-mono text-foreground">{convs}</span>
        <ActivityBadge status={p.activity} className="shrink-0" />
        {account}
        {extra}
      </div>
    </div>
  );
}
