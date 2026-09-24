"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuSearch, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TIER_LADDER } from "@/lib/ambassador";
import { ACTIVITY_LABELS } from "@/lib/ambassadors/tier-utils";

const FILTER_KEYS = ["tier", "school", "status", "role", "joinedFrom", "joinedTo", "q", "includeClosed"] as const;

/**
 * The directory's filters live in the URL, so a filtered view can be shared
 * and the back button works. Tier, school, activity, Core/Sub, join dates
 * and a search box; sort is on the table headers.
 */
export function DirectoryFilters({ schools }: { schools: { id: string; abbreviation: string; name: string }[] }) {
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
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search === current) return;
    const t = setTimeout(() => commit({ q: search.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [search, searchParams, commit]);

  const activeCount = FILTER_KEYS.filter((k) => searchParams.get(k)).length;

  return (
    <div className="space-y-3">
      <label className="relative block">
        <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, ID or referral code"
          className="pl-9"
          aria-label="Search ambassadors"
        />
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <FilterSelect label="Tier" value={searchParams.get("tier") ?? ""} onChange={(v) => commit({ tier: v || null })}>
          <option value="">All tiers</option>
          {TIER_LADDER.map((t) => (
            <option key={t.tier} value={t.tier}>
              {t.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="School" value={searchParams.get("school") ?? ""} onChange={(v) => commit({ school: v || null })}>
          <option value="">All schools</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.abbreviation}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" value={searchParams.get("status") ?? ""} onChange={(v) => commit({ status: v || null })}>
          <option value="">All statuses</option>
          {(Object.keys(ACTIVITY_LABELS) as (keyof typeof ACTIVITY_LABELS)[]).map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_LABELS[k]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Core / Sub" value={searchParams.get("role") ?? ""} onChange={(v) => commit({ role: v || null })}>
          <option value="">Show both</option>
          <option value="core">Only Core</option>
          <option value="sub">Only Sub</option>
          <option value="solo">No team</option>
        </FilterSelect>
        <label className="block">
          <span className="mb-1 block meta-label">Joined from</span>
          <Input type="date" value={searchParams.get("joinedFrom") ?? ""} onChange={(e) => commit({ joinedFrom: e.target.value || null })} className="h-11 text-sm" aria-label="Joined from" />
        </label>
        <label className="block">
          <span className="mb-1 block meta-label">Joined to</span>
          <Input type="date" value={searchParams.get("joinedTo") ?? ""} onChange={(e) => commit({ joinedTo: e.target.value || null })} className="h-11 text-sm" aria-label="Joined to" />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={searchParams.get("includeClosed") === "1"}
            onChange={(e) => commit({ includeClosed: e.target.checked ? "1" : null })}
          />
          Include suspended and terminated
        </label>
        {activeCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              router.replace(pathname, { scroll: false });
            }}
          >
            <LuX className="size-4" aria-hidden />
            Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block meta-label">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 text-sm" aria-label={label}>
        {children}
      </Select>
    </label>
  );
}
