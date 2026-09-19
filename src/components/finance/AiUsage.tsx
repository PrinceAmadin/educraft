"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LuExternalLink, LuFlag, LuSearch, LuTriangleAlert } from "react-icons/lu";
import { CHART_TOOLTIP_STYLE } from "@/components/finance/RevenueTrendChart";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn, formatNaira } from "@/lib/utils";
import type { EfficiencyTone } from "@/lib/services/ai-usage";

const CONSOLE_URL = "https://console.anthropic.com/settings/billing";
const num = (n: number) => new Intl.NumberFormat("en-NG").format(n);
const TONE_CLASS: Record<EfficiencyTone, string> = {
  good: "text-success",
  ok: "text-foreground",
  watch: "text-gold",
  over: "text-danger",
};

// ── Balance ──────────────────────────────────────────────────

export type BalanceData =
  | { configured: false }
  | {
      configured: true;
      loaded: number;
      setAt: string;
      spent: number;
      remaining: number;
      percentRemaining: number;
      level: "ok" | "low" | "critical";
    };

export function AiBalanceCard({ balance, canEdit }: { balance: BalanceData; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(!balance.configured);
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-usage/balance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ balanceNaira: Number(value) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not save");
      setEditing(false);
      setValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const barTone = balance.configured
    ? balance.level === "critical"
      ? "bg-danger"
      : balance.level === "low"
        ? "bg-gold"
        : "bg-primary"
    : "bg-primary";

  return (
    <section aria-labelledby="balance-heading" className="space-y-4">
      {balance.configured && balance.level !== "ok" ? (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-xl px-4 py-3 text-sm",
            balance.level === "critical" ? "bg-danger/10 text-danger" : "bg-gold/10 text-gold"
          )}
        >
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {balance.level === "critical" ? "Under 10%" : "Under 20%"} of your Claude credit is left — top up on the
            Anthropic Console.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p id="balance-heading" className="meta-label">
            Claude credit remaining
          </p>
          {balance.configured ? (
            <>
              <p className="mt-2 font-mono text-[clamp(2.25rem,6vw,3.25rem)] font-medium leading-none tabular-nums text-foreground">
                {formatNaira(balance.remaining)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatNaira(balance.spent)} used since the balance was set on{" "}
                {new Date(balance.setAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })} ·{" "}
                {balance.percentRemaining}% left
              </p>
            </>
          ) : (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Anthropic has no API for prepaid credit, so enter the balance shown in the Console once — HQ subtracts
              every call it logs from there.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && !editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Update balance
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer">
              Anthropic Console <LuExternalLink className="size-3.5" aria-hidden />
            </a>
          </Button>
        </div>
      </div>

      {balance.configured ? (
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-zone"
          role="progressbar"
          aria-valuenow={balance.percentRemaining}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Credit remaining"
        >
          <div className={cn("h-full rounded-full transition-[width] duration-slow", barTone)} style={{ width: `${balance.percentRemaining}%` }} />
        </div>
      ) : null}

      {canEdit && editing ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="ai-balance">
            Balance in naira
          </label>
          <input
            id="ai-balance"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Balance in ₦ (Console USD × rate)"
            className="h-12 w-full rounded-lg border border-input-border bg-input px-3 text-sm sm:w-72"
          />
          <Button type="submit" disabled={saving || value === ""}>
            {saving ? "Saving…" : "Save balance"}
          </Button>
          {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

// ── Daily spend chart ────────────────────────────────────────

export function AiSpendChart({ data }: { data: { date: string; cost: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="mt-3 flex h-48 items-center justify-center rounded-2xl bg-zone text-sm text-muted-foreground">
        No Claude calls logged in this period
      </div>
    );
  }
  return (
    <div className="-mx-1 mt-3 overflow-x-auto px-1">
      <div className="h-56" style={{ minWidth: Math.max(320, data.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => formatNaira(v, { compact: true })} />
            <Tooltip cursor={{ fill: "hsl(var(--zone))" }} contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [formatNaira(v), "Spend"]} />
            <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Workers ──────────────────────────────────────────────────

export interface WorkerUsageRow {
  id: string;
  code: string;
  name: string;
  projects: number;
  tokens: number;
  cost: number;
  avgCostPerProject: number;
  mostExpensive: { code: string; cost: number } | null;
  efficiencyScore: number | null;
  tone: EfficiencyTone;
}

interface WorkerDetail {
  projects: { code: string; title: string | null; cost: number; tokens: number }[];
  subsystems: { step: string; cost: number }[];
  trend: { week: string; avgCostPerProject: number }[];
}

export function AiWorkersTable({ rows, period }: { rows: WorkerUsageRow[]; period: string }) {
  const [open, setOpen] = React.useState<WorkerUsageRow | null>(null);
  const [detail, setDetail] = React.useState<WorkerDetail | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function show(row: WorkerUsageRow) {
    setOpen(row);
    setDetail(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-usage/by-worker/${row.id}?period=${period}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded-2xl bg-zone px-4 py-8 text-center text-sm text-muted-foreground">
        No worker-attributed Claude usage in this period yet.
      </p>
    );
  }

  return (
    <>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Worker</th>
              <th className="px-3 py-2 text-right font-medium">Projects</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Avg / project</th>
              <th className="px-3 py-2 font-medium">Costliest</th>
              <th className="py-2 pl-3 text-right font-medium">Efficiency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer transition-colors hover:bg-zone" onClick={() => show(r)}>
                <td className="py-3 pr-3">
                  <button className="text-left font-medium text-foreground focus-visible:underline focus-visible:outline-none" onClick={() => show(r)}>
                    {r.name}
                  </button>
                </td>
                <td className="px-3 text-right font-mono tabular-nums">{r.projects}</td>
                <td className="px-3 text-right font-mono tabular-nums">{num(r.tokens)}</td>
                <td className="px-3 text-right font-mono tabular-nums">{formatNaira(r.cost)}</td>
                <td className="px-3 text-right font-mono tabular-nums">{formatNaira(r.avgCostPerProject)}</td>
                <td className="px-3 font-mono text-xs text-muted-foreground">
                  {r.mostExpensive ? `${r.mostExpensive.code} · ${formatNaira(r.mostExpensive.cost)}` : "—"}
                </td>
                <td className={cn("py-3 pl-3 text-right font-mono font-medium tabular-nums", TONE_CLASS[r.tone])}>
                  {r.tone === "over" ? <LuFlag className="mr-1 inline size-3.5" aria-label="Over-using tokens" /> : null}
                  {r.efficiencyScore ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Efficiency = worker&apos;s average cost per project ÷ system average × 100. Under 100 is cheaper than average;
        over 120 investigate; over 150 flagged.
      </p>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetTitle>{open?.name}</SheetTitle>
          <SheetDescription>Claude usage this {period === "today" ? "day" : period}</SheetDescription>
          {loading || !detail ? (
            <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="mt-6 space-y-6">
              <DetailList title="Projects" rows={detail.projects.map((p) => ({ label: p.code, sub: p.title, value: formatNaira(p.cost) }))} />
              <DetailList title="Costliest steps" rows={detail.subsystems.map((s) => ({ label: s.step, value: formatNaira(s.cost) }))} />
              <DetailList
                title="Weekly avg cost per project"
                rows={detail.trend.map((t) => ({ label: `Week of ${t.week}`, value: formatNaira(t.avgCostPerProject) }))}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailList({ title, rows }: { title: string; rows: { label: string; sub?: string | null; value: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-2 divide-y divide-border/70">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-mono text-xs">{r.label}</span>
              {r.sub ? <span className="block truncate text-xs text-muted-foreground">{r.sub}</span> : null}
            </span>
            <span className="shrink-0 font-mono tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Project drill-down ───────────────────────────────────────

interface ProjectResult {
  matches: { code: string; title: string | null; client: string }[];
  project: null | {
    code: string;
    title: string | null;
    client: string;
    totalCost: number;
    totalTokens: number;
    steps: { label: string; cost: number; tokens: number; calls: number; durationMs: number; flagged: boolean }[];
    timeline: { at: string; step: string; durationMs: number; cost: number; status: string }[];
  };
}

export function AiProjectSearch() {
  const [q, setQ] = React.useState("");
  const [result, setResult] = React.useState<ProjectResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function search(term: string) {
    if (!term.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-usage/by-project?q=${encodeURIComponent(term)}`);
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const project = result?.project;
  const maxCost = Math.max(1, ...(project?.steps.map((s) => s.cost) ?? [1]));

  return (
    <div className="mt-3 space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
        className="relative max-w-md"
      >
        <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Project ID (EC-…) or client name"
          aria-label="Search projects"
          className="h-12 w-full rounded-lg border border-input-border bg-input pl-9 pr-3 text-sm"
        />
      </form>

      {loading ? <p className="text-sm text-muted-foreground">Searching…</p> : null}
      {result && !project && !loading ? <p className="text-sm text-muted-foreground">No project matches that search.</p> : null}

      {result && result.matches.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {result.matches.map((m) => (
            <Button key={m.code} variant="outline" size="sm" onClick={() => search(m.code)}>
              {m.code} · {m.client}
            </Button>
          ))}
        </div>
      ) : null}

      {project ? (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{project.code}</span> · {project.client}
              {project.title ? ` · ${project.title}` : ""}
            </p>
            <p className="mt-1 font-mono text-2xl font-medium tabular-nums">
              {formatNaira(project.totalCost)}{" "}
              <span className="text-sm text-muted-foreground">· {num(project.totalTokens)} tokens</span>
            </p>
          </div>
          {project.steps.length === 0 ? (
            <p className="rounded-2xl bg-zone px-4 py-6 text-center text-sm text-muted-foreground">
              No Claude calls have been logged for this project.
            </p>
          ) : (
            <ul className="space-y-3">
              {project.steps.map((s) => (
                <li key={s.label}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {s.flagged ? <LuFlag className="mr-1 inline size-3.5 text-danger" aria-label="More than 2× the average step" /> : null}
                      {s.label}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {formatNaira(s.cost)} <span className="text-xs text-muted-foreground">· {s.calls}×</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zone">
                    <div className={cn("h-full rounded-full", s.flagged ? "bg-danger" : "bg-primary")} style={{ width: `${(s.cost / maxCost) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {project.timeline.length > 0 ? (
            <DetailList
              title="Timeline"
              rows={project.timeline.map((t, i) => ({
                label: `${i + 1}. ${t.step}`,
                sub: `${new Date(t.at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${(t.durationMs / 1000).toFixed(1)}s${t.status === "error" ? " · failed" : ""}`,
                value: formatNaira(t.cost),
              }))}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
