"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
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
  "service",
  "university",
  "worker",
  "payment",
  "from",
  "to",
  "q",
  "flag",
] as const;

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
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project ID, client name, or topic"
          className="pl-9"
          aria-label="Search projects"
        />
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <FilterSelect
          label="Status"
          value={searchParams.get("status") ?? ""}
          onChange={(v) => commit({ status: v || null })}
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Service"
          value={searchParams.get("service") ?? ""}
          onChange={(v) => commit({ service: v || null })}
        >
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

        <FilterSelect
          label="Worker"
          value={searchParams.get("worker") ?? ""}
          onChange={(v) => commit({ worker: v || null })}
        >
          <option value="">All workers</option>
          <option value="unassigned">Unassigned</option>
          {facets.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Payment"
          value={searchParams.get("payment") ?? ""}
          onChange={(v) => commit({ payment: v || null })}
        >
          <option value="">Any payment</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid in full</option>
        </FilterSelect>

        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1">
          <FilterDate
            label="From"
            value={searchParams.get("from") ?? ""}
            onChange={(v) => commit({ from: v || null })}
          />
          <FilterDate
            label="To"
            value={searchParams.get("to") ?? ""}
            onChange={(v) => commit({ to: v || null })}
          />
        </div>
      </div>

      {activeCount > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
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
            <X className="size-4" aria-hidden />
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
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
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 text-sm"
        aria-label={label}
      >
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
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
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
