/**
 * Phase 4 backfill — reconstruct the pot ledger from history (the migration adds
 * the empty table; this fills it), idempotently:
 *   1. INFLOWs: split every past BucketAllocationLog's per-bucket delta through
 *      that project's own cashflow version (potSplit), keyed to the log so a
 *      re-run adds nothing.
 *   2. OUTFLOWs: for every counted Operations-Reserve expense, a pot outflow on
 *      the pot it names (or its category's default pot for pre-Phase-4 rows),
 *      keyed by expenseId.
 * Going forward the live code writes both (syncProjectBuckets, syncExpenseOutflow);
 * this only seeds what happened before Phase 4 shipped.
 *
 *   npm run pots:backfill              dry run: what would be written + the resulting balances
 *   npm run pots:backfill -- --apply   writes it
 */
import { PrismaClient, type BucketType } from "@prisma/client";
import { potSplit, BUCKET_TYPES } from "../src/lib/finance/commission-config";
import type { CashflowStructure } from "../src/lib/finance/cashflow-types";
import { cashflowStructureSchema, toStructure } from "../src/lib/validations/cashflow";
import { DEFAULT_POT_FOR_CATEGORY } from "../src/lib/validations/expenses";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const COUNTED = ["AUTO_APPROVED", "APPROVED"];

async function loadVersions() {
  const rows = await db.cashflowVersion.findMany({ orderBy: { versionNumber: "asc" }, select: { id: true, structure: true, effectiveFrom: true, effectiveTo: true } });
  if (rows.length === 0) throw new Error("No cashflow version has been published. Run `npm run cashflow:seed -- --apply`");
  const parse = (raw: unknown) => toStructure(cashflowStructureSchema.parse(raw));
  const byId = new Map<string, CashflowStructure>();
  const windows: { from: Date; to: Date | null; s: CashflowStructure }[] = [];
  for (const r of rows) {
    const s = parse(r.structure);
    byId.set(r.id, s);
    windows.push({ from: r.effectiveFrom, to: r.effectiveTo, s });
  }
  const at = (d: Date) => (windows.find((w) => w.from <= d && (w.to === null || w.to > d)) ?? windows[0]).s;
  return { byId, at };
}

async function main() {
  console.log(apply ? "APPLY — writing changes" : "DRY RUN — nothing is written (add -- --apply to write)");
  const versions = await loadVersions();

  // Resolve each project's structure (stamped version, else the one in force at creation).
  const projects = await db.project.findMany({ select: { id: true, cashflowVersionId: true, createdAt: true } });
  const projectStructure = new Map<string, CashflowStructure>();
  for (const p of projects) projectStructure.set(p.id, (p.cashflowVersionId ? versions.byId.get(p.cashflowVersionId) : undefined) ?? versions.at(p.createdAt));

  // 1. INFLOWs from every allocation log.
  const logs = await db.bucketAllocationLog.findMany({
    select: { id: true, projectId: true, paymentId: true, reason: true, month: true, recordedById: true, retainedAmount: true, operationsReserve: true, growthFund: true, reinvestmentFund: true, founderDistribution: true },
  });
  const inflowRows: { potKey: string; bucketType: BucketType; type: string; amount: number; month: string; allocationId: string; paymentId: string | null; projectId: string | null; recordedById: string | null }[] = [];
  for (const log of logs) {
    const s = (log.projectId ? projectStructure.get(log.projectId) : undefined) ?? versions.at(new Date());
    const perBucket: Record<BucketType, number> = {
      OPERATIONS_RESERVE: Math.round(log.operationsReserve),
      GROWTH_FUND: Math.round(log.growthFund),
      REINVESTMENT_FUND: Math.round(log.reinvestmentFund),
      FOUNDER_DISTRIBUTION: Math.round(log.founderDistribution),
    };
    const inflowLike = log.retainedAmount > 0 && (log.reason === "PAYMENT" || log.reason === "BACKFILL");
    for (const bucket of BUCKET_TYPES) {
      for (const [potKey, amt] of potSplit(perBucket[bucket], bucket, s)) {
        if (amt === 0) continue;
        inflowRows.push({ potKey, bucketType: bucket, type: inflowLike ? "INFLOW" : "ADJUSTMENT", amount: amt, month: log.month, allocationId: log.id, paymentId: log.paymentId, projectId: log.projectId, recordedById: log.recordedById });
      }
    }
  }
  const existingInflow = await db.potTransaction.count({ where: { allocationId: { not: null } } });
  console.log(`\n1. Allocation logs: ${logs.length}. Pot inflow rows derived: ${inflowRows.length} (already present: ${existingInflow}).`);
  if (apply && inflowRows.length) {
    // The [allocationId, potKey] unique makes this a no-op on a re-run.
    const res = await db.potTransaction.createMany({ data: inflowRows, skipDuplicates: true });
    console.log(`   wrote ${res.count} new inflow row(s)`);
  }

  // 2. OUTFLOWs from counted Operations-Reserve expenses, mapped to a pot.
  const expenses = await db.expense.findMany({
    where: { bucketSource: "OPERATIONS_RESERVE", approvalStatus: { in: COUNTED } },
    select: { id: true, amount: true, category: true, date: true, kind: true, potKey: true },
  });
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  let outWritten = 0;
  let outSkipped = 0;
  for (const e of expenses) {
    const potKey = e.potKey ?? DEFAULT_POT_FOR_CATEGORY[e.category as keyof typeof DEFAULT_POT_FOR_CATEGORY] ?? null;
    if (!potKey) {
      outSkipped += 1;
      continue;
    }
    const amount = e.kind === "AI" ? -Math.round(e.amount * 100) / 100 : -Math.round(e.amount);
    if (apply) {
      await db.potTransaction.upsert({
        where: { expenseId: e.id },
        create: { expenseId: e.id, potKey, bucketType: "OPERATIONS_RESERVE", type: "OUTFLOW", amount, month: monthKey(e.date) },
        update: { potKey, amount, month: monthKey(e.date) },
      });
    }
    outWritten += 1;
  }
  console.log(`\n2. Counted Operations-Reserve expenses: ${expenses.length}. Mapped to a pot: ${outWritten} (${apply ? "written" : "would write"}); general (no pot): ${outSkipped}.`);

  // 3. The resulting balances.
  const balances = await db.potTransaction.groupBy({ by: ["potKey"], _sum: { amount: true } });
  console.log("\n3. Pot balances now:");
  for (const b of balances.sort((a, z) => a.potKey.localeCompare(z.potKey))) console.log(`   ${b.potKey}: ₦${Math.round(b._sum.amount ?? 0)}`);
  if (balances.length === 0) console.log("   (none yet)");

  console.log(apply ? "\nDone." : "\nDry run complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
