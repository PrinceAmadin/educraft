import type { AiUsageLog } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveFxRate } from "@/lib/fx-rate";

export type UsagePeriod = "today" | "week" | "month" | "year";
export const USAGE_PERIODS: UsagePeriod[] = ["today", "week", "month", "year"];

const BALANCE_USD_KEY = "ai.creditBalanceUsd";
const LEGACY_BALANCE_NAIRA_KEY = "ai.creditBalanceNaira";
const BALANCE_SET_AT_KEY = "ai.creditBalanceSetAt";
const SLOW_CALL_MS = 5 * 60 * 1000;
const REGENERATION_THRESHOLD = 3;

export function parsePeriod(value: string | null | undefined): UsagePeriod {
  return USAGE_PERIODS.includes(value as UsagePeriod) ? (value as UsagePeriod) : "month";
}

function periodStart(period: UsagePeriod, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (period === "month") d.setDate(1);
  if (period === "year") d.setMonth(0, 1);
  return d;
}

async function logsSince(from: Date): Promise<AiUsageLog[]> {
  return db.aiUsageLog.findMany({ where: { createdAt: { gte: from } }, orderBy: { createdAt: "asc" } });
}

const sum = (rows: AiUsageLog[], pick: (r: AiUsageLog) => number) => rows.reduce((s, r) => s + pick(r), 0);
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function costByProject(rows: AiUsageLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.projectId) m.set(r.projectId, (m.get(r.projectId) ?? 0) + r.costNaira);
  return m;
}

function averageProjectCost(rows: AiUsageLog[]): number {
  const m = costByProject(rows);
  return m.size ? [...m.values()].reduce((a, b) => a + b, 0) / m.size : 0;
}

// ── Summary ──────────────────────────────────────────────────

export async function getUsageSummary(period: UsagePeriod) {
  const rows = await logsSince(periodStart(period));
  const projects = costByProject(rows);
  const totalCost = sum(rows, (r) => r.costNaira);

  const daily = new Map<string, number>();
  for (const r of rows) daily.set(dayKey(r.createdAt), (daily.get(dayKey(r.createdAt)) ?? 0) + r.costNaira);

  return {
    period,
    calls: rows.length,
    failedCalls: rows.filter((r) => r.status === "error").length,
    totalCost: round(totalCost),
    inputTokens: sum(rows, (r) => r.inputTokens),
    outputTokens: sum(rows, (r) => r.outputTokens),
    projectCount: projects.size,
    avgCostPerProject: round(projects.size ? totalCost / projects.size : 0),
    daily: [...daily.entries()].map(([date, cost]) => ({ date, cost: round(cost) })),
  };
}

// ── By sub-system ────────────────────────────────────────────

export async function getUsageBySubsystem(period: UsagePeriod) {
  const rows = await logsSince(periodStart(period));
  const groups = new Map<string, { label: string; cost: number; tokens: number; calls: number }>();
  for (const r of rows) {
    const label = r.chapterNumber ? `${r.subsystem} · Ch. ${r.chapterNumber}` : `${r.subsystem} · ${r.step}`;
    const g = groups.get(label) ?? { label, cost: 0, tokens: 0, calls: 0 };
    g.cost += r.costNaira;
    g.tokens += r.inputTokens + r.outputTokens;
    g.calls += 1;
    groups.set(label, g);
  }
  return [...groups.values()].map((g) => ({ ...g, cost: round(g.cost) })).sort((a, b) => b.cost - a.cost);
}

// ── By worker ────────────────────────────────────────────────

export type EfficiencyTone = "good" | "ok" | "watch" | "over";

export function efficiencyTone(score: number | null): EfficiencyTone {
  if (score == null) return "ok";
  if (score > 150) return "over";
  if (score > 120) return "watch";
  if (score < 100) return "good";
  return "ok";
}

export async function getUsageByWorker(period: UsagePeriod) {
  const rows = (await logsSince(periodStart(period))).filter((r) => r.workerId);
  const systemAvg = averageProjectCost(rows);

  const byWorker = new Map<string, AiUsageLog[]>();
  for (const r of rows) byWorker.set(r.workerId!, [...(byWorker.get(r.workerId!) ?? []), r]);

  const workerIds = [...byWorker.keys()];
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const [workers, projects] = await Promise.all([
    db.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, fullName: true, workerId: true } }),
    db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, projectId: true } }),
  ]);
  const workerById = new Map(workers.map((w) => [w.id, w]));
  const codeById = new Map(projects.map((p) => [p.id, p.projectId]));

  return workerIds
    .map((id) => {
      const wRows = byWorker.get(id)!;
      const perProject = costByProject(wRows);
      const total = sum(wRows, (r) => r.costNaira);
      const avg = perProject.size ? total / perProject.size : 0;
      const [topId, topCost] = [...perProject.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
      const score = systemAvg > 0 ? Math.round((avg / systemAvg) * 100) : null;
      return {
        id,
        code: workerById.get(id)?.workerId ?? "",
        name: workerById.get(id)?.fullName ?? "Unknown worker",
        projects: perProject.size,
        tokens: sum(wRows, (r) => r.inputTokens + r.outputTokens),
        cost: round(total),
        avgCostPerProject: round(avg),
        mostExpensive: topId ? { code: codeById.get(topId) ?? topId, cost: round(topCost) } : null,
        efficiencyScore: score,
        tone: efficiencyTone(score),
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

/** Drawer content: one worker's projects, their costliest sub-systems, and a weekly trend. */
export async function getWorkerUsageDetail(workerId: string, period: UsagePeriod) {
  const rows = (await logsSince(periodStart(period))).filter((r) => r.workerId === workerId);
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, projectId: true, projectTitle: true },
  });
  const meta = new Map(projects.map((p) => [p.id, p]));

  const perProject = new Map<string, { cost: number; tokens: number }>();
  const perSubsystem = new Map<string, number>();
  const perWeek = new Map<string, { cost: number; projects: Set<string> }>();

  for (const r of rows) {
    if (r.projectId) {
      const p = perProject.get(r.projectId) ?? { cost: 0, tokens: 0 };
      p.cost += r.costNaira;
      p.tokens += r.inputTokens + r.outputTokens;
      perProject.set(r.projectId, p);
    }
    perSubsystem.set(r.step, (perSubsystem.get(r.step) ?? 0) + r.costNaira);
    const wk = dayKey(periodStart("week", r.createdAt));
    const w = perWeek.get(wk) ?? { cost: 0, projects: new Set<string>() };
    w.cost += r.costNaira;
    if (r.projectId) w.projects.add(r.projectId);
    perWeek.set(wk, w);
  }

  return {
    projects: [...perProject.entries()]
      .map(([id, v]) => ({
        code: meta.get(id)?.projectId ?? id,
        title: meta.get(id)?.projectTitle ?? null,
        cost: round(v.cost),
        tokens: v.tokens,
      }))
      .sort((a, b) => b.cost - a.cost),
    subsystems: [...perSubsystem.entries()].map(([step, cost]) => ({ step, cost: round(cost) })).sort((a, b) => b.cost - a.cost),
    trend: [...perWeek.entries()].map(([week, v]) => ({
      week,
      avgCostPerProject: round(v.projects.size ? v.cost / v.projects.size : 0),
    })),
  };
}

// ── Project drill-down ───────────────────────────────────────

export async function getProjectUsage(query: string) {
  const q = query.trim();
  if (!q) return { matches: [], project: null };

  const matches = await db.project.findMany({
    where: {
      OR: [
        { projectId: { contains: q, mode: "insensitive" } },
        { client: { fullName: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: { id: true, projectId: true, projectTitle: true, client: { select: { fullName: true } } },
    take: 8,
  });
  if (matches.length === 0) return { matches: [], project: null };

  const target = matches.find((m) => m.projectId.toLowerCase() === q.toLowerCase()) ?? matches[0];
  const rows = await db.aiUsageLog.findMany({ where: { projectId: target.id }, orderBy: { createdAt: "asc" } });

  const steps = new Map<string, { label: string; cost: number; tokens: number; calls: number; durationMs: number }>();
  for (const r of rows) {
    const label = r.chapterNumber ? `Ch. ${r.chapterNumber} · ${r.step}` : r.step;
    const s = steps.get(label) ?? { label, cost: 0, tokens: 0, calls: 0, durationMs: 0 };
    s.cost += r.costNaira;
    s.tokens += r.inputTokens + r.outputTokens;
    s.calls += 1;
    s.durationMs += r.durationMs;
    steps.set(label, s);
  }
  const stepList = [...steps.values()].map((s) => ({ ...s, cost: round(s.cost) }));
  const avgStep = stepList.length ? stepList.reduce((a, s) => a + s.cost, 0) / stepList.length : 0;

  return {
    matches: matches.map((m) => ({ code: m.projectId, title: m.projectTitle, client: m.client.fullName })),
    project: {
      code: target.projectId,
      title: target.projectTitle,
      client: target.client.fullName,
      totalCost: round(sum(rows, (r) => r.costNaira)),
      totalTokens: sum(rows, (r) => r.inputTokens + r.outputTokens),
      steps: stepList.map((s) => ({ ...s, flagged: stepList.length > 1 && s.cost > avgStep * 2 })),
      timeline: rows.map((r) => ({
        at: r.createdAt.toISOString(),
        step: r.chapterNumber ? `Ch. ${r.chapterNumber} · ${r.step}` : r.step,
        durationMs: r.durationMs,
        cost: round(r.costNaira),
        status: r.status,
      })),
    },
  };
}

// ── Anomalies ────────────────────────────────────────────────

export interface UsageAnomaly {
  kind: "expensive_project" | "regeneration" | "slow_call" | "failed_calls";
  title: string;
  detail: string;
  cost: number;
}

export async function getUsageAnomalies(period: UsagePeriod = "month"): Promise<UsageAnomaly[]> {
  const rows = await logsSince(periodStart(period));
  const out: UsageAnomaly[] = [];

  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const projects = await db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, projectId: true } });
  const code = new Map(projects.map((p) => [p.id, p.projectId]));

  // Compared with the average across all projects in the period (not per department — too little data yet).
  const perProject = costByProject(rows);
  const avg = averageProjectCost(rows);
  if (perProject.size >= 3) {
    for (const [id, cost] of perProject) {
      if (cost > avg * 2) {
        out.push({
          kind: "expensive_project",
          title: `${code.get(id) ?? id} cost ${(cost / avg).toFixed(1)}× the average`,
          detail: `Average project this period: ₦${round(avg)}`,
          cost: round(cost),
        });
      }
    }
  }

  // Chapter re-generation only — repeated research-pipeline batches are normal.
  const attempts = new Map<string, AiUsageLog[]>();
  for (const r of rows) {
    if (r.subsystem !== "chapter_generation" || !r.projectId) continue;
    const k = `${r.projectId}|${r.chapterNumber}`;
    attempts.set(k, [...(attempts.get(k) ?? []), r]);
  }
  for (const [k, list] of attempts) {
    if (list.length < REGENERATION_THRESHOLD) continue;
    const [pid, ch] = k.split("|");
    out.push({
      kind: "regeneration",
      title: `${code.get(pid) ?? pid} · Ch. ${ch} generated ${list.length} times`,
      detail: "Repeated re-generation, likely quality-gate failures resubmitted without review",
      cost: round(sum(list, (r) => r.costNaira)),
    });
  }

  for (const r of rows) {
    if (r.durationMs > SLOW_CALL_MS) {
      out.push({
        kind: "slow_call",
        title: `${r.projectId ? code.get(r.projectId) ?? r.projectId : "Unassigned"} · ${r.step} took ${Math.round(r.durationMs / 60000)} min`,
        detail: "Over 5 minutes — possible loop or context overload",
        cost: round(r.costNaira),
      });
    }
  }

  const failed = rows.filter((r) => r.status === "error");
  if (failed.length > 0) {
    out.push({
      kind: "failed_calls",
      title: `${failed.length} failed Claude call${failed.length === 1 ? "" : "s"}`,
      detail: "Errored calls still count towards rate limits; check for a bad key or overload",
      cost: round(sum(failed, (r) => r.costNaira)),
    });
  }

  return out.sort((a, b) => b.cost - a.cost);
}

// ── Credit balance ───────────────────────────────────────────
// Anthropic exposes no API for prepaid credit balance, so the owner enters the
// balance shown in the Console when they top up; "remaining" is that figure
// minus everything logged since. Only calls made through EduCraft are counted.

/**
 * The balance the founder types is USD (matching the Anthropic Console), so USD
 * is the stored source of truth; naira is derived at read time from
 * `usdToNairaRate()` so a rate change on Vercel shows on the next page load
 * with no re-save. If only the legacy `ai.creditBalanceNaira` row is present
 * (from before this change), it is read as naira and converted to USD on the
 * fly at the current rate — the next `setCreditBalance` deletes it.
 */
export async function getCreditBalance() {
  const [rows, fx] = await Promise.all([
    db.setting.findMany({
      where: { key: { in: [BALANCE_USD_KEY, LEGACY_BALANCE_NAIRA_KEY, BALANCE_SET_AT_KEY] } },
    }),
    resolveFxRate(),
  ]);
  const val = (k: string) => rows.find((r) => r.key === k)?.value;
  const setAt = val(BALANCE_SET_AT_KEY);
  const usdRate = fx.effectiveRate;

  const usdRow = Number(val(BALANCE_USD_KEY));
  const nairaRow = Number(val(LEGACY_BALANCE_NAIRA_KEY));
  let loadedUsd: number | null = null;
  if (Number.isFinite(usdRow) && val(BALANCE_USD_KEY) !== undefined) loadedUsd = usdRow;
  else if (Number.isFinite(nairaRow) && val(LEGACY_BALANCE_NAIRA_KEY) !== undefined)
    loadedUsd = usdRate > 0 ? nairaRow / usdRate : 0;

  if (loadedUsd === null || !setAt) return { configured: false as const };

  const since = await db.aiUsageLog.aggregate({
    where: { createdAt: { gte: new Date(setAt) } },
    _sum: { costUsd: true, costNaira: true },
  });
  const spentUsd = since._sum.costUsd ?? 0;
  const spentNaira = since._sum.costNaira ?? 0;
  const remainingUsd = Math.max(0, loadedUsd - spentUsd);
  const remainingNaira = remainingUsd * usdRate;
  const percentRemaining = loadedUsd > 0 ? Math.round((remainingUsd / loadedUsd) * 100) : 0;
  return {
    configured: true as const,
    loadedUsd: round(loadedUsd, 4),
    spentUsd: round(spentUsd, 4),
    remainingUsd: round(remainingUsd, 4),
    loadedNaira: round(loadedUsd * usdRate),
    spentNaira: round(spentNaira),
    remainingNaira: round(remainingNaira),
    usdRate,
    rateSource: fx.source,
    rateOverridden: fx.overridden,
    rateFetchedAt: fx.fetchedAt,
    rateAutoSource: fx.autoSource,
    setAt,
    percentRemaining,
    level: percentRemaining < 10 ? ("critical" as const) : percentRemaining < 20 ? ("low" as const) : ("ok" as const),
  };
}

export async function setCreditBalance(balanceUsd: number) {
  const nowIso = new Date().toISOString();
  await db.$transaction([
    db.setting.upsert({
      where: { key: BALANCE_USD_KEY },
      update: { value: String(balanceUsd) },
      create: { key: BALANCE_USD_KEY, value: String(balanceUsd) },
    }),
    db.setting.upsert({
      where: { key: BALANCE_SET_AT_KEY },
      update: { value: nowIso },
      create: { key: BALANCE_SET_AT_KEY, value: nowIso },
    }),
    db.setting.deleteMany({ where: { key: LEGACY_BALANCE_NAIRA_KEY } }),
  ]);
}

// ── Phase D10: token-usage dashboard panels ──────────────────
// The founder asked for four new views once real reports start running:
// a per-project cost table (a list, not a search box), a per-subsystem
// summary grouped by the six known subsystems (research_pipeline,
// source_stage, chapter_generation, quality_gate, data_pause,
// secondary_data — plus preliminary_pages from D10 itself), a monthly
// summary card (total, daily burn, projected month-end, days remaining)
// and a threshold that emails him once a month when spend crosses it.
// The threshold and its last-sent month key live on the existing Setting
// model — no separate SystemConfig.

/** The six known subsystems plus D10's preliminary_pages. Anything unknown groups under "other". */
export const KNOWN_SUBSYSTEMS = [
  "research_pipeline",
  "source_stage",
  "chapter_generation",
  "quality_gate",
  "data_pause",
  "secondary_data",
  "preliminary_pages",
] as const;
export type KnownSubsystem = (typeof KNOWN_SUBSYSTEMS)[number] | "other";

function classifySubsystem(raw: string): KnownSubsystem {
  return (KNOWN_SUBSYSTEMS as readonly string[]).includes(raw) ? (raw as KnownSubsystem) : "other";
}

/** The 1st of the calling month in the server's time zone (Africa/Lagos on Vercel; UTC nowhere in Nigeria matters here). */
function monthStart(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
/** The 1st of the next month; used as the exclusive upper bound of the current month's window. */
function nextMonthStart(now = new Date()): Date {
  const d = monthStart(now);
  d.setMonth(d.getMonth() + 1);
  return d;
}
/** "2026-09" — one row per calendar month, matches the ai.monthlyAlertLastSentMonth key format. */
export function monthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** ₦ spent this month, ₦/day so far (against days elapsed), projected month-end (₦/day × days in month), days left, and the threshold if set. */
export interface MonthlySummary {
  monthKey: string;
  monthlyTotal: number;
  dailyBurn: number;
  projectedMonthEnd: number;
  daysElapsed: number;
  daysRemaining: number;
  daysInMonth: number;
  thresholdNaira: number | null;
}

export async function getMonthlySummary(now = new Date()): Promise<MonthlySummary> {
  const from = monthStart(now);
  const to = nextMonthStart(now);
  const daysInMonth = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const daysElapsed = Math.max(1, Math.min(daysInMonth, Math.ceil((now.getTime() - from.getTime()) / 86_400_000)));
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  const [agg, thresholdRow] = await Promise.all([
    db.aiUsageLog.aggregate({ where: { createdAt: { gte: from, lt: to } }, _sum: { costNaira: true } }),
    db.setting.findUnique({ where: { key: MONTHLY_THRESHOLD_KEY }, select: { value: true } }),
  ]);
  const monthlyTotal = round(agg._sum.costNaira ?? 0);
  const dailyBurn = round(monthlyTotal / daysElapsed);
  const projectedMonthEnd = round(dailyBurn * daysInMonth);
  const stored = Number(thresholdRow?.value);
  const thresholdNaira = Number.isFinite(stored) && stored > 0 ? Math.round(stored) : null;
  return { monthKey: monthKey(now), monthlyTotal, dailyBurn, projectedMonthEnd, daysElapsed, daysRemaining, daysInMonth, thresholdNaira };
}

/** One row per project with a Claude call in the window, sorted by ₦ descending. */
export interface PerProjectCost {
  code: string;
  title: string;
  mode: number | null;
  inputTokens: number;
  outputTokens: number;
  costNaira: number;
  completedAt: string | null;
}

export async function getPerProjectCosts(period: UsagePeriod = "month"): Promise<PerProjectCost[]> {
  const rows = await logsSince(periodStart(period));
  const byId = new Map<string, { input: number; output: number; cost: number }>();
  for (const r of rows) {
    if (!r.projectId) continue;
    const b = byId.get(r.projectId) ?? { input: 0, output: 0, cost: 0 };
    b.input += r.inputTokens;
    b.output += r.outputTokens;
    b.cost += r.costNaira;
    byId.set(r.projectId, b);
  }
  const ids = [...byId.keys()];
  if (ids.length === 0) return [];
  const [projects, modes] = await Promise.all([
    db.project.findMany({ where: { id: { in: ids } }, select: { id: true, projectId: true, projectTitle: true, deliveryDate: true } }),
    db.researchMode.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, modeNumber: true } }),
  ]);
  const modeByProject = new Map(modes.map((m) => [m.projectId, m.modeNumber]));
  const meta = new Map(projects.map((p) => [p.id, p]));
  return ids
    .map((id) => {
      const b = byId.get(id)!;
      const p = meta.get(id);
      return {
        code: p?.projectId ?? id,
        title: p?.projectTitle ?? "",
        mode: modeByProject.get(id) ?? null,
        inputTokens: b.input,
        outputTokens: b.output,
        costNaira: round(b.cost),
        completedAt: p?.deliveryDate ? p.deliveryDate.toISOString() : null,
      };
    })
    .sort((a, b) => b.costNaira - a.costNaira);
}

/** ₦ and tokens grouped by subsystem for the month. Unknown values roll into "other". */
export interface SubsystemCost {
  subsystem: KnownSubsystem;
  tokens: number;
  costNaira: number;
  calls: number;
}

export async function getSubsystemBreakdown(period: UsagePeriod = "month"): Promise<SubsystemCost[]> {
  const rows = await logsSince(periodStart(period));
  const groups = new Map<KnownSubsystem, { tokens: number; cost: number; calls: number }>();
  for (const r of rows) {
    const key = classifySubsystem(r.subsystem);
    const g = groups.get(key) ?? { tokens: 0, cost: 0, calls: 0 };
    g.tokens += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    g.cost += r.costNaira;
    g.calls += 1;
    groups.set(key, g);
  }
  // Every known subsystem is present in the response even when it has no calls this month, so the UI is stable.
  const out: SubsystemCost[] = [];
  for (const sub of KNOWN_SUBSYSTEMS) {
    const g = groups.get(sub) ?? { tokens: 0, cost: 0, calls: 0 };
    out.push({ subsystem: sub, tokens: g.tokens, costNaira: round(g.cost), calls: g.calls });
  }
  const other = groups.get("other");
  if (other && other.calls > 0) out.push({ subsystem: "other", tokens: other.tokens, costNaira: round(other.cost), calls: other.calls });
  return out.sort((a, b) => b.costNaira - a.costNaira);
}

// ── Threshold storage ────────────────────────────────────────
// Two Setting keys, so the founder can change the threshold without a redeploy and
// the alert fires at most once per calendar month per threshold.

export const MONTHLY_THRESHOLD_KEY = "ai.monthlyAlertThresholdNaira";
export const MONTHLY_THRESHOLD_LAST_SENT_KEY = "ai.monthlyAlertLastSentMonth";

/** Reads the stored threshold, or null when it has never been set. */
export async function getMonthlyThreshold(): Promise<number | null> {
  const row = await db.setting.findUnique({ where: { key: MONTHLY_THRESHOLD_KEY }, select: { value: true } });
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Sets the threshold and clears the "already sent this month" key so the new value
 * can fire once this month too. A missing or non-positive value clears the threshold.
 */
export async function setMonthlyThreshold(thresholdNaira: number | null): Promise<number | null> {
  const value = thresholdNaira && thresholdNaira > 0 ? Math.round(thresholdNaira) : null;
  await db.$transaction([
    value === null
      ? db.setting.deleteMany({ where: { key: MONTHLY_THRESHOLD_KEY } })
      : db.setting.upsert({ where: { key: MONTHLY_THRESHOLD_KEY }, update: { value: String(value) }, create: { key: MONTHLY_THRESHOLD_KEY, value: String(value) } }),
    db.setting.deleteMany({ where: { key: MONTHLY_THRESHOLD_LAST_SENT_KEY } }),
  ]);
  return value;
}
