"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WORKER_STATUSES } from "@/lib/worker-metrics";

export function WorkersFilterBar({ specialties }: { specialties: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");

  React.useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  const commit = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search === current) return;
    const t = setTimeout(() => commit({ q: search.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [search, searchParams, commit]);

  const activeCount = ["status", "specialty", "availability", "q"].filter((k) =>
    searchParams.get(k)
  ).length;

  return (
    <div className="space-y-4">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or worker ID"
          className="pl-9"
          aria-label="Search workers"
        />
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <FilterSelect
          label="Status"
          value={searchParams.get("status") ?? ""}
          onChange={(v) => commit({ status: v || null })}
        >
          <option value="">All statuses</option>
          {WORKER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Specialty"
          value={searchParams.get("specialty") ?? ""}
          onChange={(v) => commit({ specialty: v || null })}
        >
          <option value="">Any specialty</option>
          {specialties.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Availability"
          value={searchParams.get("availability") ?? ""}
          onChange={(v) => commit({ availability: v || null })}
        >
          <option value="">Any availability</option>
          <option value="available">Available</option>
          <option value="at-capacity">At capacity</option>
        </FilterSelect>
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
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block meta-label">
        {label}
      </span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 text-sm" aria-label={label}>
        {children}
      </Select>
    </label>
  );
}
