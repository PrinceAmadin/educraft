/**
 * Service catalogue sync — brings the live Service table in line with
 * prisma/catalogue.ts (the flyer price list).
 *
 *   npm run catalogue:sync               dry run: prints the diff, writes nothing
 *   npm run catalogue:sync -- --apply    writes the diff in one transaction
 *
 * What it touches:
 *   - every service named in the catalogue (created if missing, updated if it
 *     differs, reactivated if it was switched off)
 *   - the codes in RETIRED_SERVICE_CODES, which are deactivated — never
 *     deleted, because existing projects reference them
 *
 * What it leaves alone: any service an admin created in Settings that is not
 * in the catalogue, and the variants of a service whose catalogue entry does
 * not list variants. Variants are matched by name and updated in place (never
 * deleted), because projects store `serviceVariantId`.
 */
import { PricingModel, PrismaClient, type Prisma } from "@prisma/client";
import {
  RETIRED_SERVICE_CODES,
  SERVICE_CATALOGUE,
  type CatalogueService,
} from "../prisma/catalogue";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type ServiceRow = Prisma.ServiceGetPayload<{ include: { variants: true } }>;

interface Change {
  field: string;
  from: string;
  to: string;
}

interface Plan {
  target: CatalogueService;
  sortOrder: number;
  row: ServiceRow | null;
  changes: Change[];
  reorderOnly: boolean;
}

const naira = (n: number | null | undefined) =>
  n == null ? "—" : `₦${n.toLocaleString("en-NG")}`;
const text = (v: unknown) => (v == null || v === "" ? "—" : String(v));

function fieldChanges(row: ServiceRow, target: CatalogueService): Change[] {
  const out: Change[] = [];
  const compare = (field: string, from: unknown, to: unknown, show: (v: unknown) => string = text) => {
    if ((from ?? null) !== (to ?? null)) out.push({ field, from: show(from), to: show(to) });
  };

  compare("name", row.serviceName, target.serviceName);
  compare("category", row.category, target.category);
  compare("price", row.basePrice, target.basePrice, (v) => naira(v as number));
  compare("pricing", row.pricingModel, target.pricingModel ?? PricingModel.FIXED);
  compare("template", row.intakeFormTemplate, target.intakeFormTemplate);
  compare("days", row.estimatedDays, target.estimatedDays);
  if (target.description !== undefined) compare("description", row.description, target.description);
  if (target.expressDeliverySurcharge !== undefined) {
    compare("express", row.expressDeliverySurcharge, target.expressDeliverySurcharge, (v) =>
      naira(v as number | null)
    );
  }
  if (!row.isActive) out.push({ field: "active", from: "no", to: "yes" });
  return out;
}

function variantChanges(row: ServiceRow, target: CatalogueService): Change[] {
  if (target.variants === undefined) return [];
  const want = target.variants;
  const have = row.variants.filter((v) => v.isActive);
  const out: Change[] = [];

  for (const w of want) {
    const h = have.find((v) => v.name === w.name);
    if (!h) out.push({ field: `option "${w.name}"`, from: "—", to: `+${naira(w.priceAddon)}` });
    else if (h.priceAddon !== w.priceAddon) {
      out.push({ field: `option "${w.name}"`, from: `+${naira(h.priceAddon)}`, to: `+${naira(w.priceAddon)}` });
    }
  }
  for (const h of have) {
    if (!want.some((w) => w.name === h.name)) {
      out.push({ field: `option "${h.name}"`, from: `+${naira(h.priceAddon)}`, to: "switched off" });
    }
  }
  return out;
}

async function main() {
  const rows = await db.service.findMany({
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  const byCode = new Map(rows.map((r) => [r.serviceCode, r]));

  const plans: Plan[] = SERVICE_CATALOGUE.map((target, sortOrder) => {
    const row = byCode.get(target.serviceCode) ?? null;
    if (!row) return { target, sortOrder, row, changes: [], reorderOnly: false };
    const changes = [...fieldChanges(row, target), ...variantChanges(row, target)];
    return { target, sortOrder, row, changes, reorderOnly: changes.length === 0 && row.sortOrder !== sortOrder };
  });

  const creates = plans.filter((p) => !p.row);
  const updates = plans.filter((p) => p.row && p.changes.length > 0);
  const reorders = plans.filter((p) => p.reorderOnly);
  const unchanged = plans.filter((p) => p.row && p.changes.length === 0 && !p.reorderOnly);
  const retires = rows.filter((r) => r.isActive && (RETIRED_SERVICE_CODES as readonly string[]).includes(r.serviceCode));
  const catalogueCodes = new Set(SERVICE_CATALOGUE.map((s) => s.serviceCode));
  const untouched = rows.filter(
    (r) => !catalogueCodes.has(r.serviceCode) && !(RETIRED_SERVICE_CODES as readonly string[]).includes(r.serviceCode)
  );

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\nEduCraft service catalogue — ${APPLY ? "APPLYING" : "dry run (nothing written)"}\n`);

  console.log(`New services (${creates.length})`);
  for (const p of creates) {
    const opts = p.target.variants?.map((v) => `${v.name} +${naira(v.priceAddon)}`).join(", ");
    // Percentage-priced services carry their rate in the description.
    const price =
      p.target.basePrice === 0 && p.target.description
        ? (p.target.description.match(/\d+(?:\.\d+)?\s?%/)?.[0] ?? "quoted") + " of cost"
        : `${p.target.pricingModel === PricingModel.VARIABLE ? "from " : ""}${naira(p.target.basePrice)}`;
    console.log(`  + ${pad(p.target.serviceCode, 12)} ${pad(p.target.serviceName, 44)} ${price}${opts ? `  (${opts})` : ""}`);
  }

  console.log(`\nChanged (${updates.length})`);
  for (const p of updates) {
    console.log(`  ~ ${pad(p.target.serviceCode, 12)} ${p.target.serviceName}`);
    for (const c of p.changes) console.log(`      ${pad(c.field, 26)} ${c.from}  →  ${c.to}`);
  }

  console.log(`\nDeactivated (${retires.length})`);
  for (const r of retires) console.log(`  - ${pad(r.serviceCode, 12)} ${r.serviceName}`);

  console.log(`\nUnchanged ${unchanged.length} · display order only ${reorders.length}`);
  if (untouched.length) {
    console.log(`Left alone — not in the catalogue: ${untouched.map((r) => r.serviceCode).join(", ")}`);
  }

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with `npm run catalogue:sync -- --apply` to write these changes.\n");
    return;
  }

  const toWrite = [...creates, ...updates, ...reorders];
  await db.$transaction(
    async (tx) => {
      for (const p of toWrite) {
        const { variants, ...fields } = p.target;
        const data = {
          ...fields,
          pricingModel: fields.pricingModel ?? PricingModel.FIXED,
          sortOrder: p.sortOrder,
          isActive: true,
        };
        const saved = await tx.service.upsert({
          where: { serviceCode: fields.serviceCode },
          update: data,
          create: { ...data, requiresDownpayment: true, downpaymentPercentage: 45 },
        });

        if (variants) {
          const existing = await tx.serviceVariant.findMany({ where: { serviceId: saved.id } });
          for (const [vi, v] of variants.entries()) {
            const match = existing.find((e) => e.name === v.name);
            if (match) {
              await tx.serviceVariant.update({
                where: { id: match.id },
                data: { priceAddon: v.priceAddon, isActive: true, sortOrder: vi },
              });
            } else {
              await tx.serviceVariant.create({
                data: { serviceId: saved.id, name: v.name, priceAddon: v.priceAddon, sortOrder: vi },
              });
            }
          }
          const stale = existing
            .filter((e) => e.isActive && !variants.some((v) => v.name === e.name))
            .map((e) => e.id);
          if (stale.length) {
            await tx.serviceVariant.updateMany({ where: { id: { in: stale } }, data: { isActive: false } });
          }
        }
      }

      if (retires.length) {
        await tx.service.updateMany({
          where: { id: { in: retires.map((r) => r.id) } },
          data: { isActive: false },
        });
      }
    },
    { timeout: 120_000, maxWait: 15_000 }
  );

  console.log(`\nWritten: ${creates.length} created, ${updates.length} updated, ${reorders.length} reordered, ${retires.length} deactivated.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
