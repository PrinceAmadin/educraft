"use client";

import * as React from "react";
import { CC_TABS, type CcTabKey } from "@/components/command-center/tabs";
import { cn } from "@/lib/utils";

/**
 * The Command Center's four tabs (Phase 5). On phones every tab is an equal
 * column (icon over a one-word label) inside a bar that sticks under the
 * topbar, so all four fit a 375px screen with no sideways scroll; from `sm`
 * up it is the usual inline segmented control. Proper tablist semantics with
 * roving focus: arrow keys move between tabs, Home/End jump to the ends.
 * Switching is the parent's job (`onChange`) — the bar renders no panels.
 */
export function CcTabBar({
  active,
  onChange,
}: {
  active: CcTabKey;
  onChange: (key: CcTabKey) => void;
}) {
  const buttons = React.useRef<Partial<Record<CcTabKey, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = CC_TABS.findIndex((t) => t.key === active);
    if (index < 0) return;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % CC_TABS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + CC_TABS.length) % CC_TABS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = CC_TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const key = CC_TABS[next].key;
    onChange(key);
    buttons.current[key]?.focus();
  };

  return (
    <nav
      aria-label="Command Center sections"
      className="sticky top-16 z-20 -mx-4 bg-background/85 px-4 py-2 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
    >
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="grid gap-1 rounded-xl bg-zone p-1 sm:inline-flex sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${CC_TABS.length}, minmax(0, 1fr))` }}
      >
        {CC_TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                buttons.current[tab.key] = el;
              }}
              type="button"
              role="tab"
              id={`cc-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`cc-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-medium transition-colors duration-fast sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5 sm:size-4" aria-hidden />
              <span className="sm:hidden">{tab.short}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
