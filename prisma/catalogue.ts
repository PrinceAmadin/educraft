import { PricingModel, ServiceCategory } from "@prisma/client";

/**
 * The EduCraft service catalogue — the single source for both `prisma/seed.ts`
 * and `scripts/sync-service-catalogue.ts`.
 *
 * Prices follow the current flyers (DATA/pricing/):
 *
 *   Normal Pricelist.png       general price list
 *   FYP Pricelist combo.png    final year services + combos
 *
 * Where the flyers disagree, the final year flyer wins for final year work:
 *   - Assignment-based report     from ₦5,000 (₦5k–10k)
 *   - Editing & formatting        20% under 50 pages, 25% at 50+ (general)
 *   - Final year editing          10% under 50 pages, 15% at 50+ (FYB flyer)
 *   - Express delivery            +₦2,000 general, +₦5,000 final year
 *
 * Ranges on the flyers ("₦10k–15k") are stored as VARIABLE from the lower
 * figure, with the full range in the description.
 *
 * Every price here is on one of the two flyers. Documents & diagrams
 * (watermark removal, PDF/image conversion, diagrams, UML) are NOT offered and
 * are retired below.
 */

export type CatalogueService = {
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

const EXPRESS_GENERAL = 2000;
const EXPRESS_FINAL_YEAR = 5000;

export const SERVICE_CATALOGUE: CatalogueService[] = [
  // ── Academic writing ──
  {
    serviceCode: "FYP-FULL",
    serviceName: "Final Year Project (Full)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 70000,
    intakeFormTemplate: "academic_fyp",
    estimatedDays: 30,
    description: "Full 5-chapter final year project report.",
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
    variants: [{ name: "With Data Analysis", priceAddon: 20000 }],
  },
  {
    serviceCode: "FYP-PROP",
    serviceName: "Final Year Project (Proposal Only)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 20000,
    intakeFormTemplate: "academic_fyp_proposal",
    estimatedDays: 7,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "FYP-CH4",
    serviceName: "Final Year Project (Chapter 4 Only)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 25000,
    intakeFormTemplate: "academic_fyp_chapter",
    estimatedDays: 7,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
    variants: [{ name: "With Data Analysis", priceAddon: 6500 }],
  },
  {
    serviceCode: "SEM",
    serviceName: "Seminar Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 35000,
    intakeFormTemplate: "academic_seminar",
    estimatedDays: 10,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "PUB",
    serviceName: "Publication Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 15000,
    intakeFormTemplate: "academic_publication",
    estimatedDays: 10,
    description: "Report prepared for journal or conference publication.",
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "IT-3M",
    serviceName: "IT Report (1–3 Months)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 15000,
    intakeFormTemplate: "academic_it",
    estimatedDays: 7,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "IT-6M",
    serviceName: "IT Report (4–6 Months)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 20000,
    intakeFormTemplate: "academic_it",
    estimatedDays: 10,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "IT-PPT",
    serviceName: "PowerPoint + IT / Seminar Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 28000,
    intakeFormTemplate: "academic_it",
    estimatedDays: 10,
    description: "The written IT or seminar report together with its presentation slides.",
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "ASSIGN",
    serviceName: "Assignment-Based Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 5000,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "academic_termpaper",
    estimatedDays: 5,
    description: "₦5,000–₦10,000 depending on length and depth.",
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "TERM",
    serviceName: "Term Paper",
    category: ServiceCategory.ACADEMIC,
    basePrice: 15000,
    intakeFormTemplate: "academic_termpaper",
    estimatedDays: 7,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "MINI",
    serviceName: "Mini Project Report",
    category: ServiceCategory.ACADEMIC,
    basePrice: 15000,
    intakeFormTemplate: "academic_mini",
    estimatedDays: 10,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },

  // ── Research & analysis ──
  {
    serviceCode: "THESIS",
    serviceName: "Thesis / Dissertation",
    category: ServiceCategory.ACADEMIC,
    basePrice: 70000,
    intakeFormTemplate: "academic_fyp",
    estimatedDays: 30,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "CASE",
    serviceName: "Case Study Analysis",
    category: ServiceCategory.ACADEMIC,
    basePrice: 31500,
    intakeFormTemplate: "academic_casestudy",
    estimatedDays: 10,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "BIZ-PROP",
    serviceName: "Business Proposal",
    category: ServiceCategory.ACADEMIC,
    basePrice: 30000,
    intakeFormTemplate: "academic_termpaper",
    estimatedDays: 7,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },

  // ── Chapter-based final year reports ──
  // Priced per chapter as a share of the full report (see src/lib/chapter-pricing.ts).
  // basePrice is the full report without data analysis; the option is the same
  // report with it. The public price is worked out from the chapters picked.
  {
    serviceCode: "FYP-CHAPTERS",
    serviceName: "Final Year Project (Chapter-based)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 70000,
    intakeFormTemplate: "academic_fyp",
    estimatedDays: 14,
    description:
      "Order only the chapters you need. Chapter 1: 12%, Chapter 2: 18%, Chapter 3: 30%, Chapter 4: 35%, Chapter 5: 5% of the full report price.",
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
    variants: [{ name: "With Data Analysis", priceAddon: 20000 }],
  },

  // ── Final year combos ──
  {
    serviceCode: "COMBO-PR",
    serviceName: "Proposal + Report (without DA)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 87000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 28,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "COMBO-PR-DA",
    serviceName: "Proposal + Report (with DA)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 107000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 28,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "COMBO-RS",
    serviceName: "Report (without DA) + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 80000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 25,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "COMBO-RS-DA",
    serviceName: "Report (with DA) + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 100000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 25,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "COMBO-PRDS",
    serviceName: "Proposal + DA Report + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 120000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 30,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "COMBO-PFRS",
    serviceName: "Proposal + Full Report + Slides",
    category: ServiceCategory.ACADEMIC,
    basePrice: 100000,
    intakeFormTemplate: "academic_fyp_combo",
    estimatedDays: 30,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
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
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "PPT-FULL",
    serviceName: "PowerPoint (Design + Content)",
    category: ServiceCategory.DESIGN,
    basePrice: 10000,
    intakeFormTemplate: "design_presentation",
    estimatedDays: 4,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "PPT-FYP",
    serviceName: "PowerPoint (FYP Defence Slides)",
    category: ServiceCategory.DESIGN,
    basePrice: 13000,
    intakeFormTemplate: "design_presentation",
    estimatedDays: 5,
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },

  // ── Letters & essays ──
  {
    serviceCode: "LTR-INF",
    serviceName: "Informal Letter",
    category: ServiceCategory.ACADEMIC,
    basePrice: 5000,
    intakeFormTemplate: "letter",
    estimatedDays: 2,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "LTR-FORM",
    serviceName: "Formal Letter",
    category: ServiceCategory.ACADEMIC,
    basePrice: 8000,
    intakeFormTemplate: "letter",
    estimatedDays: 2,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "ESSAY",
    serviceName: "Essay Writing (Any Kind)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 10000,
    intakeFormTemplate: "academic_essay",
    estimatedDays: 5,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },

  // ── Career ──
  {
    serviceCode: "LTR-APP",
    serviceName: "Application / Cover Letter",
    category: ServiceCategory.CAREER,
    basePrice: 5000,
    intakeFormTemplate: "letter",
    estimatedDays: 2,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "CV",
    serviceName: "CV / Resume",
    category: ServiceCategory.CAREER,
    basePrice: 10000,
    intakeFormTemplate: "career_cv",
    estimatedDays: 4,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "PROFILE",
    serviceName: "Professional Profile",
    category: ServiceCategory.CAREER,
    basePrice: 8000,
    intakeFormTemplate: "career_profile",
    estimatedDays: 3,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },

  // ── Editing & formatting ──
  {
    serviceCode: "EDIT-SM",
    serviceName: "Editing & Formatting (under 50 pages)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 0,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "editing",
    estimatedDays: 4,
    description: "Priced at 20% of the original project cost.",
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "EDIT-LG",
    serviceName: "Editing & Formatting (50+ pages)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 0,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "editing",
    estimatedDays: 6,
    description: "Priced at 25% of the original project cost.",
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
  {
    serviceCode: "EDIT-FYP-SM",
    serviceName: "Final Year Project Editing (under 50 pages)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 0,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "editing",
    estimatedDays: 5,
    description: "Priced at 10% of the original project cost.",
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "EDIT-FYP-LG",
    serviceName: "Final Year Project Editing (50+ pages)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 0,
    pricingModel: PricingModel.VARIABLE,
    intakeFormTemplate: "editing",
    estimatedDays: 7,
    description: "Priced at 15% of the original project cost.",
    expressDeliverySurcharge: EXPRESS_FINAL_YEAR,
  },
  {
    serviceCode: "EDIT-IT",
    serviceName: "Editing (Existing IT / Seminar Report)",
    category: ServiceCategory.ACADEMIC,
    basePrice: 8000,
    intakeFormTemplate: "editing",
    estimatedDays: 4,
    expressDeliverySurcharge: EXPRESS_GENERAL,
  },
];

/**
 * Services that appear on no current flyer. The sync deactivates them — it
 * never deletes, because existing projects reference them.
 *
 *   DATA     Data Analysis Only — not on any flyer
 *   FORMAT   Formatting Only (₦5,000) — flyer 4.png prices formatting as a
 *            percentage, which EDIT-SM / EDIT-LG already cover
 *   GD-FLY   Graphic Design (Flyer) — not on any flyer
 *   WATERMARK, WM-COMPLEX, WM-MARKS, PDF-MOD, PDF-WORD, IMG-WORD, DIAGRAM, UML
 *            Documents & diagrams — not offered (founder, Sept 2026)
 */
export const RETIRED_SERVICE_CODES = [
  "DATA",
  "FORMAT",
  "GD-FLY",
  "WATERMARK",
  "WM-COMPLEX",
  "WM-MARKS",
  "PDF-MOD",
  "PDF-WORD",
  "IMG-WORD",
  "DIAGRAM",
  "UML",
] as const;
