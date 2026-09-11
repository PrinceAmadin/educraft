/**
 * One-time legacy data import — Day 19 of the build roadmap.
 *
 * Run with:  npm run migrate:legacy
 *
 * Reads CSV files from DATA/migration/ (untracked — that folder holds the
 * founder's own business documents, never committed) and imports:
 *   - DATA/migration/ambassadors.csv
 *   - DATA/migration/clients.csv
 *   - DATA/migration/projects.csv
 *
 * Any file that doesn't exist is skipped with a note — none of the three are
 * required, so this runs safely with just one or two of them present.
 * Idempotent: re-running after fixing a bad row does not create duplicates,
 * matched by phone (ambassadors/clients) or by client+title (projects).
 *
 * ── CSV FORMATS ──────────────────────────────────────────────────────────
 *
 * ambassadors.csv — from the old Ambassador Panel
 *   fullName*, phone*, universityAbbreviation*, email, department, level,
 *   referralCode, tier, status, bankName, accountNumber, accountName
 *   - universityAbbreviation must match an existing University.abbreviation
 *     (see /admin/ambassadors/schools for the list). Row is skipped if not.
 *   - referralCode: kept as-is if given and free; auto-generated otherwise.
 *   - tier: BRONZE | SILVER | GOLD | PLATINUM (default BRONZE).
 *   - status: defaults to "Active".
 *
 * clients.csv
 *   fullName*, phone*, universityAbbreviation*, faculty*, department*, level*,
 *   email, referredByReferralCode
 *   - referredByReferralCode links to an ambassador (imported above or
 *     already in the database) by their referral code.
 *
 * projects.csv — final-state snapshot, not full pipeline history
 *   clientPhone*, serviceCode*, price*, status*, projectTitle,
 *   workerCode, ambassadorReferralCode, createdAt, deliveryDate
 *   - clientPhone must match a client already imported or already in the
 *     database. serviceCode must match an existing Service.serviceCode.
 *   - status is any ProjectStatus value (e.g. COMPLETED, DELIVERED).
 *   - Only a snapshot lands, not the 17-state history the app would log for
 *     a project it ran itself: one ProjectStatusLog entry is written
 *     (NEW -> status) noting the migration, and downpayment/balance are
 *     marked Verified so the record behaves like any other settled project
 *     everywhere the app reads that field (finance dashboard, reports).
 *   - createdAt / deliveryDate: YYYY-MM-DD, both optional.
 *
 * All monetary splits (downpayment %, worker 40%, ambassador tier rate) use
 * the same shipped defaults as the rest of the app — Settings overrides
 * saved through /admin/settings only affect projects created going forward.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient, type AmbassadorTier, type ProjectStatus } from "@prisma/client";

const db = new PrismaClient();

const MIGRATION_DIR = join(process.cwd(), "DATA", "migration");
const DOWNPAYMENT_PCT = 45;
const WORKER_RATE = 40;
const TIER_RATE: Record<AmbassadorTier, number> = { BRONZE: 10, SILVER: 12, GOLD: 15, PLATINUM: 15 };
const TIER_VALUES: AmbassadorTier[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

function naira(n: number): number {
  return Math.round(n);
}

function readCsv(filename: string): Record<string, string>[] | null {
  const path = join(MIGRATION_DIR, filename);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
}

async function nextId(kind: "CLIENT" | "WORKER" | "AMBASSADOR" | "PROJECT"): Promise<string> {
  const prefix = { CLIENT: "EC-C", WORKER: "EC-W", AMBASSADOR: "EC-A", PROJECT: "EC" }[kind];
  const counts = {
    CLIENT: () => db.client.count(),
    WORKER: () => db.worker.count(),
    AMBASSADOR: () => db.ambassador.count(),
    PROJECT: () => db.project.count(),
  };
  const exists = {
    CLIENT: (id: string) => db.client.count({ where: { clientId: id } }),
    WORKER: (id: string) => db.worker.count({ where: { workerId: id } }),
    AMBASSADOR: (id: string) => db.ambassador.count({ where: { ambassadorId: id } }),
    PROJECT: (id: string) => db.project.count({ where: { projectId: id } }),
  };
  const count = await counts[kind]();
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${prefix}-${String(count + 1 + attempt).padStart(5, "0")}`;
    if ((await exists[kind](candidate)) === 0) return candidate;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

function generateReferralCode(fullName: string): string {
  const stem = fullName.replace(/[^a-zA-Z]/g, "").slice(0, 6).toUpperCase() || "AMB";
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${stem}-${suffix}`;
}

interface Tally {
  imported: number;
  skipped: { row: number; reason: string }[];
}

async function importAmbassadors(): Promise<Tally> {
  const rows = readCsv("ambassadors.csv");
  const tally: Tally = { imported: 0, skipped: [] };
  if (!rows) return tally;

  const universities = await db.university.findMany({ select: { id: true, abbreviation: true } });
  const uniByAbbrev = new Map(universities.map((u) => [u.abbreviation.toUpperCase(), u.id]));

  for (const [i, row] of rows.entries()) {
    const n = i + 2; // +2: header row + 1-indexing, matches what a spreadsheet shows
    const fullName = row.fullName?.trim();
    const phone = row.phone?.trim();
    const universityAbbrev = row.universityAbbreviation?.trim().toUpperCase();

    if (!fullName || !phone || !universityAbbrev) {
      tally.skipped.push({ row: n, reason: "missing fullName, phone, or universityAbbreviation" });
      continue;
    }
    const universityId = uniByAbbrev.get(universityAbbrev);
    if (!universityId) {
      tally.skipped.push({ row: n, reason: `no university matches "${row.universityAbbreviation}"` });
      continue;
    }
    if (await db.ambassador.findFirst({ where: { phone } })) {
      tally.skipped.push({ row: n, reason: `already imported (phone ${phone})` });
      continue;
    }

    const tier = TIER_VALUES.includes(row.tier?.trim().toUpperCase() as AmbassadorTier)
      ? (row.tier.trim().toUpperCase() as AmbassadorTier)
      : "BRONZE";

    let referralCode = row.referralCode?.trim().toUpperCase();
    if (referralCode) {
      if (await db.ambassador.findUnique({ where: { referralCode } })) {
        tally.skipped.push({ row: n, reason: `referral code "${referralCode}" already in use` });
        continue;
      }
    } else {
      do {
        referralCode = generateReferralCode(fullName);
      } while (await db.ambassador.findUnique({ where: { referralCode } }));
    }

    const ambassadorId = await nextId("AMBASSADOR");
    await db.ambassador.create({
      data: {
        ambassadorId,
        fullName,
        phone,
        email: row.email?.trim() || null,
        universityId,
        department: row.department?.trim() || null,
        level: row.level?.trim() || null,
        referralCode,
        tier,
        status: row.status?.trim() || "Active",
        bankName: row.bankName?.trim() || null,
        accountNumber: row.accountNumber?.trim() || null,
        accountName: row.accountName?.trim() || null,
      },
    });
    tally.imported++;
  }
  return tally;
}

async function importClients(): Promise<Tally> {
  const rows = readCsv("clients.csv");
  const tally: Tally = { imported: 0, skipped: [] };
  if (!rows) return tally;

  const universities = await db.university.findMany({ select: { id: true, abbreviation: true } });
  const uniByAbbrev = new Map(universities.map((u) => [u.abbreviation.toUpperCase(), u.id]));

  for (const [i, row] of rows.entries()) {
    const n = i + 2;
    const fullName = row.fullName?.trim();
    const phone = row.phone?.trim();
    const universityAbbrev = row.universityAbbreviation?.trim().toUpperCase();
    const faculty = row.faculty?.trim();
    const department = row.department?.trim();
    const level = row.level?.trim();

    if (!fullName || !phone || !universityAbbrev || !faculty || !department || !level) {
      tally.skipped.push({
        row: n,
        reason: "missing one of fullName, phone, universityAbbreviation, faculty, department, level",
      });
      continue;
    }
    const universityId = uniByAbbrev.get(universityAbbrev);
    if (!universityId) {
      tally.skipped.push({ row: n, reason: `no university matches "${row.universityAbbreviation}"` });
      continue;
    }
    if (await db.client.findFirst({ where: { phone } })) {
      tally.skipped.push({ row: n, reason: `already imported (phone ${phone})` });
      continue;
    }

    let referredById: string | null = null;
    let referralCodeUsed: string | null = null;
    const refCode = row.referredByReferralCode?.trim().toUpperCase();
    if (refCode) {
      const ambassador = await db.ambassador.findUnique({ where: { referralCode: refCode } });
      if (ambassador) {
        referredById = ambassador.id;
        referralCodeUsed = refCode;
      } else {
        tally.skipped.push({
          row: n,
          reason: `referral code "${refCode}" not found — imported without a referrer`,
        });
        // Not fatal — the client still gets created, just unreferred.
      }
    }

    const clientId = await nextId("CLIENT");
    await db.client.create({
      data: {
        clientId,
        fullName,
        phone,
        email: row.email?.trim() || null,
        universityId,
        faculty,
        department,
        level,
        referredById,
        referralCodeUsed,
      },
    });
    tally.imported++;
  }
  return tally;
}

async function importProjects(): Promise<Tally> {
  const rows = readCsv("projects.csv");
  const tally: Tally = { imported: 0, skipped: [] };
  if (!rows) return tally;

  const services = await db.service.findMany({ select: { id: true, serviceCode: true, downpaymentPercentage: true } });
  const svcByCode = new Map(services.map((s) => [s.serviceCode.toUpperCase(), s]));
  const statusValues: ProjectStatus[] = [
    "NEW", "DOWNPAYMENT_VERIFIED", "REQUIREMENTS_CONFIRMED", "ASSIGNED", "IN_PROGRESS",
    "AWAITING_CLIENT_INPUT", "SUBMITTED", "IN_QA_REVIEW", "REVISION_NEEDED", "APPROVED",
    "BALANCE_VERIFIED", "DELIVERED", "SUPERVISOR_CORRECTIONS", "COMPLETED", "ON_HOLD",
    "CANCELLED", "REFUNDED", "DISPUTED",
  ];

  for (const [i, row] of rows.entries()) {
    const n = i + 2;
    const clientPhone = row.clientPhone?.trim();
    const serviceCode = row.serviceCode?.trim().toUpperCase();
    const price = Number(row.price);
    const status = row.status?.trim().toUpperCase() as ProjectStatus;

    if (!clientPhone || !serviceCode || !Number.isFinite(price) || price <= 0 || !statusValues.includes(status)) {
      tally.skipped.push({
        row: n,
        reason: "missing/invalid clientPhone, serviceCode, price, or status",
      });
      continue;
    }
    const client = await db.client.findFirst({ where: { phone: clientPhone } });
    if (!client) {
      tally.skipped.push({ row: n, reason: `no client found with phone ${clientPhone} — import clients first` });
      continue;
    }
    const service = svcByCode.get(serviceCode);
    if (!service) {
      tally.skipped.push({ row: n, reason: `no service matches "${row.serviceCode}"` });
      continue;
    }
    const projectTitle = row.projectTitle?.trim() || null;
    if (
      await db.project.findFirst({
        where: { clientId: client.id, serviceId: service.id, projectTitle: projectTitle ?? undefined },
      })
    ) {
      tally.skipped.push({ row: n, reason: "a matching project for this client already exists" });
      continue;
    }

    let workerId: string | null = null;
    if (row.workerCode?.trim()) {
      const worker = await db.worker.findUnique({ where: { workerId: row.workerCode.trim().toUpperCase() } });
      if (worker) workerId = worker.id;
      else tally.skipped.push({ row: n, reason: `worker "${row.workerCode}" not found — imported unassigned` });
    }

    let ambassadorId: string | null = null;
    let ambassadorCommRate: number | null = null;
    if (row.ambassadorReferralCode?.trim()) {
      const ambassador = await db.ambassador.findUnique({
        where: { referralCode: row.ambassadorReferralCode.trim().toUpperCase() },
      });
      if (ambassador) {
        ambassadorId = ambassador.id;
        ambassadorCommRate = TIER_RATE[ambassador.tier];
      }
    }

    const downpaymentAmount = naira((price * (service.downpaymentPercentage || DOWNPAYMENT_PCT)) / 100);
    const balanceAmount = price - downpaymentAmount;
    const workerPayout = naira((price * WORKER_RATE) / 100);
    const ambassadorCommission = ambassadorCommRate != null ? naira((price * ambassadorCommRate) / 100) : null;
    const educraftRevenue = price - workerPayout - (ambassadorCommission ?? 0);
    const createdAt = row.createdAt?.trim() ? new Date(`${row.createdAt.trim()}T00:00:00.000Z`) : new Date();
    const deliveryDate = row.deliveryDate?.trim() ? new Date(`${row.deliveryDate.trim()}T00:00:00.000Z`) : null;

    const projectId = await nextId("PROJECT");
    const created = await db.project.create({
      data: {
        projectId,
        clientId: client.id,
        serviceId: service.id,
        status,
        projectTitle,
        price,
        downpaymentAmount,
        downpaymentStatus: "Verified",
        downpaymentDate: createdAt,
        balanceAmount,
        balanceStatus: status === "NEW" || status === "DOWNPAYMENT_VERIFIED" ? "Unpaid" : "Verified",
        balanceDate: status === "NEW" || status === "DOWNPAYMENT_VERIFIED" ? null : deliveryDate ?? createdAt,
        workerId,
        ambassadorId,
        ambassadorCommRate,
        ambassadorCommission,
        ambassadorCommPaid: false,
        workerPayout,
        workerPayoutPaid: false,
        educraftRevenue,
        deliveryDate,
        internalNotes: "Imported from the legacy system — final-state snapshot only, no pipeline history.",
        createdAt,
      },
      select: { id: true },
    });
    await db.projectStatusLog.create({
      data: {
        projectId: created.id,
        fromStatus: "NEW",
        toStatus: status,
        notes: "Migrated from legacy system",
        createdAt,
      },
    });
    tally.imported++;
  }
  return tally;
}

function report(name: string, tally: Tally, ranAtAll: boolean) {
  if (!ranAtAll) {
    console.log(`\n${name}: no file found, skipped.`);
    return;
  }
  console.log(`\n${name}: imported ${tally.imported}, skipped ${tally.skipped.length}`);
  for (const s of tally.skipped) console.log(`  row ${s.row}: ${s.reason}`);
}

async function main() {
  console.log(`Reading from ${MIGRATION_DIR}`);

  const hasAmbassadors = existsSync(join(MIGRATION_DIR, "ambassadors.csv"));
  const ambassadors = await importAmbassadors();
  report("Ambassadors", ambassadors, hasAmbassadors);

  const hasClients = existsSync(join(MIGRATION_DIR, "clients.csv"));
  const clients = await importClients();
  report("Clients", clients, hasClients);

  const hasProjects = existsSync(join(MIGRATION_DIR, "projects.csv"));
  const projects = await importProjects();
  report("Projects", projects, hasProjects);

  if (!hasAmbassadors && !hasClients && !hasProjects) {
    console.log(
      `\nNothing to import — place ambassadors.csv / clients.csv / projects.csv in DATA/migration/ ` +
        `(see the format documented at the top of scripts/migrate-legacy-data.ts) and run again.`
    );
  }
  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
