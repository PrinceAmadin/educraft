/**
 * Exempts every ambassador who already existed from the tutorial gate.
 *
 * The founder's call: only ambassadors approved from go-live onward are made to
 * watch the tour. The gate is simply `tourVersion != TOUR_VERSION`, so this
 * stamps the current version on everyone who is already here — including the
 * executives' own ambassador records — and the gate then only ever meets people
 * who join afterwards.
 *
 * Run it AFTER the deploy, and before any ambassador signs in. Nothing is
 * urgent while no video is configured: with the setting empty the gate cannot
 * appear at all, so there is no window in which anyone is wrongly held.
 *
 * Idempotent: a second run finds nobody. It never un-stamps anyone, and it
 * never touches someone who has genuinely watched.
 *
 *   npm run ambassadors:tour-backfill              dry run
 *   npm run ambassadors:tour-backfill -- --apply   writes it
 */
import { PrismaClient } from "@prisma/client";
import { TOUR_VERSION } from "../src/lib/ambassador-tour";
import { NOT_THIS_VERSION } from "../src/lib/services/ambassador-tour";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "APPLY — writing changes" : "DRY RUN — nothing is written (add -- --apply to write)");
  console.log(`Tour version: ${TOUR_VERSION}\n`);

  const pending = await db.ambassador.findMany({
    where: NOT_THIS_VERSION,
    orderBy: { createdAt: "asc" },
    select: { id: true, ambassadorId: true, fullName: true, status: true, tourVersion: true, createdAt: true },
  });

  if (pending.length === 0) {
    console.log("Every ambassador is already stamped with this version. Nothing to do.");
    return;
  }

  console.log(`${pending.length} ambassador(s) would be exempted:`);
  for (const a of pending) {
    const was = a.tourVersion ? `was version ${a.tourVersion}` : "never stamped";
    console.log(`   ${a.ambassadorId}  ${a.fullName} (${a.status}, joined ${a.createdAt.toISOString().slice(0, 10)}, ${was})`);
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with -- --apply to exempt them.");
    return;
  }

  // `tourWatchedAt` is stamped too, so the dashboard section reads honestly
  // rather than telling a founding ambassador they have not watched it.
  const now = new Date();
  const result = await db.ambassador.updateMany({
    where: NOT_THIS_VERSION,
    data: { tourVersion: TOUR_VERSION, tourWatchedAt: now },
  });
  console.log(`\nExempted ${result.count} ambassador(s). The gate will now only meet ambassadors approved from here on.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
