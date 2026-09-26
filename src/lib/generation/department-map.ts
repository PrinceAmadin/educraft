/**
 * Department → prompt section → default research mode (Table A, founder-approved
 * 2026-09-26). The chapter prompt files are organised by FACULTY-level sections
 * tagged [DEPARTMENT: X]; this table is the only place a department name is
 * turned into one of those tags. The prompt loader never parses the "Applies to"
 * lines inside the prompt files: they overlap and contradict the mode map.
 *
 * The COO confirms the department on the mode card (Phase D3) and that confirmed
 * value is what the loader resolves. Department is typed freely at intake and
 * stored on the Client, so the raw text is only ever a suggestion.
 *
 * Pure (no database, no filesystem) so the mode classifier and the checks can use it.
 */

/** The eleven department-section tags the chapter prompt files contain. */
export const SECTION_KEYS = [
  "AGRICULTURE",
  "BUSINESS",
  "COMPUTER_SCIENCE",
  "ECONOMICS",
  "EDUCATION",
  "ENGINEERING",
  "HUMANITIES",
  "LAW_DOCTRINAL",
  "LAW_NON_DOCTRINAL",
  "MEDICAL_SCIENCE",
  "NURSING",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** 1 Thematic · 2 Survey · 3 Build · 4 Lab · 5 Secondary data. */
export type ResearchModeNumber = 1 | 2 | 3 | 4 | 5;

export const MODE_NAMES: Record<ResearchModeNumber, string> = {
  1: "Thematic / Argumentative",
  2: "Survey / Questionnaire",
  3: "Implementation / Build",
  4: "Laboratory / Experimental",
  5: "Secondary Data / Quantitative Modelling",
};

/** The modes each section's chapter instructions are written for. A section is
 *  kept when the approved mode is one of these; otherwise the section follows the mode. */
export const SECTION_MODES: Record<SectionKey, readonly ResearchModeNumber[]> = {
  ENGINEERING: [3, 4],
  COMPUTER_SCIENCE: [3],
  MEDICAL_SCIENCE: [2, 4],
  NURSING: [2],
  BUSINESS: [2],
  EDUCATION: [2], // a theoretical (Mode 1) Education project takes the Humanities thematic chain
  ECONOMICS: [5],
  AGRICULTURE: [4],
  HUMANITIES: [1],
  LAW_DOCTRINAL: [1],
  LAW_NON_DOCTRINAL: [2],
};

/** Where a department lands when the COO approves a mode its own section wasn't written for.
 *  Mode 3 has no fallback: only the COO can tell a hardware build (ENGINEERING) from a software one (COMPUTER_SCIENCE). */
const MODE_FALLBACK_SECTION: Record<ResearchModeNumber, SectionKey | null> = {
  1: "HUMANITIES",
  2: "BUSINESS", // the survey fallback for departments with no survey section of their own
  3: null,
  4: "MEDICAL_SCIENCE",
  5: "ECONOMICS",
};

export type DepartmentEntry = {
  name: string;
  aliases?: string[];
  /** "LAW" = the section is decided by the mode (1 doctrinal, 2 non-doctrinal).
   *  null = no section fits; the COO picks the mode AND the section on the card. */
  section: SectionKey | "LAW" | null;
  /** null = no default; generation is blocked until the COO picks a mode. */
  defaultMode: ResearchModeNumber | null;
  /** Accounting: always Mode 5, no override. */
  lockedMode?: boolean;
  /** Special landing sections when the COO switches mode, e.g. Agricultural Economics in Mode 4 → AGRICULTURE. */
  modeSections?: Partial<Record<ResearchModeNumber, SectionKey>>;
  /** Social science on the BUSINESS survey fallback: the loader adds the approved note (A1). */
  socialScience?: boolean;
  /** Pure / lab sciences whose samples are not people (A2): in Mode 4 on MEDICAL_SCIENCE the loader adds the
   *  non-human-samples note and combines Results and Discussion in Chapter Four. A Mode 2 survey goes to BUSINESS. */
  pureScience?: boolean;
  /** Group labels ("Engineering", "Social Sciences") and junk values: never routed. */
  group?: boolean;
};

const ENGINEERING = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "ENGINEERING", defaultMode: 3 });
const COMPUTING = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "COMPUTER_SCIENCE", defaultMode: 3 });
const MEDICAL = (name: string, defaultMode: 2 | 4, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "MEDICAL_SCIENCE", defaultMode });
const PURE_SCIENCE = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "MEDICAL_SCIENCE", defaultMode: 4, pureScience: true, modeSections: { 2: "BUSINESS" } });
const EDUCATION = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "EDUCATION", defaultMode: 2 });
const BUSINESS = (name: string, aliases: string[] = [], extra: Partial<DepartmentEntry> = {}): DepartmentEntry => ({ name, aliases, section: "BUSINESS", defaultMode: 2, ...extra });
const SOCIAL = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "BUSINESS", defaultMode: 2, socialScience: true });
const ECONOMICS = (name: string, aliases: string[] = [], extra: Partial<DepartmentEntry> = {}): DepartmentEntry => ({ name, aliases, section: "ECONOMICS", defaultMode: 5, ...extra });
const AGRICULTURE = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "AGRICULTURE", defaultMode: 4 });
const HUMANITIES = (name: string, aliases: string[] = [], extra: Partial<DepartmentEntry> = {}): DepartmentEntry => ({ name, aliases, section: "HUMANITIES", defaultMode: 1, ...extra });
const LAW = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: "LAW", defaultMode: 1 });
const COO_PICKS = (name: string, aliases: string[] = [], extra: Partial<DepartmentEntry> = {}): DepartmentEntry => ({ name, aliases, section: null, defaultMode: null, ...extra });
const GROUP = (name: string, aliases: string[] = []): DepartmentEntry => ({ name, aliases, section: null, defaultMode: null, group: true });

export const DEPARTMENTS: readonly DepartmentEntry[] = [
  // ENGINEERING — Mode 3. Civil and Materials projects are often lab tests: the COO picks Mode 4 per project (A7).
  ENGINEERING("Mechanical Engineering", ["Mechanical"]),
  ENGINEERING("Electrical and Electronic Engineering", ["Electrical Engineering", "Electronic Engineering", "Electronics Engineering", "Electrical and Electronics Engineering", "Electrical", "EEE"]),
  ENGINEERING("Civil Engineering", ["Civil", "Civil and Environmental Engineering", "Water Resources and Environmental Engineering", "Structural Engineering"]),
  ENGINEERING("Chemical Engineering"),
  ENGINEERING("Petroleum Engineering", ["Petroleum", "Petroleum and Gas Engineering", "Gas Engineering", "Oil and Gas Engineering"]),
  ENGINEERING("Mechatronics Engineering", ["Mechatronics"]),
  ENGINEERING("Biomedical Engineering"),
  ENGINEERING("Computer Engineering", ["Computer and Electronics Engineering", "Electronic and Computer Engineering"]), // A6: COO switches software-only projects to COMPUTER_SCIENCE
  ENGINEERING("Aerospace Engineering", ["Aeronautical Engineering", "Aeronautical and Astronautical Engineering"]),
  ENGINEERING("Materials and Metallurgical Engineering", ["Metallurgical and Materials Engineering", "Metallurgical Engineering", "Materials Engineering", "Materials Science and Engineering"]),
  ENGINEERING("Agricultural Engineering", ["Agricultural and Biosystems Engineering", "Agricultural and Bioresources Engineering", "Agricultural and Bio-Resources Engineering", "Biosystems Engineering", "Agricultural and Environmental Engineering"]),
  ENGINEERING("Industrial and Production Engineering", ["Industrial Engineering", "Production Engineering"]),
  ENGINEERING("Telecommunications Engineering", ["Telecommunication Engineering", "Information and Communication Engineering"]),
  ENGINEERING("Marine Engineering", ["Naval Architecture", "Naval Architecture and Marine Engineering", "Marine and Offshore Engineering"]),
  ENGINEERING("Mining Engineering"),
  ENGINEERING("Environmental Engineering"),
  ENGINEERING("Polymer and Textile Engineering", ["Polymer Engineering", "Textile Engineering"]),
  ENGINEERING("Systems Engineering"),
  ENGINEERING("Food Engineering", ["Food Science and Engineering"]),
  ENGINEERING("Prosthetics and Orthotics"),
  ENGINEERING("Automotive Engineering"),
  ENGINEERING("Wood Products Engineering"),

  // COMPUTER_SCIENCE — Mode 3. (Bare "IT" is never an alias: it collides with the IT/SIWES report service.)
  COMPUTING("Computer Science", ["Computing", "CS", "Comp Sci", "Computer and Information Science", "Computer and Information Sciences", "Computer Technology"]),
  COMPUTING("Software Engineering"),
  COMPUTING("Information Technology"),
  COMPUTING("Information and Communication Technology", ["ICT"]),
  COMPUTING("Information Systems", ["Management Information Systems", "Computer Information Systems"]),
  COMPUTING("Cyber Security", ["Cybersecurity", "Cyber Security Science"]),
  COMPUTING("Data Science", ["Data Science and Analytics"]),
  COMPUTING("Artificial Intelligence", ["Artificial Intelligence and Robotics"]),

  // MEDICAL_SCIENCE — Mode 4, Results and Discussion kept separate (Chapter Four results only, discussion in Chapter Five).
  MEDICAL("Medicine and Surgery", 4, ["Medicine", "MBBS"]),
  MEDICAL("Medical Laboratory Science", 4, ["MLS", "Medical Laboratory Science (MLS)", "Medical Lab Science", "Medical Laboratory Sciences", "Haematology", "Haematology and Blood Transfusion Science", "Chemical Pathology", "Medical Microbiology", "Medical Microbiology and Parasitology"]),
  MEDICAL("Microbiology", 4, ["Applied Microbiology", "Industrial Microbiology", "Microbio"]),
  MEDICAL("Biochemistry", 4, ["Medical Biochemistry", "Biochem"]),
  MEDICAL("Pharmacy", 4, ["Pharmaceutical Sciences", "B.Pharm"]),
  MEDICAL("Pharmacology", 4, ["Pharmacology and Toxicology", "Pharmacology and Therapeutics"]),
  MEDICAL("Physiology", 4, ["Human Physiology"]),
  MEDICAL("Anatomy", 4, ["Human Anatomy"]),
  MEDICAL("Veterinary Medicine", 4, ["DVM"]),
  MEDICAL("Nutrition and Dietetics", 4, ["Human Nutrition", "Human Nutrition and Dietetics", "Nutrition"]),
  MEDICAL("Radiography and Radiation Science", 4, ["Radiography", "Medical Radiography"]),
  MEDICAL("Biotechnology", 4, ["Genetics and Biotechnology", "Genetics"]),
  MEDICAL("Science Laboratory Technology", 4, ["Science Lab Technology", "SLT"]),

  // MEDICAL_SCIENCE — Mode 4, pure / lab sciences with non-human samples: Results and Discussion combined (A2).
  PURE_SCIENCE("Chemistry", ["Pure and Applied Chemistry", "Applied Chemistry", "Pure and Industrial Chemistry"]),
  PURE_SCIENCE("Industrial Chemistry"),
  PURE_SCIENCE("Biology", ["Biological Sciences", "Pure and Applied Biology"]),
  PURE_SCIENCE("Botany", ["Plant Biology", "Plant Science", "Plant Science and Biotechnology", "Pure and Applied Botany"]),
  PURE_SCIENCE("Zoology", ["Animal and Environmental Biology", "Animal Biology", "Pure and Applied Zoology"]),
  PURE_SCIENCE("Environmental Biology"),
  PURE_SCIENCE("Environmental Management and Toxicology", ["Environmental Toxicology"]),
  PURE_SCIENCE("Marine Science", ["Marine Sciences", "Marine Biology", "Marine Science and Technology", "Oceanography"]),

  // MEDICAL_SCIENCE — Mode 2 (clinical and community surveys). A5: the COO may switch Public Health to NURSING on the card.
  MEDICAL("Public Health", 2, ["Community Health"]),
  MEDICAL("Environmental Health Science", 2, ["Environmental Health"]),
  MEDICAL("Physiotherapy", 2, ["Medical Rehabilitation"]),
  MEDICAL("Optometry", 2, ["Optometry and Vision Science"]),
  MEDICAL("Dentistry", 2, ["Dental Surgery", "BDS", "Dental Sciences", "Dental Technology", "Dental Therapy"]),
  MEDICAL("Health Information Management", 2, ["Health Records", "Medical Records", "Health Information Technology"]),

  // NURSING — Mode 2.
  { name: "Nursing", aliases: ["Nursing Science", "Public Health Nursing", "Community Health Nursing"], section: "NURSING", defaultMode: 2 },
  { name: "Midwifery", aliases: ["Nursing and Midwifery"], section: "NURSING", defaultMode: 2 },

  // EDUCATION — Mode 2 (a theoretical Mode 1 project takes the Humanities thematic chain).
  EDUCATION("Education"),
  EDUCATION("Science Education", ["Science and Technology Education"]),
  EDUCATION("Adult Education", ["Adult and Non-Formal Education", "Adult and Continuing Education"]),
  EDUCATION("Curriculum Studies", ["Curriculum", "Curriculum and Instruction"]),
  EDUCATION("Guidance and Counselling", ["Counselling Psychology", "Educational Psychology", "Educational Psychology and Counselling"]),
  EDUCATION("Educational Management", ["Educational Administration", "Educational Administration and Planning", "Educational Management and Planning"]),
  { name: "Educational Technology", section: "EDUCATION", defaultMode: 2, modeSections: { 3: "COMPUTER_SCIENCE" } },
  EDUCATION("Health Education", ["Human Kinetics and Health Education", "Physical and Health Education", "Human Kinetics"]),
  EDUCATION("Business Education", ["Business Teacher Education", "Office and Information Management Education"]),
  EDUCATION("Technical and Vocational Education", ["Vocational and Technical Education", "Technical Education", "Vocational Education", "Industrial Technical Education"]),
  EDUCATION("Educational Foundations", ["Foundations of Education", "Philosophy of Education", "Sociology of Education"]),
  EDUCATION("Special Education", ["Special Needs Education"]),
  EDUCATION("Early Childhood Education", ["Early Childhood and Primary Education", "Primary Education", "Primary Education Studies"]),
  EDUCATION("Library and Information Science", ["Library Science", "Library and Information Studies"]),
  EDUCATION("Social Studies", ["Social Studies Education"]),
  // Reached by the Education-token rule in lookupDepartment ("Economics Education", "B.Ed Mathematics", "Music Education").
  EDUCATION("Education (combined with a teaching subject)"),

  // BUSINESS — Mode 2.
  BUSINESS("Business Administration", ["Business", "Business Management"]),
  BUSINESS("Marketing"),
  BUSINESS("Management"),
  BUSINESS("Human Resource Management", ["HRM", "Industrial Relations and Personnel Management", "Industrial Relations and Human Resource Management", "Personnel Management"]),
  BUSINESS("Entrepreneurship", ["Entrepreneurial Studies", "Entrepreneurship and Business Studies"]),
  BUSINESS("Hospitality and Tourism Management", ["Tourism Management", "Hospitality Management", "Hotel and Catering Management"]),
  BUSINESS("Transport Management", ["Transport and Logistics", "Logistics and Supply Chain Management", "Transport Management Technology", "Purchasing and Supply", "Procurement Management", "Maritime Management", "Maritime Transport and Business Studies"]),
  BUSINESS("Office Technology and Management", ["Secretarial Studies", "Secretarial Administration"]),
  BUSINESS("Cooperative Economics and Management", ["Cooperative and Rural Development", "Cooperative Studies"]),
  BUSINESS("Project Management", ["Project Management Technology"]),
  BUSINESS("Health Services Administration", ["Health Administration", "Health Management", "Healthcare Management", "Hospital Administration", "Health Services Management"]),

  // BUSINESS — Mode 2, social sciences on the survey fallback until a SOCIAL_SCIENCE section exists (A1).
  SOCIAL("Public Administration", ["Public Administration and Local Government", "Local Government Studies", "Pub Admin"]),
  SOCIAL("Political Science", ["Politics", "Government", "Pol Sci"]),
  SOCIAL("Sociology", ["Sociology and Anthropology"]),
  SOCIAL("Anthropology"),
  SOCIAL("Psychology", ["Applied Psychology"]),
  SOCIAL("Social Work", ["Social Work and Community Development"]),
  SOCIAL("Mass Communication", ["Mass Comm", "Communication Studies", "Communication and Media Studies", "Communication Arts", "Public Relations", "Advertising", "Public Relations and Advertising", "Broadcasting", "Development Communication Studies"]),
  SOCIAL("Journalism", ["Journalism and Media Studies"]),
  SOCIAL("Criminology and Security Studies", ["Criminology", "Security Studies", "Law Enforcement", "Criminology and Law Enforcement"]),
  SOCIAL("Peace and Conflict Studies", ["Peace Studies and Conflict Resolution", "Peace and Conflict Resolution"]),

  // BUSINESS — Mode 2, built environment and extension on the survey fallback.
  BUSINESS("Estate Management", ["Estate Management and Valuation"]),
  BUSINESS("Quantity Surveying"),
  BUSINESS("Urban and Regional Planning", ["Town Planning", "Urban Planning"]),
  BUSINESS("Building Technology", ["Building", "Building Science", "Building Construction"], { modeSections: { 4: "ENGINEERING" } }),
  BUSINESS("Agricultural Extension", ["Agricultural Extension and Rural Development", "Agricultural Extension and Rural Sociology"], { modeSections: { 4: "AGRICULTURE" } }),

  // ECONOMICS — Mode 5. A4: the COO may move a finance project to Mode 2 (BUSINESS) for primary data. Accounting is locked (A3).
  ECONOMICS("Economics", ["Economics and Development Studies", "Econs"]),
  ECONOMICS("Development Economics"),
  ECONOMICS("Development Studies", [], { socialScience: true }),
  ECONOMICS("Agricultural Economics", ["Agricultural Economics and Extension", "Agricultural Economics and Farm Management", "Agricultural and Resource Economics", "Agribusiness", "Agric Economics", "Agric Econs"], { modeSections: { 4: "AGRICULTURE" } }),
  ECONOMICS("Statistics", ["Applied Statistics", "Industrial Statistics"]),
  ECONOMICS("Demography and Social Statistics", ["Demography", "Population Studies"], { socialScience: true }),
  ECONOMICS("Accounting", ["Accountancy", "Accounting and Finance"], { lockedMode: true }),
  ECONOMICS("Banking and Finance", ["Banking", "Finance and Banking"]),
  ECONOMICS("Finance"),
  ECONOMICS("Insurance", ["Insurance and Risk Management", "Actuarial Science and Insurance"]),
  ECONOMICS("Actuarial Science"),
  ECONOMICS("Taxation", ["Public Finance"]),

  // AGRICULTURE — Mode 4.
  AGRICULTURE("Agriculture", ["Agricultural Science", "Agric Science", "General Agriculture"]),
  AGRICULTURE("Agronomy"),
  AGRICULTURE("Crop Science", ["Crop Production", "Crop Protection", "Crop Science and Horticulture", "Horticulture", "Plant Science and Crop Production", "Plant Breeding", "Plant Breeding and Seed Technology"]),
  AGRICULTURE("Animal Science", ["Animal Production", "Animal Production and Health", "Animal Husbandry", "Animal Breeding and Genetics"]),
  AGRICULTURE("Soil Science", ["Soil Science and Land Resources Management"]),
  AGRICULTURE("Fisheries and Aquaculture", ["Fisheries", "Aquaculture and Fisheries Management"]),
  AGRICULTURE("Forestry and Wildlife", ["Forestry", "Forestry and Wildlife Management", "Wildlife Management"]),
  AGRICULTURE("Food Science and Technology", ["Food Science", "Food Technology", "Food Science and Nutrition"]),

  // HUMANITIES — Mode 1 (Template B).
  HUMANITIES("English and Literary Studies", ["English", "English Language", "English Language and Literature", "Literature in English", "English Literature", "Literature", "English Studies"]),
  HUMANITIES("Linguistics", ["Linguistics and Nigerian Languages", "Linguistics and African Languages"]),
  HUMANITIES("History", ["History and International Studies", "History and Diplomatic Studies", "History and Strategic Studies", "History and International Relations"]),
  HUMANITIES("International Studies"),
  HUMANITIES("International Relations", ["International Relations and Diplomacy", "Diplomacy and International Relations"], { socialScience: true }),
  HUMANITIES("Philosophy"),
  HUMANITIES("Theology", ["Christian Theology"]),
  HUMANITIES("Religious Studies", ["Religion", "Religion and Cultural Studies", "Christian Religious Studies", "Religious and Cultural Studies"]),
  HUMANITIES("Islamic Studies", ["Arabic and Islamic Studies", "Arabic"]),
  HUMANITIES("Cultural Studies"),
  HUMANITIES("Gender Studies", ["Gender and Women Studies"], { socialScience: true }),
  HUMANITIES("African Studies", ["African and Asian Studies"]),
  HUMANITIES("Nigerian Languages", ["Yoruba", "Igbo", "Hausa", "Yoruba Language", "Igbo Language", "African Languages", "Nigerian Languages and Linguistics"]),
  HUMANITIES("French and Foreign Languages", ["French", "French Language", "Foreign Languages", "Modern European Languages", "European Languages", "European Studies"]),
  HUMANITIES("Theatre Arts", ["Theatre and Media Arts", "Theatre and Film Studies", "Dramatic Arts", "Performing Arts", "Creative Arts", "Film Studies"]),
  HUMANITIES("Fine and Applied Arts", ["Fine Arts", "Visual Arts", "Visual and Creative Arts"]),
  HUMANITIES("Music"),
  HUMANITIES("Archaeology", ["Archaeology and Anthropology", "Archaeology and Tourism"]),
  HUMANITIES("Classics", ["Classical Studies"]),
  // Only an explicitly non-empirical label comes here; bare "Media Studies" goes to the COO.
  HUMANITIES("Media Studies (non-empirical)"),

  // LAW — Mode 1 = LAW_DOCTRINAL (always 6 chapters), Mode 2 = LAW_NON_DOCTRINAL; Modes 3–5 refused.
  LAW("Law", ["LLB", "LL.B", "Law Doctrinal"]),
  LAW("Jurisprudence and International Law", ["International Law and Jurisprudence", "Jurisprudence", "International Law"]),
  LAW("Public Law", ["Public and International Law", "Public and Private Law"]),
  LAW("Private and Property Law", ["Property Law", "Private Law", "Private and Business Law"]),
  LAW("Commercial and Industrial Law", ["Commercial Law", "Business Law", "Commercial and Property Law", "Business and Private Law"]),
  LAW("Islamic Law", ["Sharia", "Shari'ah", "Common and Islamic Law"]),

  // No section fits the typical project: the COO picks mode AND section before generation (A9).
  COO_PICKS("Physics", ["Physics with Electronics", "Industrial Physics", "Applied Physics", "Physics and Astronomy", "Pure and Applied Physics", "Geophysics", "Applied Geophysics"], { pureScience: true }),
  COO_PICKS("Mathematics", ["Industrial Mathematics", "Applied Mathematics", "Pure and Applied Mathematics", "Mathematical Sciences"], { pureScience: true }),
  COO_PICKS("Geology", ["Applied Geology", "Geology and Mining", "Earth Sciences"], { pureScience: true }),
  COO_PICKS("Geography", ["Geography and Environmental Management", "Geography and Regional Planning"], { socialScience: true }),
  COO_PICKS("Architecture", ["Architectural Technology"]),
  COO_PICKS("Surveying and Geoinformatics", ["Surveying", "Geoinformatics", "Surveying and Geo-informatics"]),
  COO_PICKS("Meteorology", ["Meteorology and Climate Science", "Atmospheric Science", "Climate Science"]),
  COO_PICKS("Home Economics", ["Home Science", "Home Science and Management", "Home Economics and Hotel Management", "Clothing and Textiles"]),
  COO_PICKS("Water Resources Management and Agrometeorology", ["Agrometeorology"]),

  // Not departments: the COO records the real department before anything is generated.
  GROUP("Engineering (branch not stated)", ["Engineering", "Engineering (all branches)"]),
  GROUP("Medical or health sciences (branch not stated)", ["Medical", "Medical Science", "Medical Sciences", "Medical Sci", "Medical/Lab Science", "Medical/Lab Sciences", "Medical/Lab Sci", "Medicine and Health", "Basic Medical Sciences", "Health Sciences"]),
  GROUP("Management Sciences (department not stated)", ["Management Sciences", "Business/Accounting"]),
  GROUP("Social Sciences (department not stated)", ["Social Sciences", "Social Science"]),
  GROUP("Arts or Humanities (department not stated)", ["Arts", "Humanities", "Arts and Humanities"]),
  GROUP("Sciences (department not stated)", ["Science", "Sciences", "Natural Sciences", "Physical Sciences", "Life Sciences", "Pure and Applied Sciences"]),
  GROUP("Environmental Sciences (department not stated)", ["Environmental Science", "Environmental Sciences", "Environmental Management"]),
  GROUP("Media Studies (empirical or not stated)", ["Media Studies", "Media"]), // Mass Communication (survey) or non-empirical media studies: the COO decides
  GROUP("General (placeholder)", ["General"]),
];

/**
 * "Dept. of Electrical/Electronic Engineering." → "electrical and electronic engineering".
 * "&" and "/" read as "and"; leading "Department of", "Final year," and degree tokens
 * (B.Sc., B.Eng., HND, M.Sc. …) are dropped, except Education degrees, which become the
 * word "education" so the Education-token rule sees them.
 */
export function normalizeDepartment(raw: string): string {
  let s = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[&/]/g, " and ");
  // B.Sc.(Ed), B.Sc.(Ed.), B.Sc.Ed, B.A.Ed, B.Ed, BEd, M.Ed, M Ed — but never the word "Med" (Med Lab Science, Vet Med).
  s = s.replace(
    /\b(b|m)\.?\s?(sc|a)?\.?\s?\(\s?ed\.?\s?\)|\b[bm]\.?\s?(sc|a|tech)\.?\s?ed\b\.?|\bb\.?\s?ed\b\.?|\bm(?:\.\s?|\s)ed\b\.?/g,
    " education ",
  );
  s = s.replace(/[()'’.,:;-]/g, " ").replace(/\s+/g, " ").trim();
  const stripped = s
    .replace(/^final year\s+/, "")
    .replace(/^(department|dept) of\s+/, "")
    .replace(/^(b|m)\s?(sc|eng|tech|agric|a|pharm)\s+/, "")
    .replace(/^(hnd|nd|pgd|mba|msc)\s+/, "")
    .replace(/\s+(department|dept)$/, "")
    .trim();
  return stripped || s;
}

const BY_KEY = new Map<string, DepartmentEntry>();
for (const entry of DEPARTMENTS) {
  for (const label of [entry.name, ...(entry.aliases ?? [])]) {
    const key = normalizeDepartment(label);
    const existing = BY_KEY.get(key);
    if (existing && existing !== entry) {
      throw new Error(`department-map: "${label}" is claimed by both "${existing.name}" and "${entry.name}"`);
    }
    BY_KEY.set(key, entry);
  }
}

const EDUCATION_COMBINED = BY_KEY.get(normalizeDepartment("Education (combined with a teaching subject)"))!;
const LAW_GENERIC = BY_KEY.get("law")!;

/**
 * The table row for a typed or confirmed department name, or null when nothing matches.
 * `displayName` is the row's name on an exact match, and the name as given when the row
 * was reached by a token rule (so "Economics Education" stays "Economics Education").
 */
export function matchDepartment(raw: string | null | undefined): { entry: DepartmentEntry; displayName: string } | null {
  if (!raw || !raw.trim()) return null;
  const key = normalizeDepartment(raw);
  const exact = BY_KEY.get(key);
  if (exact) return { entry: exact, displayName: exact.name };
  // Combined degrees: an Education token wins over the subject ("Economics Education" is an
  // Education project), and a Law token wins over Business ("Civil Law" is Law). A Law token next
  // to a criminology or security word is not a Law degree ("Law and Order"): the COO decides.
  const words = key.split(" ");
  const displayName = raw.trim().replace(/\s+/g, " ");
  if (words.includes("education")) return { entry: EDUCATION_COMBINED, displayName };
  const notLaw = ["criminology", "security", "enforcement", "order", "diplomacy", "relations"];
  if (words.includes("law") && !words.some((w) => notLaw.includes(w))) return { entry: LAW_GENERIC, displayName };
  return null;
}

export function lookupDepartment(raw: string | null | undefined): DepartmentEntry | null {
  return matchDepartment(raw)?.entry ?? null;
}

export class DepartmentRoutingError extends Error {}

/**
 * The prompt section for a department under the approved mode. The COO's section choice
 * on the card (override) wins when that section was written for the mode; otherwise the
 * department's own section is kept when it was written for the mode, and follows the mode
 * when it wasn't. A conflicting override for Accounting or Law is refused, never ignored.
 */
export function resolveSection(entry: DepartmentEntry, mode: ResearchModeNumber, override?: SectionKey | null): SectionKey {
  if (entry.group) {
    throw new DepartmentRoutingError(`"${entry.name}" is not a department. The COO must record the real department first.`);
  }
  if (entry.lockedMode && mode !== entry.defaultMode) {
    throw new DepartmentRoutingError(`${entry.name} is always Mode ${entry.defaultMode}; Mode ${mode} is not allowed.`);
  }
  if (entry.lockedMode && override && override !== entry.section) {
    throw new DepartmentRoutingError(`${entry.name} always uses the ${entry.section} section; it cannot be changed to ${override}.`);
  }
  if (entry.section === "LAW") {
    const lawSection: SectionKey | null = mode === 1 ? "LAW_DOCTRINAL" : mode === 2 ? "LAW_NON_DOCTRINAL" : null;
    if (!lawSection) {
      throw new DepartmentRoutingError(`Law projects are Mode 1 (doctrinal) or Mode 2 (non-doctrinal); Mode ${mode} is not allowed.`);
    }
    if (override && override !== lawSection) {
      throw new DepartmentRoutingError(`A Mode ${mode} Law project uses ${lawSection}; the section follows the mode and cannot be set to ${override}.`);
    }
    return lawSection;
  }
  if (override) {
    if (override === "LAW_DOCTRINAL" || override === "LAW_NON_DOCTRINAL") {
      throw new DepartmentRoutingError(`Only Law departments use the ${override} section.`);
    }
    if (!SECTION_MODES[override].includes(mode)) {
      throw new DepartmentRoutingError(
        `The ${override} section is written for Mode ${SECTION_MODES[override].join(" and ")}, not Mode ${mode}. Pick a section written for Mode ${mode}.`,
      );
    }
    return override;
  }
  if (entry.section === null) {
    throw new DepartmentRoutingError(`${entry.name} has no default section. The COO must pick the mode and the section on the card.`);
  }
  const special = entry.modeSections?.[mode]; // e.g. a pure science on a Mode 2 survey lands on BUSINESS, not MEDICAL_SCIENCE
  if (special) return special;
  if (SECTION_MODES[entry.section].includes(mode)) return entry.section;
  const landing = MODE_FALLBACK_SECTION[mode];
  if (!landing) {
    throw new DepartmentRoutingError(`${entry.name} in Mode 3 needs the COO to pick ENGINEERING (a hardware build) or COMPUTER_SCIENCE (a software build).`);
  }
  return landing;
}

/** B2: the style the COO card pre-fills. Law NALT, Nursing NMCN, History Chicago notes-bibliography, else APA 7th. */
export function defaultReferencingStyle(entry: DepartmentEntry): "NALT" | "NMCN" | "CHICAGO_NOTES_BIBLIOGRAPHY" | "APA_7TH" {
  if (entry.section === "LAW") return "NALT";
  if (entry.section === "NURSING") return "NMCN";
  if (entry.name === "History") return "CHICAGO_NOTES_BIBLIOGRAPHY";
  return "APA_7TH";
}
