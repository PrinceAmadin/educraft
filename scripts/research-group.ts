/**
 * One-shot backfill: mints the supervisor grouping (which subproblem each
 * kept reference primarily addresses) for every PASSED ResearchJob that
 * still has none. Old jobs finished before 1 Oct 2026 fall into this bucket.
 * Idempotent — a second run finds nothing to do. ~₦25 per job.
 *
 *   npm run research:group          # dry run (lists the jobs that need it)
 *   npm run research:group -- --apply
 */
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { mintSupervisorGrouping, type ProjectAnalysis } from "../src/lib/services/research";

// The service function reads `analysis` from a shape it already exports; the
// same shape the pipeline stores on `ResearchJob.projectAnalysis`. We validate
// what we read here rather than trust the JSON blindly.
function coerceAnalysis(raw: unknown): ProjectAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const goal = typeof a.goal === "string" ? a.goal.trim() : "";
  if (!goal) return null;
  return {
    goal,
    components: strArr(a.components),
    subproblems: strArr(a.subproblems),
    offTopicGuards: strArr(a.offTopicGuards),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pending = await db.researchJob.findMany({
    where: { status: "PASSED", supervisorGrouping: { equals: Prisma.DbNull } },
    select: {
      id: true,
      projectId: true,
      projectAnalysis: true,
      project: {
        select: {
          projectId: true,
          projectTitle: true,
          client: { select: { department: true, university: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[research:group] ${pending.length} PASSED job(s) still need a supervisorGrouping`);
  if (pending.length === 0) return;
  if (!apply) {
    console.log("[research:group] Dry run — re-run with -- --apply to write.");
    for (const j of pending) console.log(`  ${j.project.projectId}`);
    return;
  }
  let done = 0;
  for (const j of pending) {
    const analysis = coerceAnalysis(j.projectAnalysis);
    if (!analysis) {
      console.log(`  ${j.project.projectId} skipped (no projectAnalysis; predates the goal-first fix)`);
      continue;
    }
    const ctx = {
      id: j.projectId,
      projectId: j.project.projectId,
      topic: j.project.projectTitle ?? j.project.projectId,
      department: j.project.client.department ?? "",
      universityName: j.project.client.university?.name ?? null,
    };
    try {
      const grouping = await mintSupervisorGrouping(ctx, j.id, analysis);
      const total = grouping.groups.reduce((a, g) => a + g.referenceIds.length, 0);
      console.log(`  ${j.project.projectId} → ${grouping.groups.length} group(s), ${total} placed, ${grouping.unassigned.length} unassigned`);
      done++;
    } catch (error) {
      console.error(`  ${j.project.projectId} failed`, error);
    }
  }
  console.log(`[research:group] Minted ${done}/${pending.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
