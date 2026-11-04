/**
 * Seeds the nine COO tutorial episode rows, matching the films in the
 * founder's `EduCraft COO/COO Walkthrough` folder (COO-01 … COO-09). Rows are
 * created unpublished with no video, so nothing shows anywhere until the
 * founder uploads each file and publishes it from /admin/tutorials.
 *
 *   npm run tutorials:seed-coo            # dry run
 *   npm run tutorials:seed-coo -- --apply # writes
 *
 * Idempotent by title: a second run creates nothing, and episodes the founder
 * has renamed or added by hand are left alone.
 */
import { PrismaClient } from "@prisma/client";

const EPISODES: { title: string; description: string }[] = [
  { title: "Your job", description: "Your job in one sentence: what you own, what you don't, and how your percentage and bonuses tie to it." },
  { title: "The machine", description: "The whole pipeline on one map, with every point where a decision is yours." },
  { title: "The mode matrix", description: "The five research modes, the three signals behind the recommendation, and the classic conflicts." },
  { title: "Research and objectives", description: "Approving research, the aim and objectives, and the Law and History source stage." },
  { title: "The quality system", description: "What the automated checks already cover, so you never check it by hand." },
  { title: "What you review", description: "The judgements only a person can make, and a ten-minute review method." },
  { title: "People", description: "Assigning work, capacity, flags, and when to escalate." },
  { title: "Corrections and disputes", description: "Supervisor corrections, the three-round limit, and disputes." },
  { title: "Your week", description: "A week that does not burn you out: daily triage, weekly calibration, monthly reports." },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const existing = await db.trainingVideo.findMany({
      where: { audience: "COO" },
      select: { title: true, episodeNo: true },
      orderBy: { episodeNo: "asc" },
    });
    const have = new Set(existing.map((e) => e.title.toLowerCase()));
    let nextNo = existing.reduce((max, e) => Math.max(max, e.episodeNo), 0) + 1;

    const missing = EPISODES.filter((e) => !have.has(e.title.toLowerCase()));
    if (existing.length > 0) {
      console.log(`COO episodes already present: ${existing.map((e) => `${e.episodeNo}. ${e.title}`).join(" · ")}`);
    }
    if (missing.length === 0) {
      console.log("Nothing to create.");
      return;
    }
    for (const e of missing) {
      console.log(`${apply ? "create" : "would create"} episode ${nextNo}: ${e.title}`);
      if (apply) {
        await db.trainingVideo.create({
          data: { audience: "COO", episodeNo: nextNo, title: e.title, description: e.description },
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
