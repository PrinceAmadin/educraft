/**
 * Phase 2 backfill — brings money that moved before the finance platform
 * existed into it. Idempotent: every step is delta-based or keyed, so a
 * re-run adds nothing.
 *
 *   npm run finance:backfill              dry run: prints what would change
 *   npm run finance:backfill -- --apply   writes it
 *
 * What it does:
 *   1. Payment rows: ambassadorId / isAmbassadorDriven snapshot from the project.
 *   2. Buckets: for every project with confirmed client money, one BACKFILL
 *      allocation per confirmed inflow that has none, as the buckets stood at
 *      that payment (so each lands in its own month). A project REFUNDED
 *      before refunds were recorded as rows is treated as fully refunded and
 *      left out.
 */
import { PrismaClient } from "@prisma/client";
import { expectedAllocation } from "../src/lib/finance/commission-config";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  console.log(apply ? "APPLY — writing changes" : "DRY RUN — nothing is written (add -- --apply to write)");

  // 1. Ambassador snapshot on Payment rows.
  const stale = await db.payment.findMany({
    where: { projectId: { not: null } },
    select: { id: true, ambassadorId: true, isAmbassadorDriven: true, project: { select: { ambassadorId: true } } },
  });
  const toFix = stale.filter((p) => p.project && (p.ambassadorId !== p.project.ambassadorId || p.isAmbassadorDriven !== (p.project.ambassadorId != null)));
  console.log(`\n1. Payment ambassador snapshot: ${toFix.length} row(s) to align`);
  if (apply) {
    for (const p of toFix) {
      await db.payment.update({ where: { id: p.id }, data: { ambassadorId: p.project!.ambassadorId, isAmbassadorDriven: p.project!.ambassadorId != null } });
    }
  }

  // 2. Bucket allocations, one per confirmed inflow without a log.
  const projects = await db.project.findMany({
    where: { payments: { some: { status: "Confirmed", direction: "INFLOW", type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] } } } },
    select: {
      id: true,
      projectId: true,
      status: true,
      price: true,
      workerPayout: true,
      workerPayoutRate: true,
      ambassadorCommission: true,
      parentCommission: true,
      ambassadorId: true,
      isProBono: true,
      payments: {
        where: { status: "Confirmed", OR: [{ direction: "INFLOW", type: { in: ["CLIENT_DOWNPAYMENT", "CLIENT_BALANCE"] } }, { direction: "OUTFLOW", type: "REFUND" }] },
        orderBy: { date: "asc" },
        select: { id: true, direction: true, amount: true, date: true, bucketAllocation: { select: { id: true } } },
      },
      bucketAllocations: { select: { retainedAmount: true } },
    },
    orderBy: { projectId: "asc" },
  });
  console.log(`\n2. Buckets: ${projects.length} project(s) with confirmed money`);

  const { syncProjectBuckets } = await import("../src/lib/services/finance/buckets");
  let written = 0;
  let totalDelta = 0;
  for (const p of projects) {
    const hasRefundRows = p.payments.some((x) => x.direction === "OUTFLOW");
    if (p.status === "REFUNDED" && !hasRefundRows) {
      console.log(`   ${p.projectId}: REFUNDED before refunds were recorded — treated as fully refunded, nothing allocated`);
      continue;
    }
    const logged = Math.round(p.bucketAllocations.reduce((s, l) => s + l.retainedAmount, 0));
    let running = 0;
    const plan: { paymentId: string; month: string; delta: number; asOf: Date }[] = [];
    let soFar = logged;
    for (const pay of p.payments) {
      running += pay.direction === "INFLOW" ? pay.amount : -pay.amount;
      if (pay.direction !== "INFLOW" || pay.bucketAllocation) continue;
      const expected = expectedAllocation(p, Math.round(running));
      const delta = expected - soFar;
      if (delta === 0) continue;
      plan.push({ paymentId: pay.id, month: monthKeyOf(pay.date), delta, asOf: pay.date });
      soFar = expected;
    }
    if (plan.length === 0) {
      console.log(`   ${p.projectId}: up to date (retained ${logged.toLocaleString()} logged)`);
      continue;
    }
    for (const step of plan) {
      console.log(`   ${p.projectId}: ${step.month} ${step.delta >= 0 ? "+" : ""}${step.delta.toLocaleString()} retained (payment ${step.paymentId})`);
      totalDelta += step.delta;
      if (apply) {
        await db.$transaction(
          async (tx) => {
            const r = await syncProjectBuckets(tx, p.id, { reason: "BACKFILL", paymentId: step.paymentId, month: step.month, asOf: step.asOf, note: "Backfill: money confirmed before the finance platform" });
            if (r.delta !== 0) written += 1;
          },
          { timeout: 20_000, maxWait: 10_000 }
        );
      }
    }
  }
  console.log(`\n   Σ retained to allocate: ${totalDelta.toLocaleString()} naira${apply ? ` — ${written} allocation(s) written` : ""}`);

  if (apply) {
    const rows = await db.bucketTransaction.groupBy({ by: ["bucketType"], _sum: { amount: true } });
    console.log("\n   Bucket balances now:", rows.map((r) => `${r.bucketType}=${Math.round(r._sum.amount ?? 0).toLocaleString()}`).join("  "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
