"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProjectTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

/**
 * All panels are rendered server-side and mounted at once; this only toggles
 * visibility and keeps `?tab=` in the URL (via replaceState, no navigation) so
 * a tab is deep-linkable and survives refresh without a round trip.
 */
export function ProjectTabs({ tabs, initial }: { tabs: ProjectTab[]; initial?: string }) {
  const valid = React.useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);
  const [active, setActive] = React.useState(
    initial && valid.has(initial) ? initial : tabs[0]?.id
  );

  const select = React.useCallback((id: string) => {
    setActive(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* non-fatal */
    }
  }, []);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Project sections"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => select(tab.id)}
              className={cn(
                "-mb-px min-h-11 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
          className="pt-5"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
