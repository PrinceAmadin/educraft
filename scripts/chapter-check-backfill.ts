/**
 * Chapter gate (30 Sept 2026): chapters written before it.
 *
 *   npm run chapters:check-backfill    (dry run only: nothing is written, no AI is called)
 *
 * Lists every written chapter nobody has uploaded a version of yet whose current text has no settled
 * chapter check, runs the gate's FREE layers on it (formatting on its own Word file, structure, the
 * citation matching, the phrase scan) and says how many would already fail there. The AI reviews add
 * to that. The checks themselves run on the live app: each project's orchestrator run picks its
 * chapters up by itself, and the founder or the COO can press "Check now" on the Documents tab. The
 * drafts are stored in the private file store, which only the deployed app can reach.
 */
import { PrismaClient } from "@prisma/client";
import { chapterTextHash } from "../src/lib/quality/chapter-hash";
import { previewChapterCheck } from "../src/lib/services/chapter-gate";

const db = new PrismaClient();
/** About what one chapter's two AI reviews cost (D8 measured ₦44–49 a chapter). */
const NAIRA_PER_CHECK = 48;

async function main() {
  const cps = await db.generationCheckpoint.findMany({
    where: { status: "COMPLETED", fullOutput: { not: null } },
    orderBy: [{ projectId: "asc" }, { chapterNumber: "asc" }],
    select: { projectId: true, chapterNumber: true, fullOutput: true, outputHash: true, project: { select: { projectId: true, status: true } } },
  });
  const [checks, uploads] = await Promise.all([
    db.chapterCheck.findMany({ where: { subject: "AI_TEXT", status: { in: ["PASSED", "FAILED"] } }, select: { projectId: true, chapterNumber: true, textHash: true } }),
    db.deliverableVersion.findMany({
      where: { submittedByRole: { not: "SYSTEM" }, file: { deletedAt: null }, deliverable: { kind: "CHAPTER", archivedAt: null } },
      select: { deliverable: { select: { projectId: true, chapter: true } } },
    }),
  ]);
  const reviewed = new Set(uploads.map((u) => `${u.deliverable.projectId}:${u.deliverable.chapter}`));
  const todo = cps.filter((c) => {
    if (reviewed.has(`${c.projectId}:${c.chapterNumber}`)) return false;
    const hash = chapterTextHash(c.fullOutput as string);
    return !checks.some((k) => k.projectId === c.projectId && k.chapterNumber === c.chapterNumber && k.textHash === hash);
  });

  console.log(`DRY RUN: ${cps.length} written chapter(s) read; ${todo.length} to be checked (no person's version yet, no settled check of their current text).\n`);
  let pass = 0;
  for (const c of todo) {
    const r = await previewChapterCheck(c.projectId, c.chapterNumber).catch((error) => {
      console.log(`  ${c.project.projectId} Chapter ${c.chapterNumber}: could not be previewed (${error instanceof Error ? error.message : error})`);
      return null;
    });
    if (!r) continue;
    if (r.passed) pass++;
    const ids = [...new Set(r.failures.map((f) => f.id))];
    console.log(`  ${c.project.projectId} (${c.project.status}) Chapter ${c.chapterNumber}: free layers ${r.passed ? "pass" : `fail ${ids.join(", ")}`} (${r.passedCount} of ${r.applicable})${r.rewritable ? "" : " [includes a Word-file rule: a system defect]"}`);
    for (const f of r.failures.slice(0, 4)) console.log(`      - [${f.id}] ${f.message.slice(0, 160)}`);
  }
  console.log(`\n${pass} of ${todo.length} pass the free layers. The AI voice and citation reviews run on the live app: about ₦${todo.length * NAIRA_PER_CHECK} in all, plus ₦300–700 for each chapter rewritten (at most 2 each).`);
  console.log("Nothing written. The live app's orchestrator checks these chapters by itself (or press Check now on the Documents tab).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
