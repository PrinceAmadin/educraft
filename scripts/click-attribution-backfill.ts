/**
 * Attribute recorded clicks to the ambassadors who own their slots.
 *
 * A ClickEvent's `ambassadorId` is resolved at insert time from
 * `Ambassador.legacySlotId = slotCode`; when the slot's person had no HQ
 * record yet, the row was stored with `ambassadorId = NULL` and is invisible
 * on the leaderboard and in their analytics. Approval now claims a slot's
 * clicks the moment an application takes it (`claimSlotClicks`); this script
 * heals everything from before that fix, and can be rerun any time.
 *
 *   npm run clicks:attribute              dry run (reports, writes nothing)
 *   npm run clicks:attribute -- --apply   write
 *
 * Idempotent: it only ever fills NULLs, so a second run finds nothing.
 * Clicks on slots whose person still has no HQ record are listed but left
 * alone — there is nobody to credit until that person registers.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "APPLY RUN — writing attributions.\n" : "DRY RUN — nothing will be written. Pass -- --apply to write.\n");

  const ambassadors = await db.ambassador.findMany({
    where: { legacySlotId: { not: null } },
    select: { id: true, ambassadorId: true, fullName: true, legacySlotId: true },
  });
  const bySlot = new Map(ambassadors.map((a) => [a.legacySlotId!, a]));

  const orphaned = await db.clickEvent.groupBy({
    by: ["slotCode"],
    where: { ambassadorId: null },
    _count: { _all: true },
  });

  let claimable = 0;
  let unclaimable = 0;
  for (const g of orphaned.sort((a, b) => b._count._all - a._count._all)) {
    const owner = bySlot.get(g.slotCode);
    if (owner) {
      claimable += g._count._all;
      console.log(`  slot ${g.slotCode}: ${g._count._all} click(s) -> ${owner.fullName} (${owner.ambassadorId})`);
      if (APPLY) {
        const { count } = await db.clickEvent.updateMany({
          where: { slotCode: g.slotCode, ambassadorId: null },
          data: { ambassadorId: owner.id },
        });
        console.log(`    claimed ${count}`);
      }
    } else {
      unclaimable += g._count._all;
      console.log(`  slot ${g.slotCode}: ${g._count._all} click(s) — no HQ ambassador owns this slot; left for when they register`);
    }
  }

  if (!orphaned.length) console.log("  No unattributed clicks at all.");
  console.log(`\n${APPLY ? "Claimed" : "Would claim"} ${claimable} click(s); ${unclaimable} stay unattributed (no HQ record yet).`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
