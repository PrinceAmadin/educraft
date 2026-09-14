/**
 * One-time migration — folds the standalone Ambassador Panel's Redis data
 * into HQ's own Ambassador / AmbassadorApplication tables so it is no longer
 * a second, disconnected source of truth.
 *
 * Run with:  npx dotenv -e .env.local -- tsx scripts/migrate-ambassador-panel.ts
 *
 * Reads directly from Redis (REDIS_URL) — no CSV, no manual export:
 *   - `approved_ids`             every slot with an active profile:{id}
 *   - `approved_application_ids` the subset that also has a full original
 *                                 application (bank details, phone, both
 *                                 university fields) under application:{id}
 *                                 and a payment:{id} record
 *
 * For each approved id:
 *   - Phone is optional: the old self-registration form never asked for one,
 *     so a missing phone is left blank — never invented.
 *   - Skipped, with a reason, if no University row matches the school.
 *   - Matched to an existing Ambassador by old slot id (legacySlotId), then
 *     phone, then email — safe to re-run.
 *   - Otherwise creates an Ambassador (fresh referral code, tier BRONZE —
 *     conversions start counting from zero in the new system) and, for the
 *     13 with a full application, a matching AmbassadorApplication row
 *     (status APPROVED) so the admin history traces back to something.
 *
 * Historical click/order counts (clicks:{id}, orders:{id}) are printed for
 * the record but never written anywhere — they are unverified counters with
 * no linked Project or Payment, and inventing financial records for them
 * would misstate the ledger. If any of that history should become real
 * revenue, add it as an actual Project by hand.
 */
import { createClient } from "redis";
import { PrismaClient, type Prisma } from "@prisma/client";

const db = new PrismaClient();

/**
 * Universities the application records reference but HQ hadn't seeded yet —
 * both real, verified against the applicant's typed-out full name.
 */
const MISSING_UNIVERSITIES: {
  abbreviation: string;
  name: string;
  type: Prisma.UniversityCreateInput["type"];
  state: string;
  region: Prisma.UniversityCreateInput["region"];
}[] = [
  { abbreviation: "IUO", name: "Igbinedion University, Okada", type: "PRIVATE", state: "Edo", region: "SOUTH_SOUTH" },
  { abbreviation: "UNIDEL", name: "University of Delta, Agbor", type: "STATE", state: "Delta", region: "SOUTH_SOUTH" },
];

/**
 * Verified by hand against each record's `universityFull` text — the
 * abbreviation actually on file was a typo or guess in every case (e.g.
 * "ESUI" / "EDSU" for Edo University Iyamho, already seeded as "EUI").
 * Keyed by slot id rather than the bad abbreviation, so nothing else can
 * accidentally match it.
 */
const UNIVERSITY_OVERRIDE: Record<string, string> = {
  "017": "EUI",
  "019": "EUI",
  "020": "EUI",
  "049": "EUI",
  "052": "EUI",
  "053": "EUI",
  "054": "EUI",
  "056": "EUI",
  "058": "EUI",
  "055": "IUO",
  "057": "UNIDEL",
};

/**
 * School spellings on profile-only records (no typed-out full name to check
 * against). The original app's own SCHOOL table maps EUI to "Edo State
 * University", so these are its spellings of Edo University Iyamho. "SDU" is
 * deliberately absent — ambiguous, left for the founder.
 */
const SCHOOL_ALIASES: Record<string, string> = {
  ESUI: "EUI",
  EDSU: "EUI",
  "EDO STATE UNIVERSITY": "EUI",
};

function generateReferralCode(fullName: string): string {
  const stem = fullName.replace(/[^a-zA-Z]/g, "").slice(0, 6).toUpperCase() || "AMB";
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${stem}-${suffix}`;
}

async function nextAmbassadorId(): Promise<string> {
  const count = await db.ambassador.count();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `EC-A-${String(count + 1 + attempt).padStart(5, "0")}`;
    if ((await db.ambassador.count({ where: { ambassadorId: candidate } })) === 0) return candidate;
  }
  return `EC-A-${Date.now().toString().slice(-6)}`;
}

interface Profile {
  slotId?: string;
  name?: string;
  school?: string;
  email?: string;
  registeredAt?: string;
}
interface PaymentRecord {
  name?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  email?: string;
  phone?: string;
  universityFull?: string;
  universityAbbr?: string;
  approvedAt?: string;
}
interface RedisApplication {
  submittedAt?: string;
  universityFull?: string;
}

type Row = { id: string; reason?: string };

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("REDIS_URL is not set — nothing to migrate from.");
    process.exit(1);
  }

  const redis = createClient({ url: redisUrl });
  redis.on("error", () => {});
  await redis.connect();

  const [approvedIds, appIds] = await Promise.all([
    redis.sMembers("approved_ids"),
    redis.sMembers("approved_application_ids"),
  ]);
  const hasFullApplication = new Set(appIds);

  for (const u of MISSING_UNIVERSITIES) {
    const existing = await db.university.findUnique({ where: { abbreviation: u.abbreviation } });
    if (!existing) {
      await db.university.create({ data: u });
      console.log(`Seeded missing university: ${u.name} (${u.abbreviation})`);
    }
  }

  const universities = await db.university.findMany({ select: { id: true, abbreviation: true } });
  const uniByAbbrev = new Map(universities.map((u) => [u.abbreviation.toUpperCase(), u.id]));

  const imported: string[] = [];
  const skipped: Row[] = [];
  const legacyStats: { id: string; name: string; clicks: number; orders: number }[] = [];

  for (const id of approvedIds.sort()) {
    const [profileStr, paymentStr, clicksStr, ordersStr] = await Promise.all([
      redis.get(`profile:${id}`),
      redis.get(`payment:${id}`),
      redis.get(`clicks:${id}`),
      redis.get(`orders:${id}`),
    ]);
    if (!profileStr) {
      skipped.push({ id, reason: "no profile:{id} in Redis" });
      continue;
    }
    const profile = JSON.parse(profileStr) as Profile;
    const payment = paymentStr ? (JSON.parse(paymentStr) as PaymentRecord) : null;

    const fullName = (payment?.name || profile.name || "").trim();
    const phone = (payment?.phone || "").trim() || null;
    const email = (payment?.email || profile.email || "").trim() || null;
    const rawSchool = (payment?.universityAbbr || profile.school || "").trim().toUpperCase();
    const abbrev = UNIVERSITY_OVERRIDE[id] ?? SCHOOL_ALIASES[rawSchool] ?? rawSchool;

    legacyStats.push({
      id,
      name: fullName || id,
      clicks: parseInt(clicksStr ?? "0", 10) || 0,
      orders: parseInt(ordersStr ?? "0", 10) || 0,
    });

    if (!fullName) {
      skipped.push({ id, reason: "no name on file" });
      continue;
    }
    const universityId = uniByAbbrev.get(abbrev);
    if (!universityId) {
      skipped.push({ id, reason: `no university matches "${abbrev || "(blank)"}" for "${fullName}"` });
      continue;
    }
    // Idempotent: match the old slot id first, then phone, then email. A match
    // doesn't just skip — a prior run may have been interrupted before the
    // matching application row, so it falls through to that check below.
    const pick = { id: true, ambassadorId: true, legacySlotId: true } as const;
    let ambassador =
      (await db.ambassador.findUnique({ where: { legacySlotId: id }, select: pick })) ??
      (phone ? await db.ambassador.findFirst({ where: { phone }, select: pick }) : null) ??
      (email ? await db.ambassador.findFirst({ where: { email, legacySlotId: null }, select: pick }) : null);
    let isNew = false;
    if (ambassador && !ambassador.legacySlotId) {
      ambassador = await db.ambassador.update({
        where: { id: ambassador.id },
        data: { legacySlotId: id },
        select: pick,
      });
    }

    if (!ambassador) {
      let referralCode = generateReferralCode(fullName);
      while (await db.ambassador.findUnique({ where: { referralCode } })) {
        referralCode = generateReferralCode(fullName);
      }
      const ambassadorId = await nextAmbassadorId();
      ambassador = await db.ambassador.create({
        data: {
          ambassadorId,
          legacySlotId: id,
          fullName,
          phone,
          email,
          universityId,
          referralCode,
          tier: "BRONZE",
          status: "Active",
          bankName: payment?.bankName?.trim() || null,
          accountNumber: payment?.accountNumber?.trim() || null,
          accountName: payment?.accountName?.trim() || null,
        },
        select: pick,
      });
      isNew = true;
      imported.push(`${id} → ${ambassadorId} (${fullName}, ${referralCode})`);
    } else {
      skipped.push({ id, reason: `already migrated as ${ambassador.ambassadorId}` });
    }

    if (hasFullApplication.has(id)) {
      const existingApp = await db.ambassadorApplication.findUnique({
        where: { ambassadorId: ambassador.id },
        select: { id: true },
      });
      if (!existingApp) {
        const appStr = await redis.get(`application:${id}`);
        const app = appStr ? (JSON.parse(appStr) as RedisApplication) : null;
        const submittedAt = app?.submittedAt ? new Date(app.submittedAt) : new Date();
        const reviewedAt = payment?.approvedAt ? new Date(payment.approvedAt) : submittedAt;
        const data: Prisma.AmbassadorApplicationCreateInput = {
          fullName,
          phone: phone ?? "",
          email,
          university: { connect: { id: universityId } },
          bankName: payment?.bankName?.trim() || null,
          accountNumber: payment?.accountNumber?.trim() || null,
          accountName: payment?.accountName?.trim() || null,
          status: "APPROVED",
          reviewNote: `Migrated from the legacy Ambassador Panel (Redis slot ${id}).`,
          reviewedAt,
          createdAt: submittedAt,
          ambassadorId: ambassador.id,
        };
        await db.ambassadorApplication.create({ data });
        if (!isNew) imported.push(`${id} → completed the missing application row for ${ambassador.ambassadorId}`);
      }
    }
  }

  await redis.disconnect();

  console.log(`\nImported ${imported.length} ambassador(s):`);
  for (const line of imported) console.log(`  ${line}`);

  console.log(`\nSkipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  ${s.id}: ${s.reason}`);

  console.log(`\nLegacy click/order counts (not written anywhere — informational only):`);
  for (const s of legacyStats) console.log(`  ${s.id} (${s.name}): ${s.clicks} clicks, ${s.orders} logged orders`);

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
