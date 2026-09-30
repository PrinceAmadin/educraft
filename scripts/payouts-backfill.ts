/**
 * Phase 3 backfill — fills the audit columns the commission-state-machine
 * migration left to a script (the migration already set `accruedAt` and folded
 * every performance bonus into a BONUS PayoutRecord). For each existing
 * PayoutRecord it derives, from the project's stamped cashflow structure and
 * the frozen project columns — the SAME way the engine's `legsFor` does —
 *   ruleKey · triggerEventKey · ratePercent · cashflowVersionId
 * and writes them WITHOUT re-triggering the engine (a plain update, not a
 * reconcile), so a reversal or a hand-set month is never disturbed.
 *
 *   npm run payouts:backfill              dry run: the status/leg picture + what would change
 *   npm run payouts:backfill -- --apply   writes it
 *
 * Idempotent: only rows still missing a column are touched, so a second dry run
 * after --apply reports nothing to do. BONUS rows carry no rule, trigger, rate
 * or project, so those columns are left null for them.
 */
import { PrismaClient } from "@prisma/client";
import type { CashflowStructure, PersonTrigger } from "../src/lib/finance/cashflow-types";
import { cashflowForProject, getActiveCashflow } from "../src/lib/services/cashflow";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

const RULE_KEY: Record<string, string | null> = { WORKER: "workers", AMBASSADOR: "ambassador", PARENT: "ambassador", HOG: "hog", COO: "coo", BONUS: null };

function ruleKeyForLeg(leg: string): string | null {
  if (leg in RULE_KEY) return RULE_KEY[leg];
  if (leg === "BONUS") return null;
  return leg.toLowerCase();
}

/** The trigger of the Level-1 row this leg belongs to, with the engine's fallbacks. */
function triggerForLeg(leg: string, ruleKey: string | null, s: CashflowStructure): PersonTrigger | null {
  if (leg === "BONUS" || !ruleKey) return null;
  if (leg === "WORKER") {
    const row = s.level1.find((r) => r.kind === "person" && r.recipients === "workers");
    return row?.trigger ?? "completion";
  }
  if (leg === "AMBASSADOR" || leg === "PARENT") {
    const row = s.level1.find((r) => r.kind === "person" && r.recipients === "ambassadors");
    return row?.trigger ?? "downpayment";
  }
  const row = s.level1.find((r) => r.key === ruleKey);
  return row?.trigger ?? "completion";
}

function rateFromBasis(basis: string): number | null {
  const m = /^([\d.]+)%/.exec(basis);
  return m ? Number(m[1]) : null;
}

async function main() {
  console.log(apply ? "APPLY — writing changes" : "DRY RUN — nothing is written (add -- --apply to write)");

  // The active version must exist (the readers, and this script, need it).
  await getActiveCashflow();

  // 1. The honest picture: how many rows of each status per leg (a human checks the migration's PENDING → ACCRUED ran).
  const grouped = await db.payoutRecord.groupBy({ by: ["leg", "status"], _count: { _all: true }, _sum: { amount: true } });
  console.log("\n1. PayoutRecord by leg and status:");
  const legs = [...new Set(grouped.map((g) => g.leg))].sort();
  for (const leg of legs) {
    const parts = grouped.filter((g) => g.leg === leg).map((g) => `${g.status} ${g._count._all} (₦${Math.round(g._sum.amount ?? 0)})`);
    console.log(`   ${leg}: ${parts.join(", ")}`);
  }
  const stillPending = grouped.filter((g) => g.status === "PENDING").reduce((n, g) => n + g._count._all, 0);
  if (stillPending > 0) console.log(`   ⚠ ${stillPending} row(s) are still PENDING — the migration's PENDING → ACCRUED may not have run.`);

  // 2. Rows missing any audit column.
  const rows = await db.payoutRecord.findMany({
    where: {
      OR: [{ ruleKey: null }, { triggerEventKey: null }, { ratePercent: null }, { cashflowVersionId: null }],
    },
    select: {
      id: true,
      leg: true,
      basis: true,
      ruleKey: true,
      triggerEventKey: true,
      ratePercent: true,
      cashflowVersionId: true,
      project: { select: { id: true, cashflowVersionId: true, createdAt: true, workerPayoutRate: true, ambassadorCommRate: true, parentCommRate: true } },
    },
  });
  // A BONUS row legitimately has all four null; it never "needs" a backfill.
  const needsWork = rows.filter((r) => r.leg !== "BONUS");
  console.log(`\n2. Rows missing an audit column: ${rows.length} (${needsWork.length} non-bonus rows to fill, ${rows.length - needsWork.length} bonus rows left as-is)`);

  const structureCache = new Map<string, CashflowStructure>();
  async function structureFor(project: { cashflowVersionId: string | null; createdAt: Date }): Promise<CashflowStructure> {
    const key = project.cashflowVersionId ?? "active";
    const hit = structureCache.get(key);
    if (hit) return hit;
    const s = await cashflowForProject(project);
    structureCache.set(key, s);
    return s;
  }

  let filled = 0;
  for (const r of needsWork) {
    const ruleKey = r.ruleKey ?? ruleKeyForLeg(r.leg);
    let triggerEventKey = r.triggerEventKey as PersonTrigger | null;
    let ratePercent = r.ratePercent;
    let cashflowVersionId = r.cashflowVersionId ?? r.project?.cashflowVersionId ?? null;

    if (r.project) {
      const s = await structureFor(r.project);
      if (triggerEventKey == null) triggerEventKey = triggerForLeg(r.leg, ruleKey, s);
      if (ratePercent == null) {
        ratePercent =
          r.leg === "WORKER"
            ? r.project.workerPayoutRate
            : r.leg === "AMBASSADOR"
              ? r.project.ambassadorCommRate
              : r.leg === "PARENT"
                ? r.project.parentCommRate
                : rateFromBasis(r.basis);
      }
    }
    if (ratePercent == null) ratePercent = rateFromBasis(r.basis);
    if (triggerEventKey == null) triggerEventKey = triggerForLeg(r.leg, ruleKey, (await getActiveCashflow()).structure);

    const data = {
      ...(r.ruleKey == null && ruleKey != null ? { ruleKey } : {}),
      ...(r.triggerEventKey == null && triggerEventKey != null ? { triggerEventKey } : {}),
      ...(r.ratePercent == null && ratePercent != null ? { ratePercent } : {}),
      ...(r.cashflowVersionId == null && cashflowVersionId != null ? { cashflowVersionId } : {}),
    };
    if (Object.keys(data).length === 0) continue;
    filled += 1;
    if (apply) await db.$transaction((tx) => tx.payoutRecord.update({ where: { id: r.id }, data }), { timeout: 30_000, maxWait: 10_000 });
  }
  console.log(`   ${apply ? "filled" : "would fill"} ${filled} row(s)`);

  // 3. Verify the performance-bonus fold (the migration does it; this only reports).
  const [bonusCount, linked] = await Promise.all([
    db.performanceBonus.count(),
    db.performanceBonus.count({ where: { payoutRecordId: { not: null } } }),
  ]);
  const foldedRecords = await db.payoutRecord.count({ where: { leg: "BONUS", recipientType: "EXECUTIVE", bonusKey: { startsWith: "perf:" } } });
  console.log(`\n3. Performance bonuses: ${bonusCount} row(s), ${linked} linked to a BONUS PayoutRecord; ${foldedRecords} folded EXECUTIVE BONUS record(s) exist.`);
  if (bonusCount !== linked) console.log(`   ⚠ ${bonusCount - linked} performance bonus(es) have no payoutRecordId — the migration's fold may not have run.`);

  console.log(apply ? "\nDone." : "\nDry run complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
