/**
 * Publishes cashflow version 1 (the manual's numbers, `DEFAULT_CASHFLOW`)
 * and stamps every project with it. Idempotent: a second run finds v1 and
 * only stamps projects still missing a version.
 *
 *   npm run cashflow:seed              dry run: what would be created and stamped
 *   npm run cashflow:seed -- --apply   write it
 *
 * Any live tier-rate override left in the retired Setting rows
 * (commission_rate_bronze … platinum, written from Settings > General before
 * this build) is carried into v1 so a rate the founder had already changed is
 * not lost; the retired keys are then deleted. Run it right after the
 * Phase 1 deploy: until a version exists, the app refuses to compute money.
 */
import { PrismaClient, type AmbassadorTier } from "@prisma/client";
import { DEFAULT_CASHFLOW } from "../src/lib/finance/cashflow-default";
import { canonicalHash, diffStructures, hasErrors, validateStructure } from "../src/lib/finance/cashflow-rules";
import type { CashflowStructure } from "../src/lib/finance/cashflow-types";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

const RATE_KEYS: Record<AmbassadorTier, string> = {
  BRONZE: "commission_rate_bronze",
  SILVER: "commission_rate_silver",
  GOLD: "commission_rate_gold",
  PLATINUM: "commission_rate_platinum",
};
const RETIRED_KEYS = [...Object.values(RATE_KEYS), "parent_commission_rate", "default_downpayment_percentage"];

async function main() {
  console.log(apply ? "APPLY — writing changes" : "DRY RUN — nothing is written (add -- --apply to write)");

  // 1. Version 1: the manual's numbers, with any live tier-rate override folded in.
  const settings = await db.setting.findMany({ where: { key: { in: RETIRED_KEYS } } });
  const valueOf = (key: string) => settings.find((s) => s.key === key)?.value;
  const structure: CashflowStructure = {
    ...DEFAULT_CASHFLOW,
    tiers: DEFAULT_CASHFLOW.tiers.map((t) => {
      const raw = valueOf(RATE_KEYS[t.key]);
      const n = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(n) && n !== t.ratePercent) {
        console.log(`   tier ${t.key}: Settings override ${n}% carried into v1 (the manual says ${t.ratePercent}%)`);
        return { ...t, ratePercent: n };
      }
      return t;
    }),
  };
  const violations = validateStructure(structure);
  for (const v of violations) console.log(`   ${v.severity.toUpperCase()} ${v.code}: ${v.message}`);
  if (hasErrors(violations)) throw new Error("Version 1 does not pass its own rules; fix cashflow-default.ts");

  const existing = await db.cashflowVersion.findMany({ orderBy: { versionNumber: "asc" }, select: { id: true, versionNumber: true, effectiveTo: true, structure: true } });
  let versionId = existing[0]?.id ?? null;
  if (existing.length) {
    console.log(`\n1. Cashflow versions: ${existing.length} already published (active: v${existing.find((v) => v.effectiveTo == null)?.versionNumber ?? "?"}); nothing to create`);
    const same = canonicalHash(existing[0].structure as unknown as CashflowStructure) === canonicalHash(structure);
    if (!same) console.log(`   note: v1 differs from today's default in ${diffStructures(existing[0].structure as unknown as CashflowStructure, structure).length} place(s); versions are never rewritten`);
  } else {
    const earliest = await db.project.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    const effectiveFrom = earliest?.createdAt ?? new Date();
    console.log(`\n1. Cashflow version 1 will be published, effective from ${effectiveFrom.toISOString()} (the earliest project)`);
    if (apply) {
      const row = await db.cashflowVersion.create({
        data: {
          versionNumber: 1,
          structure: structure as never,
          structureHash: canonicalHash(structure),
          diff: [] as never,
          effectiveFrom,
          createdById: "seed",
          changeReason: "EduCraft Cashflow & Commission Structure v2.0 (the manual), published by the seed",
        },
        select: { id: true },
      });
      versionId = row.id;
      await db.cashflowAuditLog.create({
        data: { actorUserId: "seed", action: "published_version", entityType: "CashflowVersion", entityId: row.id, afterJson: structure as never, reason: "Seed: the manual's numbers" },
      });
    }
  }

  // 2. Stamp projects created before the version existed with v1 (their rates were frozen under it).
  const unstamped = await db.project.count({ where: { cashflowVersionId: null } });
  console.log(`\n2. Projects without a version: ${unstamped}${unstamped ? " → stamped with v1" : ""}`);
  if (apply && unstamped && versionId) {
    await db.project.updateMany({ where: { cashflowVersionId: null }, data: { cashflowVersionId: versionId } });
  }

  // 3. The retired Setting keys.
  console.log(`\n3. Retired Setting rows: ${settings.length} (${settings.map((s) => s.key).join(", ") || "none"})${settings.length ? " → deleted" : ""}`);
  if (apply && settings.length) await db.setting.deleteMany({ where: { key: { in: RETIRED_KEYS } } });

  console.log(apply ? "\nDone." : "\nDry run complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
