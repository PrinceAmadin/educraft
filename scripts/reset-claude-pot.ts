/**
 * One-off (founder's decision, 1 Oct 2026): reset the claude_api pot to ₦0.
 *
 * The Phase 4 backfill mapped historical Claude spend — almost all of it the
 * Phase D build/test costs, booked as Operations Reserve "API cost" expenses
 * before pot tracking existed — onto the claude_api pot, leaving it ~−₦19,643.
 * That dev-phase debt does not belong in the forward-looking operational pot,
 * so we credit Operations Reserve and the claude_api pot by the deficit (one
 * audited adjustment): the pot reads ₦0, the bucket's "general (unearmarked)"
 * stays ~₦0, and CashflowAuditLog records exactly why.
 *
 * The live app's manual-adjustment path does the same through
 * `manualAdjustment({ potKey })`; a bare script cannot call it because it reads
 * the active version through `unstable_cache`, so this reads the version from
 * the table and writes the three rows itself.
 *
 * Idempotent: if the pot is already ₦0 it does nothing.
 *
 *   npm run pots:reset-claude              dry run
 *   npm run pots:reset-claude -- --apply   writes it
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { potsOf } from "../src/lib/finance/cashflow-types";
import { cashflowStructureSchema, toStructure } from "../src/lib/validations/cashflow";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

const AUDIT_NOTE =
  "claude_api pot reset from −₦19,643 to ₦0 on migration. Historical underfunding of ~₦19,643 driven by Phase D build/test costs booked as Ops Reserve expenses before pot tracking existed. Watch for recurrence in production revenue.";

function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  console.log(apply ? "APPLY — writing changes" : "DRY RUN — nothing is written (add -- --apply to write)");

  // The pot must be a tracked pot of Operations Reserve in the active version.
  const active = await db.cashflowVersion.findFirst({ where: { effectiveTo: null }, orderBy: { versionNumber: "desc" }, select: { structure: true } });
  if (!active) throw new Error("No active cashflow version. Run `npm run cashflow:seed -- --apply` first.");
  const structure = toStructure(cashflowStructureSchema.parse(active.structure));
  const ok = potsOf(structure, "OPERATIONS_RESERVE").some((p) => p.key === "claude_api" && p.isTrackedAsPot);
  if (!ok) throw new Error("claude_api is not a tracked pot of Operations Reserve in the active version.");

  const agg = await db.potTransaction.groupBy({ by: ["potKey"], where: { potKey: "claude_api" }, _sum: { amount: true } });
  const current = Math.round(agg[0]?._sum.amount ?? 0);
  console.log(`\nclaude_api pot balance now: ₦${current}`);

  if (current === 0) {
    console.log("Already at ₦0 — nothing to do.");
    return;
  }

  const delta = -current; // e.g. -(-19643) = +19643
  console.log(`Adjustment to reach ₦0: ${delta > 0 ? "+" : ""}₦${delta} (Operations Reserve, earmarked to claude_api)`);

  const admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true, email: true } });
  if (!admin) throw new Error("No SUPER_ADMIN user found to attribute the adjustment to.");
  console.log(`Actor: ${admin.email} (${admin.id})`);

  if (!apply) {
    console.log("\nDry run complete. Re-run with -- --apply to write.");
    return;
  }

  const month = monthKeyOf(new Date());
  const reason = "claude_api pot reset to ₦0 (Phase D dev-phase costs)";
  await db.$transaction(async (tx) => {
    const row = await tx.bucketTransaction.create({
      data: { bucketType: "OPERATIONS_RESERVE", type: "ADJUSTMENT", amount: delta, description: `Manual adjustment: ${reason}`, recordedById: admin.id, month },
      select: { id: true },
    });
    await tx.potTransaction.create({
      data: { potKey: "claude_api", bucketType: "OPERATIONS_RESERVE", type: "ADJUSTMENT", amount: delta, month, recordedById: admin.id, note: reason },
    });
    await tx.cashflowAuditLog.create({
      data: {
        actorUserId: admin.id,
        action: "bucket_adjustment",
        entityType: "BucketTransaction",
        entityId: row.id,
        afterJson: { bucket: "OPERATIONS_RESERVE", amount: delta, potKey: "claude_api" } as unknown as Prisma.InputJsonValue,
        reason: AUDIT_NOTE,
      },
    });
  });

  const after = await db.potTransaction.groupBy({ by: ["potKey"], _sum: { amount: true } });
  console.log("\nPot balances now:");
  for (const b of after.sort((a, z) => a.potKey.localeCompare(z.potKey))) console.log(`   ${b.potKey}: ₦${Math.round(b._sum.amount ?? 0)}`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
