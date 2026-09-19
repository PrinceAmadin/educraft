import type { AiUsageLog } from "@prisma/client";
import { db } from "@/lib/db";

export type UsagePeriod = "today" | "week" | "month" | "year";
export const USAGE_PERIODS: UsagePeriod[] = ["today", "week", "month", "year"];

const BALANCE_KEY = "ai.creditBalanceNaira";
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

export async function getCreditBalance() {
  const rows = await db.setting.findMany({ where: { key: { in: [BALANCE_KEY, BALANCE_SET_AT_KEY] } } });
  const val = (k: string) => rows.find((r) => r.key === k)?.value;
  const loaded = Number(val(BALANCE_KEY));
  const setAt = val(BALANCE_SET_AT_KEY);
  if (!Number.isFinite(loaded) || !setAt) return { configured: false as const };

  const since = await db.aiUsageLog.aggregate({ where: { createdAt: { gte: new Date(setAt) } }, _sum: { costNaira: true } });
  const spent = since._sum.costNaira ?? 0;
  const remaining = Math.max(0, loaded - spent);
  const percentRemaining = loaded > 0 ? Math.round((remaining / loaded) * 100) : 0;
  return {
    configured: true as const,
    loaded: round(loaded),
    setAt,
    spent: round(spent),
    remaining: round(remaining),
    percentRemaining,
    level: percentRemaining < 10 ? ("critical" as const) : percentRemaining < 20 ? ("low" as const) : ("ok" as const),
  };
}

export async function setCreditBalance(balanceNaira: number) {
  await db.$transaction([
    db.setting.upsert({ where: { key: BALANCE_KEY }, update: { value: String(balanceNaira) }, create: { key: BALANCE_KEY, value: String(balanceNaira) } }),
    db.setting.upsert({
      where: { key: BALANCE_SET_AT_KEY },
      update: { value: new Date().toISOString() },
      create: { key: BALANCE_SET_AT_KEY, value: new Date().toISOString() },
    }),
  ]);
}
