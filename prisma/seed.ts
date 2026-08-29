import {
  PrismaClient,
  ServiceCategory,
  PricingModel,
  UniversityType,
  Region,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

/* ── SERVICE CATALOGUE (from the EduCraft flyers) ─────────── */

type SeedService = {
  serviceCode: string;
  serviceName: string;
  category: ServiceCategory;
  basePrice: number;
  pricingModel?: PricingModel;
  intakeFormTemplate: string;
  estimatedDays: number;
  description?: string;
  expressDeliverySurcharge?: number;
  variants?: { name: string; priceAddon: number }[];
};

const SERVICES: SeedService[] = [
  // ── Academic writing ──
  {
    serviceCode: "FYP-FULL",
    serviceName: "Final Year Project (Full)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 70000,
    intakeFormTemplate: "academic_fyp",
    estimatedDays: 21,
    description: "Full 5-chapter final year project report.",
    expressDeliverySurcharge: 5000,
    variants: [{ name: "With Data Analysis", priceAddon: 20000 }],
  },
  {
    serviceCode: "FYP-PROP",
    serviceName: "Final Year Project (Proposal Only)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 20000,
    intakeFormTemplate: "academic_fyp_proposal",
    estimatedDays: 7,
    expressDeliverySurcharge: 5000,
  },
  {
    serviceCode: "FYP-CH4",
    serviceName: "Final Year Project (Chapter 4 Only)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 25000,
    intakeFormTemplate: "academic_fyp_chapter",
    estimatedDays: 7,
    expressDeliverySurcharge: 5000,
    variants: [{ name: "With Data Analysis", priceAddon: 6500 }],
  },
  {
    serviceCode: "SEM",
    serviceName: "Seminar Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 25000,
    intakeFormTemplate: "academic_seminar",
    estimatedDays: 10,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "IT-3M",
    serviceName: "IT Report (1–3 Months)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 15000,
    intakeFormTemplate: "academic_it",
    estimatedDays: 7,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "IT-6M",
    serviceName: "IT Report (4–6 Months)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 20000,
    intakeFormTemplate: "academic_it",
    estimatedDays: 10,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "ASSIGN",
    serviceName: "Assignment-Based Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 10000,
    intakeFormTemplate: "academic_termpaper",
    estimatedDays: 5,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "TERM",
    serviceName: "Term Paper",
    category: ServiceCategory.ACADEMIC,
    basePrice: 15000,
    intakeFormTemplate: "academic_termpaper",
    estimatedDays: 7,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "MINI",
    serviceName: "Mini Project Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 15000,
    intakeFormTemplate: "academic_mini",
    estimatedDays: 10,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "CASE",
    serviceName: "Case Study Analysis",
    category: ServiceCategory.ACADEMIC,
    basePrice: 31500,
    intakeFormTemplate: "academic_casestudy",
    estimatedDays: 10,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "THESIS",
    serviceName: "Thesis / Dissertation",
    category: ServiceCategory.ACADEMIC,
    basePrice: 70000,
    intakeFormTemplate: "academic_fyp",
    estimatedDays: 30,
    expressDeliverySurcharge: 5000,
  },
  {
    serviceCode: "ESSAY",
    serviceName: "Essay Writing (Any Kind)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 10000,
    intakeFormTemplate: "academic_essay",
    estimatedDays: 5,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "DATA",
    serviceName: "Data Analysis Only",
    category: ServiceCategory.ACADEMIC,
    basePrice: 20000,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "academic_data",
    estimatedDays: 7,
    expressDeliverySurcharge: 2000,
  },

  // ── Final year combos ──
  {
    serviceCode: "COMBO-PR",
    serviceName: "Proposal + Report (without DA)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 90000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 28,
    expressDeliverySurcharge: 5000,
  },
  {
    serviceCode: "COMBO-PR-DA",
    serviceName: "Proposal + Report (with DA)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 110000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 28,
    expressDeliverySurcharge: 5000,
  },
  {
    serviceCode: "COMBO-RS",
    serviceName: "Report (without DA) + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 85000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 25,
    expressDeliverySurcharge: 5000,
  },
  {
    serviceCode: "COMBO-RS-DA",
    serviceName: "Report (with DA) + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 100000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 25,
    expressDeliverySurcharge: 5000,
  },
  {
    serviceCode: "COMBO-PRDS",
    serviceName: "Proposal + DA Report + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 120000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 30,
    expressDeliverySurcharge: 5000,
  },
  {
    serviceCode: "COMBO-PFRS",
    serviceName: "Proposal + Full Report + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 100000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 30,
    expressDeliverySurcharge: 5000,
  },

  // ── Presentations ──
  {
    serviceCode: "PPT-DESIGN",
    serviceName: "PowerPoint (Design Only)",
    category: ServiceCategory.DESIGN,
    basePrice: 8000,
    intakeFormTemplate: "design_presentation",
    estimatedDays: 3,
    description: "You provide the content, we design the slides.",
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "PPT-FULL",
    serviceName: "PowerPoint (Design + Content)",
    category: ServiceCategory.DESIGN,
    basePrice: 10000,
    intakeFormTemplate: "design_presentation",
    estimatedDays: 4,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "PPT-FYP",
    serviceName: "PowerPoint (FYP Defence Slides)",
    category: ServiceCategory.DESIGN,
    basePrice: 15000,
    intakeFormTemplate: "design_presentation",
    estimatedDays: 5,
    expressDeliverySurcharge: 2000,
  },

  // ── Letters ──
  {
    serviceCode: "LTR-INF",
    serviceName: "Informal Letter",
    category: ServiceCategory.ACADEMIC,
    basePrice: 5000,
    intakeFormTemplate: "letter",
    estimatedDays: 2,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "LTR-APP",
    serviceName: "Application / Cover Letter",
    category: ServiceCategory.CAREER,
    basePrice: 5000,
    intakeFormTemplate: "letter",
    estimatedDays: 2,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "LTR-FORM",
    serviceName: "Formal Letter",
    category: ServiceCategory.ACADEMIC,
    basePrice: 8000,
    intakeFormTemplate: "letter",
    estimatedDays: 2,
    expressDeliverySurcharge: 2000,
  },

  // ── Editing & proofreading ──
  {
    serviceCode: "EDIT-SM",
    serviceName: "Editing (Less than 50 pages)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 0,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "editing",
    estimatedDays: 4,
    description: "Priced at 20% of the original project cost.",
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "EDIT-LG",
    serviceName: "Editing (50+ pages)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 0,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "editing",
    estimatedDays: 6,
    description: "Priced at 25% of the original project cost.",
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "EDIT-IT",
    serviceName: "Editing + IT / Seminar Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 8000,
    intakeFormTemplate: "editing",
    estimatedDays: 4,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "FORMAT",
    serviceName: "Formatting Only",
    category: ServiceCategory.ACADEMIC,
    basePrice: 5000,
    intakeFormTemplate: "editing",
    estimatedDays: 3,
    expressDeliverySurcharge: 2000,
  },

  // ── Career ──
  {
    serviceCode: "CV",
    serviceName: "CV / Resume",
    category: ServiceCategory.CAREER,
    basePrice: 10000,
    intakeFormTemplate: "career_cv",
    estimatedDays: 4,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "PROFILE",
    serviceName: "Professional Profile",
    category: ServiceCategory.CAREER,
    basePrice: 8000,
    intakeFormTemplate: "career_profile",
    estimatedDays: 3,
    expressDeliverySurcharge: 2000,
  },

  // ── Design & digital ──
  {
    serviceCode: "DIAGRAM",
    serviceName: "Technical Diagram Design",
    category: ServiceCategory.DESIGN,
    basePrice: 8000,
    intakeFormTemplate: "design_diagram",
    estimatedDays: 3,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "WATERMARK",
    serviceName: "Watermark Removal",
    category: ServiceCategory.DIGITAL,
    basePrice: 3000,
    intakeFormTemplate: "design_watermark",
    estimatedDays: 1,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "PDF-MOD",
    serviceName: "PDF Modifications",
    category: ServiceCategory.DIGITAL,
    basePrice: 5000,
    intakeFormTemplate: "design_pdf",
    estimatedDays: 2,
    expressDeliverySurcharge: 2000,
  },
  {
    serviceCode: "GD-FLY",
    serviceName: "Graphic Design (Flyer)",
    category: ServiceCategory.DESIGN,
    basePrice: 8000,
    pricingModel: PricingModel.QUOTE,
    intakeFormTemplate: "design_graphic",
    estimatedDays: 3,
    expressDeliverySurcharge: 2000,
  },
];

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
      // Variants have no natural unique key — rebuild them for this service.
      await db.serviceVariant.deleteMany({ where: { serviceId: saved.id } });
      await db.serviceVariant.createMany({
        data: variants.map((v, vi) => ({
          serviceId: saved.id,
          name: v.name,
          priceAddon: v.priceAddon,
          sortOrder: vi,
        })),
      });
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
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

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
