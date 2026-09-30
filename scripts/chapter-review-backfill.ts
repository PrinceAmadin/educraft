/**
 * Chapter review (30 Sept 2026): brings projects made before it in line.
 *
 *   npm run chapters:backfill              (dry run: prints what it would change)
 *   npm run chapters:backfill -- --apply   (writes)
 *
 * 1. A full report's Chapter 3 onwards now come only inside the complete project
 *    (DeliverableAccess WITH_COMPLETE). Items still on the template's old BALANCE,
 *    never set by a person, are moved; anything a person set (Release early,
 *    Withheld, or any change) is left as it is.
 * 2. Reports the pipeline writes: which finished chapters have no AI draft yet.
 *    Drafts are stored in the private file store, which only the deployed app can
 *    reach, so they are made on the server the first time the project's page is
 *    opened (ensureChapterDrafts); this only lists them.
 * 3. Complete documents already in QA or released that were built before chapter
 *    review (no record of approved chapters): listed, left alone. They stay
 *    releasable; the next one is built from approved chapters.
 *
 * Idempotent: a second run finds nothing to change.
 */
import { PrismaClient } from "@prisma/client";
import { deliverableTemplate, orderedChapters } from "../src/lib/deliverables";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      projectId: true,
      status: true,
      chapterCount: true,
      additionalData: true,
      service: { select: { serviceCode: true, serviceName: true } },
      deliverables: {
        select: {
          id: true,
          key: true,
          kind: true,
          access: true,
          accessSetById: true,
          versions: { where: { file: { deletedAt: null } }, select: { id: true, status: true, submittedByRole: true, builtFrom: true } },
        },
      },
      generationCheckpoints: { where: { status: "COMPLETED" }, select: { chapterNumber: true } },
      _count: { select: { generationCheckpoints: true } },
    },
  });

  const moves: { project: string; id: string; key: string }[] = [];
  const drafts: { project: string; chapters: number[] }[] = [];
  const legacyFinals: { project: string; status: string; versions: number }[] = [];

  for (const p of projects) {
    const template = deliverableTemplate({ serviceCode: p.service.serviceCode, serviceName: p.service.serviceName, chapterCount: p.chapterCount, chapters: orderedChapters(p.additionalData) });
    for (const spec of template.filter((s) => s.access === "WITH_COMPLETE")) {
      const d = p.deliverables.find((x) => x.key === spec.key);
      if (d && d.access === "BALANCE" && !d.accessSetById) moves.push({ project: p.projectId, id: d.id, key: d.key });
    }

    if (p._count.generationCheckpoints > 0) {
      const missing = p.generationCheckpoints
        .map((c) => c.chapterNumber)
        .filter((n) => {
          const item = p.deliverables.find((d) => d.kind === "CHAPTER" && d.key === `ch${n}`);
          return !item || item.versions.length === 0;
        })
        .sort((a, b) => a - b);
      if (missing.length) drafts.push({ project: p.projectId, chapters: missing });
      const finals = p.deliverables.filter((d) => d.kind === "FINAL").flatMap((d) => d.versions.filter((v) => v.builtFrom == null && (v.status === "SUBMITTED" || v.status === "RELEASED")));
      if (finals.length) legacyFinals.push({ project: p.projectId, status: p.status, versions: finals.length });
    }
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${projects.length} projects read.`);
  console.log(`\n1. Chapter 3 onwards moved to "only in the complete project": ${moves.length}`);
  for (const m of moves) console.log(`   ${m.project} ${m.key}`);
  console.log(`\n2. Finished chapters with no AI draft yet (made when the project page is opened on the live app): ${drafts.length} project(s)`);
  for (const d of drafts) console.log(`   ${d.project}: Chapter ${d.chapters.join(", ")}`);
  console.log(`\n3. Complete documents built before chapter review (left as they are): ${legacyFinals.length}`);
  for (const f of legacyFinals) console.log(`   ${f.project} (${f.status}): ${f.versions} version(s)`);

  if (apply && moves.length) {
    const res = await db.projectDeliverable.updateMany({ where: { id: { in: moves.map((m) => m.id) }, access: "BALANCE", accessSetById: null }, data: { access: "WITH_COMPLETE" } });
    console.log(`\nMoved ${res.count} item(s).`);
  } else if (!apply) {
    console.log("\nNothing written. Run with -- --apply to move the items in 1.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
