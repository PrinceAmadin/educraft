import { LuCalendarDays, LuMousePointerClick, LuShoppingBag, LuSparkles, LuUserCheck, LuHistory, LuShieldCheck } from "react-icons/lu";
import { StatsCard, STATS_GRID } from "@/components/dashboard/StatsCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ClickTrendChart } from "@/components/ambassador-analytics/ClickTrendChart";
import { DAY_NAMES, formatHour } from "@/lib/click-tracking/peak-hours";
import { cn } from "@/lib/utils";
import type {
  AnalyticsData,
  BreakdownRow,
  HistoryPeriod,
  OverviewData,
  QualityData,
} from "@/lib/services/ambassador-analytics";

const WAT_DATE = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });
const WAT_DATETIME = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const n = (v: number) => v.toLocaleString("en-NG");

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[15px] font-semibold text-foreground">{children}</h2>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────

export function OverviewPanel({ data }: { data: OverviewData }) {
  const legacyNote =
    data.legacyClicks && data.legacyClicks > 0
      ? `Includes ${n(data.legacyClicks)} from before detailed tracking`
      : data.trackingSince
        ? `Tracking since ${WAT_DATE.format(data.trackingSince)}`
        : "Counting from your first click";
  return (
    <div className="space-y-10">
      <section className={STATS_GRID} aria-label="Link totals">
        <StatsCard label="Clicks today" value={n(data.clicksToday)} detail="Since midnight, Nigerian time" icon={LuMousePointerClick} />
        <StatsCard label="Unique this week" value={n(data.uniqueThisWeek)} detail="Different people, last 7 days" icon={LuUserCheck} tone="success" />
        <StatsCard label="Total clicks" value={n(data.totalClicks)} detail={legacyNote} icon={LuSparkles} />
        <StatsCard
          label="Orders logged"
          value={n(data.orders)}
          detail={data.conversion === null ? "Jobs credited to you" : `${data.conversion}% of your unique visitors`}
          icon={LuShoppingBag}
          tone="gold"
        />
      </section>
      <section aria-labelledby="trend-h">
        <SectionTitle hint="Clicks and unique visitors per day, Nigerian time">
          <span id="trend-h">Last 7 days</span>
        </SectionTitle>
        <ClickTrendChart data={data.trend} />
        <div className="mt-3 flex gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-primary" />Clicks</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-gold" />Unique</span>
        </div>
      </section>
    </div>
  );
}

// ── Analytics ────────────────────────────────────────────────

function Heatmap({ data }: { data: AnalyticsData["peak"] }) {
  const max = Math.max(1, ...data.heatmap.map((c) => c.clicks));
  const cell = new Map(data.heatmap.map((c) => [`${c.dayIndex}-${c.hour}`, c.clicks]));
  // Monday first reads naturally for a work week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[3px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center font-mono text-[10px] text-muted-foreground">
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
          {order.map((d) => (
            <div key={d} className="contents">
              <span className="self-center text-[11px] text-muted-foreground">{DAY_NAMES[d].slice(0, 3)}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const v = cell.get(`${d}-${h}`) ?? 0;
                return (
                  <span
                    key={h}
                    title={`${DAY_NAMES[d]} ${formatHour(h)}: ${v} click${v === 1 ? "" : "s"}`}
                    className="aspect-square rounded-[3px] bg-zone"
                    style={v ? { backgroundColor: `hsl(var(--primary) / ${0.18 + 0.82 * (v / max)})` } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">Hour of day (WAT)</p>
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <section aria-label={title}>
      <h3 className="meta-label mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No data yet</p>
      ) : (
        <ul>
          {rows.slice(0, 8).map((r) => (
            <li key={`${r.label}-${r.detail}`} className="border-b border-border/40 py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-foreground">
                  {r.label}
                  {r.detail ? <span className="ml-1.5 text-xs text-muted-foreground">{r.detail}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                  {n(r.clicks)}
                  <span className="ml-2 inline-block w-9 text-right text-xs text-muted-foreground">{r.share}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zone">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${r.share}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AnalyticsPanel({ data }: { data: AnalyticsData }) {
  if (data.totalClicks === 0) {
    return (
      <EmptyState
        icon={LuCalendarDays}
        title="No clicks to analyse yet"
        description="Once people open your link, you will see when they click, where they are and what phone they use."
      />
    );
  }
  return (
    <div className="space-y-10">
      <section aria-labelledby="peak-h">
        <SectionTitle hint={`Last ${data.peak.days} days, Nigerian time (WAT)`}>
          <span id="peak-h">Peak hours</span>
        </SectionTitle>
        {data.peak.insight ? (
          <p className="mb-5 rounded-xl bg-primary/10 px-4 py-3 text-sm leading-relaxed text-foreground">{data.peak.insight}</p>
        ) : null}
        <Heatmap data={data.peak} />
        {data.peak.today.insight ? <p className="mt-3 text-xs text-muted-foreground">{data.peak.today.insight}</p> : null}
      </section>

      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        <Breakdown title="Country" rows={data.country} />
        <Breakdown title="Region" rows={data.region} />
        <Breakdown title="City" rows={data.city} />
        <Breakdown title="Device" rows={data.device} />
        <Breakdown title="Operating system" rows={data.os} />
        <Breakdown title="Browser" rows={data.browser} />
        <Breakdown title="Source" rows={data.source} />
      </div>
    </div>
  );
}

// ── Quality ──────────────────────────────────────────────────

const REASONS: Record<string, string> = {
  bot_user_agent: "Automated visitor (bot or link preview)",
  headless_browser: "Headless browser",
};

export function QualityPanel({ data }: { data: QualityData }) {
  if (data.recorded === 0) {
    return (
      <EmptyState icon={LuShieldCheck} title="Nothing recorded yet" description="Quality checks appear once your link gets its first visits." />
    );
  }
  const parts = [
    { label: "Unique", hint: "First visit from a person", value: data.unique, tone: "bg-success" },
    { label: "Return", hint: "Same person, back after 30 minutes", value: data.return, tone: "bg-primary" },
    { label: "Duplicate", hint: "Same person again within 30 minutes", value: data.duplicate, tone: "bg-gold" },
    { label: "Bot", hint: "Automated, never counted", value: data.bot, tone: "bg-danger" },
  ];
  const score = data.integrityScore ?? 0;
  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="meta-label">Data integrity score</p>
          <p className={cn("mt-1 font-mono text-5xl font-medium tabular-nums", score >= 70 ? "text-success" : score >= 40 ? "text-gold" : "text-danger")}>
            {score}%
          </p>
        </div>
        <p className="max-w-md pb-2 text-sm text-muted-foreground">
          The share of your {n(data.recorded)} recorded visits that were a new, real person. Higher is better.
        </p>
      </section>

      <section aria-label="Quality breakdown">
        <div className="flex h-3 overflow-hidden rounded-full bg-zone">
          {parts.map((p) =>
            p.value ? <div key={p.label} className={p.tone} style={{ width: `${(p.value / data.recorded) * 100}%` }} /> : null
          )}
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          {parts.map((p) => (
            <li key={p.label}>
              <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <span className={cn("size-2 rounded-full", p.tone)} />
                {p.label}
              </p>
              <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
                {n(p.value)}
                <span className="ml-2 text-sm text-muted-foreground">{Math.round((p.value / data.recorded) * 100)}%</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="fraud-h">
        <SectionTitle hint="Automated visits that were recorded but not counted">
          <span id="fraud-h">Blocked visits</span>
        </SectionTitle>
        {data.fraudEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">None. Every visit looked like a real person.</p>
        ) : (
          <ul>
            {data.fraudEvents.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/40 py-2.5 last:border-0">
                <span className="text-sm text-foreground">{REASONS[f.reason ?? ""] ?? f.reason ?? "Flagged"}</span>
                <span className="text-xs text-muted-foreground">
                  {[f.browser, f.device, f.country].filter(Boolean).join(" · ")} · {WAT_DATETIME.format(f.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────

export function HistoryPanel({ periods }: { periods: HistoryPeriod[] }) {
  if (periods.length === 0) {
    return (
      <EmptyState
        icon={LuHistory}
        title="No past periods"
        description="When EduCraft resets your count, the clicks before it are kept here as a closed period."
      />
    );
  }
  return (
    <ul>
      {periods.map((p) => (
        <li key={p.archivedAt.toISOString()} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border/40 py-3.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
          <span className="col-span-2 text-sm text-foreground sm:col-span-1">
            {WAT_DATE.format(p.start)} to {WAT_DATE.format(p.end)}
            <span className="block text-xs text-muted-foreground">Closed {WAT_DATE.format(p.archivedAt)}</span>
          </span>
          <span className="font-mono text-sm tabular-nums">{n(p.clicks)} <span className="text-xs text-muted-foreground">clicks</span></span>
          <span className="font-mono text-sm tabular-nums text-success">{n(p.unique)} <span className="text-xs text-muted-foreground">unique</span></span>
        </li>
      ))}
    </ul>
  );
}
