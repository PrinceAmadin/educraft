"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LuSearch, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  REVENUE_SOURCE_LABELS,
  REVENUE_SOURCES,
  REVENUE_STATUS_LABELS,
  REVENUE_STATUSES,
  REVENUE_TYPE_LABELS,
  REVENUE_TYPES,
} from "@/lib/finance/revenue-constants";
import type { RevenueFilterOptions } from "@/lib/services/finance/revenue";

const FILTER_KEYS = ["status", "type", "source", "serviceId", "ambassadorId", "from", "to", "q"] as const;

/**
 * URL-bound filters for the Revenue Tracker: the page reads them from
 * searchParams, so a filtered view is a link that can be shared. Native
 * selects and date inputs — the OS pickers on phones.
 */
export function RevenueFilterBar({ options }: { options: RevenueFilterOptions }) {
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

  const activeCount = FILTER_KEYS.filter((k) => searchParams.get(k)).length;
  const get = (k: string) => searchParams.get(k) ?? "";

  return (
    <div className="space-y-3">
      <label className="relative block">
        <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Project ID, client, reference or receipt number"
          aria-label="Search payments"
          className="pl-9"
        />
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <Select aria-label="Status" value={get("status")} onChange={(e) => commit({ status: e.target.value || null })}>
          <option value="">All statuses</option>
          {REVENUE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REVENUE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Type" value={get("type")} onChange={(e) => commit({ type: e.target.value || null })}>
          <option value="">All types</option>
          {REVENUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {REVENUE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select aria-label="Method" value={get("source")} onChange={(e) => commit({ source: e.target.value || null })}>
          <option value="">All methods</option>
          {REVENUE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {REVENUE_SOURCE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Service" value={get("serviceId")} onChange={(e) => commit({ serviceId: e.target.value || null })}>
          <option value="">All services</option>
          {options.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Ambassador" value={get("ambassadorId")} onChange={(e) => commit({ ambassadorId: e.target.value || null })}>
          <option value="">Any ambassador</option>
          {options.ambassadors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Input type="date" aria-label="From date" value={get("from")} onChange={(e) => commit({ from: e.target.value || null })} />
        <Input type="date" aria-label="To date" value={get("to")} onChange={(e) => commit({ to: e.target.value || null })} />
      </div>

      {activeCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => commit(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
        >
          <LuX className="size-4" aria-hidden />
          Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
        </Button>
      ) : null}
    </div>
  );
}
