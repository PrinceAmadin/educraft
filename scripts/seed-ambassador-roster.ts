/**
 * Seeds the ambassador roster (slots 001–066, Core, Sub) from
 * prisma/ambassador-roster.ts. Idempotent and non-destructive: rows that
 * already exist are left exactly as they are, so it is safe to re-run after
 * the admin has edited slots in Manage.
 *
 *   npm run roster:seed
 */
import { PrismaClient } from "@prisma/client";
import { CORE_SLOTS, GENERAL_SLOTS, SUB_SLOTS } from "../prisma/ambassador-roster";

async function main() {
  const db = new PrismaClient();
  try {
    const rows = [...GENERAL_SLOTS, ...CORE_SLOTS, ...SUB_SLOTS];
    const { count } = await db.ambassadorSlot.createMany({ data: rows, skipDuplicates: true });
    const total = await db.ambassadorSlot.count();
    console.log(`Seeded ${count} new roster rows (${rows.length - count} already existed). Roster now has ${total}.`);

    // Ambassadors already migrated into HQ that point at a slot code with no
    // roster row would be invisible — report them rather than guess.
    const orphans = await db.ambassador.findMany({
      where: { legacySlotId: { not: null }, NOT: { legacySlotId: { in: rows.map((r) => r.code) } } },
      select: { fullName: true, legacySlotId: true },
    });
    if (orphans.length) console.log("Ambassadors whose slot isn't on the roster:", orphans);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
