"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuSearch, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PIPELINE_STATUSES, STATUS_META } from "@/lib/status";
import type { ProjectStatus } from "@prisma/client";
import type { FilterFacets } from "@/lib/services/projects";

const ALL_STATUSES: ProjectStatus[] = [
  ...PIPELINE_STATUSES,
  "REVISION_NEEDED",
  "SUPERVISOR_CORRECTIONS",
  "COMPLETED",
  "ON_HOLD",
  "CANCELLED",
  "REFUNDED",
  "DISPUTED",
];

const FILTER_KEYS = [
  "status",
  "stage",
  "service",
  "university",
  "worker",
  "dept",
  "payment",
  "deadline",
  "from",
  "to",
  "q",
  "flag",
] as const;

const STAGE_LABELS: Record<string, string> = {
  new: "New requirements",
  confirmed: "Confirmed",
  assigned: "Assigned",
  in_progress: "In progress",
  qa: "QA review",
  approved: "Approved",
  delivered: "Delivered",
  corrections: "Corrections",
};

const FLAG_LABELS: Record<string, string> = {
  "at-risk": "Near deadline",
  overdue: "Overdue",
  "revision-escalated": "Past the revision cap",
  flagged: "Flagged at risk",
};

/** Search and filters, set directly on the page — the fields carry the affordance. */
export function ProjectsFilterBar({ facets }: { facets: FilterFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");

  // Keep the local search box in step if the URL changes from elsewhere
  // (back button, cleared filters).
  React.useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  const commit = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      // Any filter change resets paging.
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Debounce the free-text search.
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search === current) return;
    const t = setTimeout(() => commit({ q: search.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [search, searchParams, commit]);

  const activeCount = FILTER_KEYS.filter((k) => searchParams.get(k)).length;

  return (
    <div className="space-y-4">
      <label className="relative block">
        <LuSearch
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project ID, client name, or topic"
          className="pl-10"
          aria-label="Search projects"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <FilterSelect label="Status" value={searchParams.get("status") ?? ""} onChange={(v) => commit({ status: v || null })}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label="Service" value={searchParams.get("service") ?? ""} onChange={(v) => commit({ service: v || null })}>
          <option value="">All services</option>
          {facets.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="University"
          value={searchParams.get("university") ?? ""}
          onChange={(v) => commit({ university: v || null })}
        >
          <option value="">All universities</option>
          {facets.universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.abbreviation}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label="Worker" value={searchParams.get("worker") ?? ""} onChange={(v) => commit({ worker: v || null })}>
          <option value="">All workers</option>
          <option value="unassigned">Unassigned</option>
          {facets.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label="Payment" value={searchParams.get("payment") ?? ""} onChange={(v) => commit({ payment: v || null })}>
          <option value="">Any payment</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid in full</option>
        </FilterSelect>

        <FilterSelect label="Deadline" value={searchParams.get("deadline") ?? ""} onChange={(v) => commit({ deadline: v || null })}>
          <option value="">Any deadline</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due this week</option>
          <option value="at-risk">At risk (3 days or flagged)</option>
        </FilterSelect>

        <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-3 lg:col-span-1">
          <FilterDate label="From" value={searchParams.get("from") ?? ""} onChange={(v) => commit({ from: v || null })} />
          <FilterDate label="To" value={searchParams.get("to") ?? ""} onChange={(v) => commit({ to: v || null })} />
        </div>
      </div>

      {searchParams.get("stage") || searchParams.get("flag") || searchParams.get("dept") ? (
        <div className="flex flex-wrap gap-2">
          {searchParams.get("stage") ? (
            <Chip label={`Stage: ${STAGE_LABELS[searchParams.get("stage") as string] ?? searchParams.get("stage")}`} onClear={() => commit({ stage: null })} />
          ) : null}
          {searchParams.get("flag") ? (
            <Chip label={FLAG_LABELS[searchParams.get("flag") as string] ?? (searchParams.get("flag") as string)} onClear={() => commit({ flag: null })} />
          ) : null}
          {searchParams.get("dept") ? <Chip label={`Department: ${searchParams.get("dept")}`} onClear={() => commit({ dept: null })} /> : null}
        </div>
      ) : null}

      {activeCount > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted-foreground">
            {activeCount} filter{activeCount === 1 ? "" : "s"} active
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              router.replace(pathname, { scroll: false });
            }}
          >
            <LuX className="size-4" aria-hidden />
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-[13px] font-medium text-primary">
      {label}
      <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className="rounded-full p-1 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <LuX className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="meta-label mb-1.5 block">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 text-sm" aria-label={label}>
        {children}
      </Select>
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="meta-label mb-1.5 block">{label}</span>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 text-sm"
        aria-label={`${label} date`}
      />
    </label>
  );
}
