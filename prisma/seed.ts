import { PrismaClient, PricingModel, UniversityType, Region, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SERVICE_CATALOGUE } from "./catalogue";

const db = new PrismaClient();

/* ── SERVICE CATALOGUE ────────────────────────────────────────
   Lives in ./catalogue.ts (the flyer price list) so the seed and
   `npm run catalogue:sync` can never drift apart. */

const SERVICES = SERVICE_CATALOGUE;

/* ── UNIVERSITIES ─────────────────────────────────────────── */

const UNIVERSITIES = [
  { name: "University of Benin", abbreviation: "UNIBEN", type: UniversityType.FEDERAL, state: "Edo", region: Region.SOUTH_SOUTH },
  { name: "Edo University Iyamho", abbreviation: "EUI", type: UniversityType.STATE, state: "Edo", region: Region.SOUTH_SOUTH },
  { name: "Benson Idahosa University", abbreviation: "BIU", type: UniversityType.PRIVATE, state: "Edo", region: Region.SOUTH_SOUTH },
  { name: "University of Lagos", abbreviation: "UNILAG", type: UniversityType.FEDERAL, state: "Lagos", region: Region.SOUTH_WEST },
  { name: "University of Ibadan", abbreviation: "UI", type: UniversityType.FEDERAL, state: "Oyo", region: Region.SOUTH_WEST },
  { name: "Obafemi Awolowo University", abbreviation: "OAU", type: UniversityType.FEDERAL, state: "Osun", region: Region.SOUTH_WEST },
  { name: "Afe Babalola University", abbreviation: "ABUAD", type: UniversityType.PRIVATE, state: "Ekiti", region: Region.SOUTH_WEST },
  { name: "University of Nigeria, Nsukka", abbreviation: "UNN", type: UniversityType.FEDERAL, state: "Enugu", region: Region.SOUTH_EAST },
  { name: "Nnamdi Azikiwe University", abbreviation: "UNIZIK", type: UniversityType.FEDERAL, state: "Anambra", region: Region.SOUTH_EAST },
  { name: "University of Port Harcourt", abbreviation: "UNIPORT", type: UniversityType.FEDERAL, state: "Rivers", region: Region.SOUTH_SOUTH },
  { name: "Delta State University", abbreviation: "DELSU", type: UniversityType.STATE, state: "Delta", region: Region.SOUTH_SOUTH },
  { name: "Ambrose Alli University", abbreviation: "AAU", type: UniversityType.STATE, state: "Edo", region: Region.SOUTH_SOUTH },
  { name: "Federal University of Petroleum Resources", abbreviation: "FUPRE", type: UniversityType.FEDERAL, state: "Delta", region: Region.SOUTH_SOUTH },
  { name: "Ahmadu Bello University", abbreviation: "ABU", type: UniversityType.FEDERAL, state: "Kaduna", region: Region.NORTH_WEST },
  { name: "University of Ilorin", abbreviation: "UNILORIN", type: UniversityType.FEDERAL, state: "Kwara", region: Region.NORTH_CENTRAL },
  { name: "University of Jos", abbreviation: "UNIJOS", type: UniversityType.FEDERAL, state: "Plateau", region: Region.NORTH_CENTRAL },
  { name: "Bayero University Kano", abbreviation: "BUK", type: UniversityType.FEDERAL, state: "Kano", region: Region.NORTH_WEST },
  { name: "University of Maiduguri", abbreviation: "UNIMAID", type: UniversityType.FEDERAL, state: "Borno", region: Region.NORTH_EAST },
  { name: "Covenant University", abbreviation: "CU", type: UniversityType.PRIVATE, state: "Ogun", region: Region.SOUTH_WEST },
  { name: "Babcock University", abbreviation: "BABCOCK", type: UniversityType.PRIVATE, state: "Ogun", region: Region.SOUTH_WEST },
  { name: "Federal University of Technology, Akure", abbreviation: "FUTA", type: UniversityType.FEDERAL, state: "Ondo", region: Region.SOUTH_WEST },
  { name: "Federal University of Technology, Owerri", abbreviation: "FUTO", type: UniversityType.FEDERAL, state: "Imo", region: Region.SOUTH_EAST },
];

/* ── SETTINGS ─────────────────────────────────────────────── */

const SETTINGS: { key: string; value: string }[] = [
  { key: "downpayment_percentage", value: "45" },
  { key: "worker_payout_rate", value: "40" },
  { key: "max_revisions", value: "3" },
  { key: "annual_revenue_target", value: "1000000000" },
  { key: "express_surcharge_general", value: "2000" },
  { key: "express_surcharge_fyp", value: "5000" },
  { key: "auto_complete_days_after_delivery", value: "7" },
  { key: "company_bank_name", value: "" },
  { key: "company_account_number", value: "" },
  { key: "company_account_name", value: "" },
];

async function main() {
  console.log("Seeding EduCraft WorkBase…\n");

  // ── Universities ──
  for (const u of UNIVERSITIES) {
    await db.university.upsert({
      where: { abbreviation: u.abbreviation },
      update: { name: u.name, type: u.type, state: u.state, region: u.region },
      create: { ...u, status: "Active", entryDate: new Date() },
    });
  }
  console.log(`  Universities  ${UNIVERSITIES.length}`);

  // ── Services ──
  for (const [i, s] of SERVICES.entries()) {
    const { variants, ...service } = s;

    const saved = await db.service.upsert({
      where: { serviceCode: service.serviceCode },
      update: {
        serviceName: service.serviceName,
        category: service.category,
        basePrice: service.basePrice,
        pricingModel: service.pricingModel ?? PricingModel.FIXED,
        intakeFormTemplate: service.intakeFormTemplate,
        estimatedDays: service.estimatedDays,
        description: service.description,
        expressDeliverySurcharge: service.expressDeliverySurcharge,
        sortOrder: i,
      },
      create: {
        ...service,
        pricingModel: service.pricingModel ?? PricingModel.FIXED,
        sortOrder: i,
        requiresDownpayment: true,
        downpaymentPercentage: 45,
        isActive: true,
      },
    });

    if (variants?.length) {
      // Projects store `serviceVariantId`, so variants are updated in place by
      // name and never deleted — recreating them would orphan those ids.
      const existing = await db.serviceVariant.findMany({ where: { serviceId: saved.id } });
      for (const [vi, v] of variants.entries()) {
        const match = existing.find((e) => e.name === v.name);
        if (match) {
          await db.serviceVariant.update({
            where: { id: match.id },
            data: { priceAddon: v.priceAddon, isActive: true, sortOrder: vi },
          });
        } else {
          await db.serviceVariant.create({
            data: { serviceId: saved.id, name: v.name, priceAddon: v.priceAddon, sortOrder: vi },
          });
        }
      }
    }
  }
  console.log(`  Services      ${SERVICES.length}`);

  // ── Settings ──
  for (const s of SETTINGS) {
    await db.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`  Settings      ${SETTINGS.length}`);

  // ── Super admin ──
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@educraft.ng").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  // The dashboard greets people by the first word of this name — "Prince
  // Amadin" reads as "Welcome back, Prince". Override per-environment with
  // SEED_ADMIN_NAME when the first admin is somebody else.
  const adminName = process.env.SEED_ADMIN_NAME ?? "Prince Amadin";

  if (!adminPassword) {
    console.log(
      "\n  Admin         skipped — set SEED_ADMIN_PASSWORD in .env to create the first admin"
    );
  } else {
    await db.user.upsert({
      where: { email: adminEmail },
      // Keep the display name in step on re-seed; never touch the password.
      update: { displayName: adminName },
      create: {
        email: adminEmail,
        displayName: adminName,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      },
    });
    console.log(`\n  Admin         ${adminEmail}`);
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
