"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LuX } from "react-icons/lu";
import { PanelContext, panelCall, type FlashTone, type PanelContextValue } from "@/components/ambassador-panel/context";
import { Notice } from "@/components/ambassador-panel/shared";
import { ApplicationsTab } from "@/components/ambassador-panel/tabs/ApplicationsTab";
import { CoreTab } from "@/components/ambassador-panel/tabs/CoreTab";
import { ManageTab } from "@/components/ambassador-panel/tabs/ManageTab";
import { SchoolsTab } from "@/components/ambassador-panel/tabs/SchoolsTab";
import { SlotsTab } from "@/components/ambassador-panel/tabs/SlotsTab";
import { SubTab } from "@/components/ambassador-panel/tabs/SubTab";
import { TrackingTab } from "@/components/ambassador-panel/tabs/TrackingTab";
import type { PanelOverview, Roster } from "@/lib/ambassador-panel/types";
import { cn } from "@/lib/utils";

type TabId = "slots" | "schools" | "core" | "sub" | "applications" | "tracking" | "manage";

/**
 * The original Ambassador Panel, reskinned in the HQ design system.
 *
 * Same seven tabs, same data, same rules — the panel reads and writes the
 * original Redis store through `/api/ambassador-panel/admin`. The shell holds
 * the one copy of the data; tabs read it through context and call `reload`
 * after anything that changes it.
 */
export function AmbassadorPanel({
  initial,
  canDelete,
  loadError,
}: {
  initial: PanelOverview;
  canDelete: boolean;
  loadError: string | null;
}) {
  const reduced = useReducedMotion();
  const [data, setData] = React.useState<PanelOverview>(initial);
  const [tab, setTab] = React.useState<TabId>("slots");
  const [flashState, setFlashState] = React.useState<{ tone: FlashTone; message: string; key: number } | null>(
    loadError ? { tone: "danger", message: loadError, key: 0 } : null
  );

  const flash = React.useCallback((tone: FlashTone, message: string) => {
    setFlashState({ tone, message, key: Date.now() });
  }, []);

  // Success and info messages clear themselves; errors stay until dismissed.
  React.useEffect(() => {
    if (!flashState || flashState.tone === "danger") return;
    const t = setTimeout(() => setFlashState((cur) => (cur?.key === flashState.key ? null : cur)), 7000);
    return () => clearTimeout(t);
  }, [flashState]);

  const reload = React.useCallback(async () => {
    try {
      setData(await panelCall<PanelOverview>("overview"));
    } catch (e) {
      flash("danger", e instanceof Error ? e.message : "Could not refresh the panel.");
    }
  }, [flash]);

  const applyRoster = React.useCallback((roster: Roster) => setData((d) => ({ ...d, roster })), []);

  const saveRoster = React.useCallback(
    async (next: Roster) => {
      try {
        const res = await panelCall<{ roster: Roster }>("save-roster", { roster: next });
        applyRoster(res.roster);
        flash("success", "Roster saved. Links are live.");
        return true;
      } catch (e) {
        flash("danger", e instanceof Error ? e.message : "Could not save the roster.");
        return false;
      }
    },
    [applyRoster, flash]
  );

  const value: PanelContextValue = {
    data,
    readOnly: !data.status.redis,
    canDelete,
    reload,
    saveRoster,
    applyRoster,
    flash,
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "slots", label: "Slots" },
    { id: "schools", label: "Schools" },
    { id: "core", label: "Core" },
    { id: "sub", label: "Sub" },
    { id: "applications", label: "Applications", count: data.applications.length },
    { id: "tracking", label: "Tracking", count: data.pending.length },
    { id: "manage", label: "Manage" },
  ];

  return (
    <PanelContext.Provider value={value}>
      <div className="space-y-8">
        {!data.status.redis ? (
          <Notice tone="warning">
            <strong className="font-semibold">Not connected yet.</strong> Add <code className="font-mono text-[13px]">REDIS_URL</code>{" "}
            (the same Redis the original ambassador app uses) to <code className="font-mono text-[13px]">.env.local</code> and the
            Vercel project. Until then you are seeing the roster from the original code, read-only, with no tracking data.
          </Notice>
        ) : !data.status.email ? (
          <Notice tone="info">
            Emails are off. Add <code className="font-mono text-[13px]">GMAIL_APP_PASSWORD</code> to send welcome, commission and
            broadcast emails. Everything else works.
          </Notice>
        ) : null}

        <nav aria-label="Panel sections" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" className="inline-flex gap-1 rounded-xl bg-zone p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                id={`tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {t.count ? (
                  <span className="rounded-full bg-gold/20 px-1.5 font-mono text-[11px] font-semibold text-gold">{t.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </nav>

        <AnimatePresence initial={false}>
          {flashState ? (
            <motion.div
              key={flashState.key}
              initial={reduced ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <Notice
                tone={flashState.tone === "info" ? "info" : flashState.tone}
                action={
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setFlashState(null)}
                    className="-m-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  >
                    <LuX className="size-4" aria-hidden />
                  </button>
                }
              >
                {flashState.message}
              </Notice>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "slots" && <SlotsTab />}
          {tab === "schools" && <SchoolsTab />}
          {tab === "core" && <CoreTab />}
          {tab === "sub" && <SubTab />}
          {tab === "applications" && <ApplicationsTab />}
          {tab === "tracking" && <TrackingTab />}
          {tab === "manage" && <ManageTab />}
        </div>
      </div>
    </PanelContext.Provider>
  );
}
