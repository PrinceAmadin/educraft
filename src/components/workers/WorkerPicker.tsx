"use client";

import * as React from "react";
import { LuCheck, LuSearch } from "react-icons/lu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WorkerRecommendation } from "@/lib/services/workers";

/** Search-and-scroll worker list — the picker half of any inline "assign/reassign" surface. */
export function WorkerPicker({
  workers,
  selectedId,
  onPick,
}: {
  workers: WorkerRecommendation[];
  selectedId: string | null;
  onPick: (worker: WorkerRecommendation) => void;
}) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? workers.filter((w) =>
        [w.fullName, w.workerId, ...w.specialties].some((v) => v.toLowerCase().includes(needle))
      )
    : workers;

  return (
    <div className="space-y-2">
      <label className="relative block">
        <LuSearch
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workers by name, ID, or specialty"
          className="pl-10"
          aria-label="Search workers"
        />
      </label>

      <div
        role="listbox"
        aria-label="Workers"
        className="max-h-56 overflow-y-auto overflow-x-hidden rounded-xl bg-zone p-1"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No worker matches.</p>
        ) : (
          filtered.map((w) => (
            <button
              key={w.id}
              type="button"
              role="option"
              aria-selected={w.id === selectedId}
              onClick={() => onPick(w)}
              className={cn(
                "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                w.id === selectedId ? "bg-card shadow-soft" : "hover:bg-card/60"
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{w.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  <span className="font-mono">{w.workerId}</span>
                  {w.specialties.length > 0 ? ` · ${w.specialties.join(", ")}` : ""} · load {w.load}
                  {w.atCapacity ? " (at capacity)" : ""}
                </span>
              </span>
              {w.id === selectedId ? <LuCheck className="size-4 shrink-0 text-primary" aria-hidden /> : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
