"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { CcTabBar } from "@/components/command-center/CcTabBar";
import { hrefForTab, parseCcTab, type CcTabKey } from "@/components/command-center/tabs";
import { FinanceTab, FinanceTabSkeleton } from "@/components/command-center/finance/FinanceTab";
import { GrowthTab, GrowthTabSkeleton } from "@/components/command-center/growth/GrowthTab";
import { HealthTab, HealthTabSkeleton } from "@/components/command-center/health/HealthTab";
import { TodayTab, TodayTabSkeleton } from "@/components/command-center/today/TodayTab";
import { Button } from "@/components/ui/button";
import type { CcTabPayloads } from "@/lib/command-center/types";
import { IconError, IconRefresh } from "@/lib/icons";
import { cn, timeAgo } from "@/lib/utils";

/**
 * The founder's Command Center shell (Phase 5).
 *
 * Four tabs, each backed by its own aggregation under
 * /api/admin/command-center/*. State is kept per tab for the session: a tab
 * fetches the first time it is opened (skeleton), then keeps its data while
 * the founder moves around. Today is the live view, so it re-fetches on every
 * activation but keeps the previous render on screen while it does (no
 * skeleton flash). Refresh re-fetches the open tab; on the server-cached tabs
 * it adds `?fresh=1` so the button is honest. Only the ACTIVE tab's panel is
 * mounted — charts inside hidden panels break ResponsiveContainer.
 *
 * The URL is the single source of truth for the open tab (`/admin?tab=x`,
 * `/admin` for Today): the shell reads `useSearchParams`, and switching tabs
 * only calls `history.replaceState`, which Next 14.1+ syncs into the router.
 * So Back after a drill-down, the sidebar's "Command Center" link and the
 * bottom-nav "Home" always show the tab the address bar names.
 *
 * Figures carry their own age: the footer shows when the server computed
 * them (`generatedAt`), not when the browser fetched them — a cached tab can
 * be minutes old. A page left open catches up by itself: coming back to it
 * (tab focus, app resumed) re-fetches Today when it is over a minute old and
 * a cached tab past its cache time, and Today refreshes every five minutes
 * while it is on screen.
 */

type TabState<K extends CcTabKey = CcTabKey> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string; status: number | null }
  | {
      phase: "ready";
      data: CcTabPayloads[K];
      fetchedAt: number;
      refreshing: boolean;
      /** A refresh that failed after data was already on screen — kept, not blanked. */
      refreshError: string | null;
    };

type TabStates = { [K in CcTabKey]: TabState<K> };

const ENDPOINT: Record<CcTabKey, string> = {
  today: "/api/admin/command-center/today",
  health: "/api/admin/command-center/health",
  growth: "/api/admin/command-center/growth",
  finance: "/api/admin/command-center/finance",
};

/** Tabs whose route caches server-side; Refresh asks these for `?fresh=1`. */
const CACHED_TABS: ReadonlySet<CcTabKey> = new Set<CcTabKey>(["health", "growth", "finance"]);

/**
 * How old a tab's figures may be when the founder comes back to the page
 * before they are fetched again: Today is the live view; the cached tabs
 * follow their server cache times (cache.ts).
 */
const MAX_AGE_ON_RETURN_MS: Record<CcTabKey, number> = {
  today: 60_000,
  health: 5 * 60_000,
  growth: 10 * 60_000,
  finance: 5 * 60_000,
};

/** While the page is on screen, Today refreshes itself this often. */
const TODAY_POLL_MS = 5 * 60_000;

const INITIAL_STATES: TabStates = {
  today: { phase: "idle" },
  health: { phase: "idle" },
  growth: { phase: "idle" },
  finance: { phase: "idle" },
};

const CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 30 } },
};

class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchTab<K extends CcTabKey>(
  key: K,
  fresh: boolean,
  signal: AbortSignal
): Promise<CcTabPayloads[K]> {
  const url = fresh && CACHED_TABS.has(key) ? `${ENDPOINT[key]}?fresh=1` : ENDPOINT[key];
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) {
    // The routes answer JSON `{ error }` for 401/403/500; read it when they do.
    let message = `Could not load this tab (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) message = body.error;
    } catch {
      /* not JSON — keep the status message */
    }
    throw new FetchError(message, res.status);
  }
  return (await res.json()) as CcTabPayloads[K];
}

/** The server-side age of a ready tab's figures, in ms (falls back to the fetch time). */
function ageOf(state: TabState, now: number): number {
  if (state.phase !== "ready") return Infinity;
  const at = Date.parse(state.data.generatedAt);
  return now - (Number.isFinite(at) ? at : state.fetchedAt);
}

export function CommandCenter() {
  const reduced = useReducedMotion();
  const searchParams = useSearchParams();
  const active = parseCcTab(searchParams.get("tab") ?? undefined);
  const [states, setStates] = React.useState<TabStates>(INITIAL_STATES);

  // Read the latest states and tab inside effects without making them dependencies.
  const statesRef = React.useRef(states);
  statesRef.current = states;
  const activeRef = React.useRef(active);
  activeRef.current = active;

  // One request in flight per tab: a newer request wins, the older is aborted.
  const seq = React.useRef<Record<CcTabKey, number>>({ today: 0, health: 0, growth: 0, finance: 0 });
  const controllers = React.useRef<Partial<Record<CcTabKey, AbortController>>>({});

  const setTab = React.useCallback(
    <K extends CcTabKey>(key: K, next: (current: TabState<K>) => TabState<K>) => {
      setStates((prev) => {
        // TS cannot index the mapped type by a generic key on the write side;
        // widen for the assignment and narrow back — the shape is unchanged.
        const updated: Record<CcTabKey, TabState> = { ...prev };
        updated[key] = next(prev[key]);
        return updated as TabStates;
      });
    },
    []
  );

  const load = React.useCallback(
    <K extends CcTabKey>(key: K, fresh: boolean) => {
      const mine = ++seq.current[key];
      controllers.current[key]?.abort();
      const controller = new AbortController();
      controllers.current[key] = controller;

      setTab(key, (current) =>
        current.phase === "ready"
          ? { ...current, refreshing: true, refreshError: null }
          : { phase: "loading" }
      );

      fetchTab(key, fresh, controller.signal)
        .then((data) => {
          if (mine !== seq.current[key]) return;
          setTab(key, () => ({
            phase: "ready",
            data,
            fetchedAt: Date.now(),
            refreshing: false,
            refreshError: null,
          }));
        })
        .catch((error: unknown) => {
          if (mine !== seq.current[key] || isAbort(error)) return;
          const message = error instanceof Error ? error.message : "Something went wrong. Try again.";
          const status = error instanceof FetchError ? error.status : null;
          setTab(key, (current) =>
            // A failed refresh keeps what is on screen and says so in the footer.
            current.phase === "ready"
              ? { ...current, refreshing: false, refreshError: message }
              : { phase: "error", message, status }
          );
        });
    },
    [setTab]
  );

  // On activation: fetch a tab the first time; Today re-fetches every time
  // (keeping its previous render). An error state waits for "Try again".
  React.useEffect(() => {
    const state = statesRef.current[active];
    if (state.phase === "idle") {
      load(active, false);
    } else if (active === "today" && state.phase === "ready" && !state.refreshing) {
      load("today", false);
    }
  }, [active, load]);

  // Abort anything still in flight when the page goes away.
  React.useEffect(() => {
    const pending = controllers.current;
    return () => {
      for (const controller of Object.values(pending)) controller?.abort();
    };
  }, []);

  // Switching tabs only rewrites the URL; `useSearchParams` (above) turns that into the open tab.
  const select = React.useCallback((key: CcTabKey) => {
    window.history.replaceState(null, "", hrefForTab(key));
  }, []);

  // Coming back to a page left open: fetch the open tab again if its figures are too old.
  React.useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      const key = activeRef.current;
      const state = statesRef.current[key];
      if (state.phase === "ready" && !state.refreshing && ageOf(state, Date.now()) > MAX_AGE_ON_RETURN_MS[key]) {
        load(key, false);
      }
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [load]);

  // Keeps "Updated 2m ago" honest, and refreshes Today every five minutes while it is on screen.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const id = window.setInterval(() => {
      tick();
      if (document.visibilityState !== "visible" || activeRef.current !== "today") return;
      const state = statesRef.current.today;
      if (state.phase === "ready" && !state.refreshing && ageOf(state, Date.now()) > TODAY_POLL_MS) {
        load("today", false);
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const retry = React.useCallback(() => load(active, true), [active, load]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <CcTabBar active={active} onChange={select} />

      <div
        role="tabpanel"
        id={`cc-panel-${active}`}
        aria-labelledby={`cc-tab-${active}`}
        className="min-w-0"
      >
        {active === "today" ? (
          <Panel
            tab="today"
            state={states.today}
            reduced={reduced}
            onRetry={retry}
            skeleton={<TodayTabSkeleton />}
            render={(data) => <TodayTab data={data} />}
          />
        ) : active === "health" ? (
          <Panel
            tab="health"
            state={states.health}
            reduced={reduced}
            onRetry={retry}
            skeleton={<HealthTabSkeleton />}
            render={(data) => <HealthTab data={data} />}
          />
        ) : active === "growth" ? (
          <Panel
            tab="growth"
            state={states.growth}
            reduced={reduced}
            onRetry={retry}
            skeleton={<GrowthTabSkeleton />}
            render={(data) => <GrowthTab data={data} />}
          />
        ) : (
          <Panel
            tab="finance"
            state={states.finance}
            reduced={reduced}
            onRetry={retry}
            skeleton={<FinanceTabSkeleton />}
            render={(data) => <FinanceTab data={data} />}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One tab's panel: skeleton on the first load, an error zone with "Try again"
 * when nothing could be shown, otherwise the tab plus its footer. The stagger
 * replays when the tab changes (keyed by the shell), not on a refresh.
 */
function Panel<K extends CcTabKey>({
  tab,
  state,
  reduced,
  skeleton,
  render,
  onRetry,
}: {
  tab: K;
  state: TabState<K>;
  reduced: boolean | null;
  skeleton: React.ReactNode;
  render: (data: CcTabPayloads[K]) => React.ReactNode;
  onRetry: () => void;
}) {
  if (state.phase === "idle" || state.phase === "loading") {
    return <div aria-busy="true">{skeleton}</div>;
  }

  if (state.phase === "error") {
    return <ErrorZone message={state.message} status={state.status} onRetry={onRetry} />;
  }

  return (
    <motion.div
      key={tab}
      variants={CONTAINER}
      initial={reduced ? false : "hidden"}
      animate="show"
      className="space-y-8 sm:space-y-10"
    >
      <motion.div variants={ITEM} className="min-w-0">
        {render(state.data)}
      </motion.div>
      <motion.div variants={ITEM}>
        <PanelFooter
          computedAt={Number.isFinite(Date.parse(state.data.generatedAt)) ? Date.parse(state.data.generatedAt) : state.fetchedAt}
          refreshing={state.refreshing}
          refreshError={state.refreshError}
          cached={CACHED_TABS.has(tab)}
          reduced={reduced}
          onRefresh={onRetry}
        />
      </motion.div>
    </motion.div>
  );
}

function PanelFooter({
  computedAt,
  refreshing,
  refreshError,
  cached,
  reduced,
  onRefresh,
}: {
  /** When the server computed the figures on screen (ms). */
  computedAt: number;
  refreshing: boolean;
  refreshError: string | null;
  cached: boolean;
  reduced: boolean | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
      <p className="min-w-0">
        {refreshError ? (
          <span className="text-muted-foreground">Figures from {timeAgo(computedAt)}</span>
        ) : (
          <>Updated {timeAgo(computedAt)}</>
        )}
        {/* Only the transient status is announced — the ticking age above is not. */}
        <span aria-live="polite">
          {refreshError ? (
            <span className="text-danger"> · Could not refresh: {refreshError}</span>
          ) : refreshing ? (
            <span className="text-subtle"> · Refreshing…</span>
          ) : null}
        </span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={refreshing}
        className="min-h-12 sm:min-h-0"
        title={cached ? "Recompute now instead of using the cached figures" : "Fetch again"}
      >
        <IconRefresh className={cn(refreshing && !reduced && "animate-spin")} aria-hidden />
        Refresh
      </Button>
    </div>
  );
}

/** The old Command Center's error zone: a quiet band, the message, a way back. */
function ErrorZone({
  message,
  status,
  onRetry,
}: {
  message: string;
  status: number | null;
  onRetry: () => void;
}) {
  const signedOut = status === 401;
  const forbidden = status === 403;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl bg-zone px-6 py-14 text-center"
    >
      <IconError className="size-5 text-danger" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="mx-auto mt-1 max-w-[42ch] text-[13px] text-muted-foreground">
          {signedOut
            ? "Your session has ended. Sign in again to see the Command Center."
            : forbidden
              ? "The Command Center is the Super Admin's view; this login cannot open it."
              : "The figures could not be loaded. This is usually momentary."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {signedOut ? (
          <Button asChild variant="outline" size="sm" className="min-h-12 sm:min-h-0">
            <Link href="/login?callbackUrl=%2Fadmin">Sign in</Link>
          </Button>
        ) : null}
        {!forbidden ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="min-h-12 sm:min-h-0">
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
