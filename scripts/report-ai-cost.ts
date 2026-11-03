/**
 * The AI cost report — read-only, writes nothing, spends nothing.
 *
 *   npm run report:ai-cost                    last 90 days
 *   npm run report:ai-cost -- --days 30       a different window
 *   npm run report:ai-cost -- --all           everything ever logged
 *   npm run report:ai-cost -- --json out.json also save the figures as JSON
 *
 * This is the baseline every cost lever is measured against, and the file that
 * settles what a report REALLY costs. It separates, per project and overall:
 *
 *   first-attempt spend     the first plan + parts of each chapter, research,
 *                           the gate's first pass, the preliminary pages
 *   re-generation spend     every plan after a chapter's first (a failed-run
 *                           retry or a gate rewrite re-pays plan + all parts)
 *   silent-retry spend      part_N_r1 / part_N_r2 (an empty reply, re-asked)
 *   second-try spend        <step>_notool / <step>_retry re-sends
 *   re-check spend          gate AI calls beyond a chapter text's first check
 *   failed/timeout spend    paid calls that returned nothing usable
 *
 * Caveats it prints with the figures: rows before the timeout fix logged ₦0
 * for timed-out calls (so old windows UNDER-report), and costNaira is frozen
 * at the FX rate of its day.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface Row {
  projectId: string | null;
  subsystem: string;
  step: string;
  chapterNumber: number | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  batch: boolean;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costNaira: number;
  status: string;
  createdAt: Date;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/** part_3_r1 / draft_objectives_retry / check_objectives_notool → the waste class it belongs to. */
export function classifyStep(step: string): "silent_retry" | "second_try" | "base" {
  if (/_r\d+$/.test(step)) return "silent_retry";
  if (step.endsWith("_notool") || step.endsWith("_retry") || step.includes("_retry_")) return "second_try";
  return "base";
}

interface Buckets {
  first: number;
  regeneration: number;
  silentRetry: number;
  secondTry: number;
  recheck: number;
  failed: number;
  total: number;
}

const zero = (): Buckets => ({ first: 0, regeneration: 0, silentRetry: 0, secondTry: 0, recheck: 0, failed: 0, total: 0 });

/**
 * Split one project's rows into the waste classes. Re-generation detection: a
 * chapter's rows are read in time order, and every `plan` after the first
 * starts a new generation of that chapter — a runner retry or a gate rewrite,
 * both of which re-pay the plan and every part. Re-check detection: a chapter's
 * gate AI pair beyond its first (`chapter_voice` / `chapter_support` /
 * `voice` / `citation_support` per chapter) is a re-check of changed text.
 */
export function splitProject(rows: Row[]): Buckets {
  const b = zero();
  const planSeen = new Map<string, number>(); // chapter → plans so far
  const regenerating = new Set<string>(); // chapters currently past their first plan
  const gateSeen = new Map<string, number>(); // chapter+step family → checks so far
  const sorted = [...rows].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  for (const r of sorted) {
    b.total += r.costNaira;
    if (r.status !== "success") {
      b.failed += r.costNaira;
      continue;
    }
    const cls = classifyStep(r.step);
    if (r.subsystem === "chapter_generation") {
      const ch = String(r.chapterNumber ?? 0);
      if (r.step === "plan") {
        const n = (planSeen.get(ch) ?? 0) + 1;
        planSeen.set(ch, n);
        if (n > 1) regenerating.add(ch);
        else regenerating.delete(ch);
        (n > 1 ? (b.regeneration += r.costNaira) : (b.first += r.costNaira));
        continue;
      }
      if (cls === "silent_retry") {
        b.silentRetry += r.costNaira;
        continue;
      }
      (regenerating.has(ch) ? (b.regeneration += r.costNaira) : (b.first += r.costNaira));
      continue;
    }
    if (r.subsystem === "quality_gate" && r.chapterNumber != null) {
      const family = r.step.replace(/^chapter_/, "").replace(/_notool$|_retry$/, "");
      const key = `${r.chapterNumber}:${family}`;
      const n = (gateSeen.get(key) ?? 0) + 1;
      gateSeen.set(key, n);
      if (n > 1) {
        b.recheck += r.costNaira;
        continue;
      }
    }
    if (cls === "silent_retry") b.silentRetry += r.costNaira;
    else if (cls === "second_try") b.secondTry += r.costNaira;
    else b.first += r.costNaira;
  }
  return b;
}

function addBuckets(a: Buckets, c: Buckets): void {
  a.first += c.first;
  a.regeneration += c.regeneration;
  a.silentRetry += c.silentRetry;
  a.secondTry += c.secondTry;
  a.recheck += c.recheck;
  a.failed += c.failed;
  a.total += c.total;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const daysIdx = args.indexOf("--days");
  const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 90;
  const jsonIdx = args.indexOf("--json");
  const jsonPath = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
  const from = all ? null : new Date(Date.now() - days * 86_400_000);

  const rows: Row[] = await db.aiUsageLog.findMany({
    where: from ? { createdAt: { gte: from } } : undefined,
    select: {
      projectId: true,
      subsystem: true,
      step: true,
      chapterNumber: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      thinkingTokens: true,
      batch: true,
      cacheWriteTokens: true,
      cacheReadTokens: true,
      costNaira: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`AI cost report — ${all ? "all time" : `last ${days} days`} — ${rows.length} logged call(s)\n`);
  if (!rows.length) {
    console.log("Nothing logged in this window.");
    return;
  }

  // ── Per project ───────────────────────────────────────────────────────────
  const byProject = new Map<string, Row[]>();
  for (const r of rows) byProject.set(r.projectId ?? "-", [...(byProject.get(r.projectId ?? "-") ?? []), r]);

  const ids = [...byProject.keys()].filter((k) => k !== "-");
  const [projects, deleted] = await Promise.all([
    db.project.findMany({ where: { id: { in: ids } }, select: { id: true, projectId: true } }),
    db.deletedProject.findMany({ where: { projectDbId: { in: ids } }, select: { projectDbId: true, projectCode: true } }),
  ]);
  const codeOf = new Map<string, string>();
  for (const p of projects) codeOf.set(p.id, p.projectId);
  for (const d of deleted) if (!codeOf.has(d.projectDbId)) codeOf.set(d.projectDbId, `${d.projectCode} (deleted)`);

  const overall = zero();
  const perProject: { code: string; b: Buckets; isReport: boolean }[] = [];
  for (const [id, prows] of byProject) {
    const b = splitProject(prows);
    addBuckets(overall, b);
    perProject.push({
      code: id === "-" ? "(no project)" : (codeOf.get(id) ?? id),
      b,
      isReport: prows.some((r) => r.subsystem === "chapter_generation"),
    });
  }
  perProject.sort((x, y) => y.b.total - x.b.total);

  // ── Headline ──────────────────────────────────────────────────────────────
  const reports = perProject.filter((p) => p.isReport);
  const reportTotals = reports.map((p) => p.b.total);
  console.log("THE HEADLINE — projects that generated chapters (\"reports\"):");
  console.log(`  reports in window:   ${reports.length}`);
  console.log(`  median cost:         ${naira(median(reportTotals))}`);
  console.log(`  mean cost:           ${naira(reportTotals.reduce((a, c) => a + c, 0) / Math.max(1, reportTotals.length))}`);
  console.log(`  dearest:             ${reports[0] ? `${naira(reports[0].b.total)} (${reports[0].code})` : "–"}`);
  console.log("");

  // ── Where the money went ──────────────────────────────────────────────────
  const t = overall.total;
  console.log("WHERE THE MONEY WENT (every logged call in the window):");
  console.log(`  total:               ${naira(t)}`);
  console.log(`  first attempts:      ${naira(overall.first)}  (${pct(overall.first, t)})`);
  console.log(`  re-generations:      ${naira(overall.regeneration)}  (${pct(overall.regeneration, t)})  ← a chapter re-planned and re-written whole`);
  console.log(`  silent retries:      ${naira(overall.silentRetry)}  (${pct(overall.silentRetry, t)})  ← empty replies re-asked (part_N_rX)`);
  console.log(`  second tries:        ${naira(overall.secondTry)}  (${pct(overall.secondTry, t)})  ← _notool / _retry full re-sends`);
  console.log(`  gate re-checks:      ${naira(overall.recheck)}  (${pct(overall.recheck, t)})  ← AI checks on re-written text`);
  console.log(`  failed/timeout:      ${naira(overall.failed)}  (${pct(overall.failed, t)})  ← paid, nothing usable back`);
  console.log("");

  // ── By subsystem, model, status ───────────────────────────────────────────
  const by = <K extends string>(key: (r: Row) => K) => {
    const m = new Map<K, { cost: number; calls: number }>();
    for (const r of rows) {
      const g = m.get(key(r)) ?? { cost: 0, calls: 0 };
      g.cost += r.costNaira;
      g.calls += 1;
      m.set(key(r), g);
    }
    return [...m.entries()].sort((a, c) => c[1].cost - a[1].cost);
  };
  console.log("BY SUBSYSTEM:");
  for (const [k, v] of by((r) => r.subsystem)) console.log(`  ${k.padEnd(20)} ${naira(v.cost).padStart(12)}  (${pct(v.cost, t)}, ${v.calls} calls)`);
  console.log("\nBY MODEL:");
  for (const [k, v] of by((r) => r.model)) console.log(`  ${k.padEnd(20)} ${naira(v.cost).padStart(12)}  (${pct(v.cost, t)}, ${v.calls} calls)`);
  const batched = rows.filter((r) => r.batch);
  console.log(`\nBATCHED: ${batched.length} call(s), ${naira(batched.reduce((a, r) => a + r.costNaira, 0))} (half price already applied)`);

  // Thinking share — only meaningful once rows carry the new column.
  const withThinking = rows.filter((r) => r.thinkingTokens > 0);
  const outTok = rows.reduce((a, r) => a + r.outputTokens, 0);
  const thinkTok = rows.reduce((a, r) => a + r.thinkingTokens, 0);
  console.log(
    withThinking.length
      ? `THINKING: ${thinkTok.toLocaleString()} of ${outTok.toLocaleString()} output tokens (${pct(thinkTok, outTok)}) went to thinking — the effort lever acts on this.`
      : "THINKING: no rows carry thinking tokens yet (the column is new); re-run after the next generated report.",
  );
  const timeouts = rows.filter((r) => r.status === "timeout");
  console.log(
    `TIMEOUTS: ${timeouts.length} call(s), ${naira(timeouts.reduce((a, r) => a + r.costNaira, 0))} (estimated input only). Rows from before the fix logged ₦0 for these, so older windows UNDER-report.\n`,
  );

  // ── Top projects ──────────────────────────────────────────────────────────
  console.log("TOP 10 PROJECTS BY SPEND:");
  for (const p of perProject.slice(0, 10)) {
    const wasted = p.b.regeneration + p.b.silentRetry + p.b.secondTry + p.b.recheck + p.b.failed;
    console.log(`  ${p.code.padEnd(26)} ${naira(p.b.total).padStart(12)}   first ${naira(p.b.first)}, waste ${naira(wasted)} (${pct(wasted, p.b.total)})`);
  }

  if (jsonPath) {
    const { writeFileSync } = await import("fs");
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          window: all ? "all" : `${days}d`,
          calls: rows.length,
          reports: { count: reports.length, median: median(reportTotals), mean: reportTotals.reduce((a, c) => a + c, 0) / Math.max(1, reportTotals.length) },
          overall,
          bySubsystem: Object.fromEntries(by((r) => r.subsystem)),
          byModel: Object.fromEntries(by((r) => r.model)),
          thinking: { thinkingTokens: thinkTok, outputTokens: outTok },
          perProject: perProject.map((p) => ({ code: p.code, isReport: p.isReport, ...p.b })),
        },
        null,
        2,
      ),
    );
    console.log(`\nJSON written to ${jsonPath}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
