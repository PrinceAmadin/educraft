/**
 * Phase 3 backfill — gives every ambassador-driven job and every referred
 * client from before the Ambassador Platform an `AmbassadorReferral` row, then
 * recomputes each ambassador's lifetime counters and tier from those rows.
 * Idempotent: a job or client that already has a row is skipped, and the
 * recount is a pure recompute, so a re-run changes nothing.
 *
 *   npm run ambassadors:backfill              dry run: prints what would change
 *   npm run ambassadors:backfill -- --apply   writes it
 *
 *   1. Projects with an ambassador (not pro bono) and no referral row:
 *        downpayment Verified          → CONVERTED at the downpayment date
 *        CANCELLED / REFUNDED          → CANCELLED
 *        anything else                 → PENDING
 *      The confirmed downpayment Payment row(s) point at the referral.
 *   2. Clients with a referrer and no referral row at all → PENDING
 *      (a student the ambassador brought in who has not ordered yet).
 *   3. Referred projects whose downpayment is confirmed but which are not
 *      completed (and not cancelled / refunded): the ambassador's commission
 *      and any Core override become PayoutRecords now, in the downpayment's
 *      month (Phase 3 Step 13: commission is owed at the conversion, not at
 *      completion). A leg already marked paid on the project is recorded PAID.
 *   4. Every ambassador: lifetimeReferrals / lifetimeConversions /
 *      lifetimeEarnings / lastReferralAt / lastConversionAt / tier, with a
 *      tier-log line when the tier moves.
 */
import { PrismaClient } from "@prisma/client";
import { recountAmbassador } from "../src/lib/services/ambassador-platform/conversions";
import { reconcileProjectPayouts } from "../src/lib/services/finance/payouts-engine";
import { calculateTier } from "../src/lib/ambassadors/tier-utils";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "APPLY — writing changes" : "DRY RUN — nothing is written (add -- --apply to write)");

  // 1. Projects.
  const projects = await db.project.findMany({
    where: { ambassadorId: { not: null }, isProBono: false, referral: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      projectId: true,
      ambassadorId: true,
      clientId: true,
      price: true,
      status: true,
      downpaymentStatus: true,
      downpaymentDate: true,
      createdAt: true,
      client: { select: { fullName: true, phone: true } },
    },
  });
  const byOutcome = { CONVERTED: 0, CANCELLED: 0, PENDING: 0 };
  for (const p of projects) {
    const status = p.downpaymentStatus === "Verified" ? "CONVERTED" : p.status === "CANCELLED" || p.status === "REFUNDED" ? "CANCELLED" : "PENDING";
    byOutcome[status] += 1;
    if (!apply) continue;
    const row = await db.ambassadorReferral.create({
      data: {
        ambassadorId: p.ambassadorId!,
        clientName: p.client.fullName,
        clientWhatsapp: p.client.phone || null,
        clientId: p.clientId,
        projectId: p.id,
        projectValue: p.price,
        status,
        source: "BACKFILL",
        submittedAt: p.createdAt,
        convertedAt: status === "CONVERTED" ? (p.downpaymentDate ?? p.createdAt) : null,
        notes: status === "CANCELLED" ? `Project ${p.projectId} ${p.status.toLowerCase()} before the platform existed` : null,
      },
      select: { id: true },
    });
    if (status === "CONVERTED") {
      await db.payment.updateMany({ where: { projectId: p.id, type: "CLIENT_DOWNPAYMENT", status: "Confirmed", referralId: null }, data: { referralId: row.id } });
    }
  }
  console.log(`\n1. Projects with an ambassador and no referral row: ${projects.length} → ${byOutcome.CONVERTED} converted, ${byOutcome.PENDING} pending, ${byOutcome.CANCELLED} cancelled`);

  // 2. Referred clients with no row at all.
  const clients = await db.client.findMany({
    where: { referredById: { not: null }, ambassadorReferrals: { none: {} } },
    orderBy: { createdAt: "asc" },
    select: { id: true, clientId: true, fullName: true, phone: true, referredById: true, createdAt: true },
  });
  console.log(`2. Referred clients with no referral row: ${clients.length} → pending`);
  if (apply) {
    for (const c of clients) {
      await db.ambassadorReferral.create({
        data: { ambassadorId: c.referredById!, clientName: c.fullName, clientWhatsapp: c.phone || null, clientId: c.id, status: "PENDING", source: "BACKFILL", submittedAt: c.createdAt },
      });
    }
  }

  // 3. Payout records for converted, unfinished referred projects.
  const owing = await db.project.findMany({
    where: {
      isProBono: false,
      ambassadorId: { not: null },
      downpaymentStatus: "Verified",
      status: { notIn: ["COMPLETED", "CANCELLED", "REFUNDED"] },
      ambassadorCommission: { gt: 0 },
      payoutRecords: { none: { leg: "AMBASSADOR", status: { not: "CANCELLED" } } },
    },
    select: { id: true, projectId: true, ambassadorCommission: true, parentCommission: true, ambassadorCommPaid: true, downpaymentDate: true, ambassador: { select: { fullName: true } } },
  });
  console.log(`3. Converted, unfinished referred projects without a payout record: ${owing.length}`);
  for (const p of owing) {
    console.log(`   ${p.projectId}: ${p.ambassador?.fullName ?? "?"} ₦${Math.round(p.ambassadorCommission ?? 0)}${p.parentCommission ? ` + Core ₦${Math.round(p.parentCommission)}` : ""}${p.ambassadorCommPaid ? " (already paid)" : ""}, downpayment ${p.downpaymentDate?.toISOString().slice(0, 10) ?? "?"}`);
    if (apply) await db.$transaction((tx) => reconcileProjectPayouts(tx, p.id), { timeout: 30_000, maxWait: 10_000 });
  }

  // 4. Recount everyone. The dry run previews every tier that would move, so
  //    the founder sees who goes up or down before anything is written.
  const ambassadors = await db.ambassador.findMany({ select: { id: true, fullName: true, tier: true, lifetimeConversions: true } });
  console.log(`4. Recount ${ambassadors.length} ambassador(s)`);
  if (!apply) {
    const existing = await db.ambassadorReferral.groupBy({ by: ["ambassadorId"], where: { status: "CONVERTED" }, _count: { _all: true } });
    const converted = new Map(existing.map((e) => [e.ambassadorId, e._count._all]));
    for (const p of projects) if (p.downpaymentStatus === "Verified") converted.set(p.ambassadorId!, (converted.get(p.ambassadorId!) ?? 0) + 1);
    let moves = 0;
    for (const a of ambassadors) {
      const n = converted.get(a.id) ?? 0;
      const tier = calculateTier(n);
      if (tier !== a.tier) {
        moves += 1;
        console.log(`   would move ${a.fullName}: ${a.tier} → ${tier} (${n} conversion${n === 1 ? "" : "s"})`);
      }
    }
    console.log(`   tiers that would move: ${moves}`);
  }
  if (apply) {
    let moved = 0;
    for (const a of ambassadors) {
      const r = await db.$transaction((tx) => recountAmbassador(tx, a.id), { timeout: 30_000, maxWait: 10_000 });
      if (r?.tierChanged) {
        moved += 1;
        console.log(`   ${a.fullName}: ${r.previousTier} → ${r.tier} (${r.lifetimeConversions} conversions)`);
      }
    }
    console.log(`   tiers moved: ${moved}`);
  }
  console.log(apply ? "\nDone." : "\nDry run complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
