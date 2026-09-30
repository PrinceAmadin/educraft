/**
 * One-shot backfill: mints a shareToken for every PASSED ResearchJob that
 * doesn't have one, so old projects (finished before 30 Sept 2026) get their
 * public supervisor page too — without re-running the pipeline. Idempotent:
 * a second run finds nothing to do.
 *
 *   npm run research:tokenize         # dry run
 *   npm run research:tokenize -- --apply
 */
import crypto from "crypto";
import { db } from "../src/lib/db";

async function main() {
  const apply = process.argv.includes("--apply");
  const pending = await db.researchJob.findMany({
    where: { status: "PASSED", shareToken: null },
    select: { id: true, projectId: true, project: { select: { projectId: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[research:tokenize] ${pending.length} PASSED job(s) need a shareToken`);
  if (pending.length === 0) return;
  if (!apply) {
    console.log("[research:tokenize] Dry run — re-run with -- --apply to write.");
    for (const j of pending) console.log(`  ${j.project.projectId}`);
    return;
  }
  let done = 0;
  for (const j of pending) {
    const shareToken = crypto.randomBytes(16).toString("hex");
    try {
      await db.researchJob.update({ where: { id: j.id }, data: { shareToken } });
      console.log(`  ${j.project.projectId} → ${shareToken}`);
      done++;
    } catch (error) {
      console.error(`  ${j.project.projectId} failed`, error);
    }
  }
  console.log(`[research:tokenize] Minted ${done}/${pending.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
