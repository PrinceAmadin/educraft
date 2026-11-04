/**
 * Seeds the worker training episode rows, matching the films in the founder's
 * `EduCraft COO/Worker's tutorials` folder (WRK-01 … WRK-11). Rows are created
 * unpublished with no video, so nothing gates anyone until the founder uploads
 * each file and publishes it from /admin/tutorials.
 *
 *   npm run tutorials:seed-worker            # dry run
 *   npm run tutorials:seed-worker -- --apply # writes
 *
 * Idempotent by title: a second run creates nothing, and episodes the founder
 * has renamed or added by hand are left alone.
 */
import { PrismaClient } from "@prisma/client";

const EPISODES: { title: string; description: string }[] = [
  { title: "Your job", description: "What EduCraft does, where you fit, and the standard every report is held to." },
  { title: "Your dashboard and accepting work", description: "Finding your assignments, your deadlines and how to accept a project." },
  { title: "Reading the brief", description: "The order, the supervisor's instructions and what the client actually asked for." },
  { title: "Research", description: "How the reference list is built and what to look for in it before you write." },
  { title: "Starting the report", description: "How a report is written on the platform, chapter by chapter." },
  { title: "Waiting for data", description: "The data pause: what the client sends, and how you check it before the chapter continues." },
  { title: "Reviewing an AI draft", description: "Reading a draft with a critical eye — spotting what the machine got wrong and fixing it." },
  { title: "Word rules", description: "The formatting standard, and getting a chapter right in Word fast." },
  { title: "Sending for approval", description: "Uploading your corrected chapter and sending it on for approval." },
  { title: "Report QA and corrections", description: "The quality gate, supervisor corrections, and what to do when a chapter comes back." },
  { title: "Getting paid", description: "How and when you are paid, and where to see your earnings." },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const existing = await db.trainingVideo.findMany({
      where: { audience: "WORKER" },
      select: { title: true, episodeNo: true },
      orderBy: { episodeNo: "asc" },
    });
    const have = new Set(existing.map((e) => e.title.toLowerCase()));
    let nextNo = existing.reduce((max, e) => Math.max(max, e.episodeNo), 0) + 1;

    const missing = EPISODES.filter((e) => !have.has(e.title.toLowerCase()));
    if (existing.length > 0) {
      console.log(`Worker episodes already present: ${existing.map((e) => `${e.episodeNo}. ${e.title}`).join(" · ")}`);
    }
    if (missing.length === 0) {
      console.log("Nothing to create.");
      return;
    }
    for (const e of missing) {
      console.log(`${apply ? "create" : "would create"} episode ${nextNo}: ${e.title}`);
      if (apply) {
        await db.trainingVideo.create({
          data: { audience: "WORKER", episodeNo: nextNo, title: e.title, description: e.description },
        });
      }
      nextNo++;
    }
    console.log(apply ? `Created ${missing.length} episode(s), unpublished.` : `Dry run — re-run with -- --apply to write.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
