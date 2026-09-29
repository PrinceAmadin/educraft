/**
 * Which data sources a Mode 5 project may be fetched from, by its department.
 * Pure (no database), shared by the model reader (which catalogue entries
 * Claude may pick), the fetcher (the reasons it gives) and the card.
 *
 * A department reaches one or more DOMAINS; every catalogue entry belongs to
 * one or more domains; a project is offered the entries of its domains only.
 * The department is the one the COO confirmed on the mode card (Table A,
 * department-map.ts). Routing is by the department's section, with the
 * exceptions below by Table A name. Departments with no section (the rows the
 * COO picks a section for, and group labels) each have an exception, which
 * check:secondary enforces.
 */

import { matchDepartment, type DepartmentEntry, type SectionKey } from "../generation/department-map";

export const DOMAINS = ["MACRO_FINANCE", "TECH_CYBER", "HEALTH", "SCIENCE_ENV_AG"] as const;
export type Domain = (typeof DOMAINS)[number];

/** As a sentence says it: "the {label} sources". */
export const DOMAIN_LABELS: Record<Domain, string> = {
  MACRO_FINANCE: "economics, finance and development",
  TECH_CYBER: "technology and cybersecurity",
  HEALTH: "health",
  SCIENCE_ENV_AG: "science, engineering, environment and agriculture",
};

const MACRO: Domain[] = ["MACRO_FINANCE"];
const TECH: Domain[] = ["TECH_CYBER"];
const HEALTH: Domain[] = ["HEALTH"];
const SCIENCE: Domain[] = ["SCIENCE_ENV_AG"];
const NONE: Domain[] = [];

/**
 * By section. Education is not one of the four source groups, but a Mode 5
 * report is written on the Economics section whatever the department (an
 * Education Mode 5 project models spending, enrolment and growth), so it gets
 * the economics and development sources. Humanities and Law have no numeric
 * sources: the specialist supplies the data.
 */
const SECTION_DOMAINS: Record<SectionKey | "LAW", Domain[]> = {
  ECONOMICS: MACRO,
  BUSINESS: MACRO,
  EDUCATION: MACRO,
  COMPUTER_SCIENCE: TECH,
  MEDICAL_SCIENCE: HEALTH,
  NURSING: HEALTH,
  AGRICULTURE: SCIENCE,
  ENGINEERING: SCIENCE,
  HUMANITIES: NONE,
  LAW: NONE,
  LAW_DOCTRINAL: NONE,
  LAW_NON_DOCTRINAL: NONE,
};

/** By Table A name; wins over the section. The first domain is the main one. */
export const DEPARTMENT_DOMAINS: Readonly<Record<string, Domain[]>> = {
  // Economics section
  "Agricultural Economics": ["MACRO_FINANCE", "SCIENCE_ENV_AG"],
  "Demography and Social Statistics": ["MACRO_FINANCE", "HEALTH"],
  "Development Studies": ["MACRO_FINANCE", "HEALTH"],
  // Business section
  "Health Services Administration": ["MACRO_FINANCE", "HEALTH"],
  "Agricultural Extension": ["SCIENCE_ENV_AG", "MACRO_FINANCE"],
  "Urban and Regional Planning": ["MACRO_FINANCE", "SCIENCE_ENV_AG"],
  "Mass Communication": ["MACRO_FINANCE", "TECH_CYBER"],
  Journalism: ["MACRO_FINANCE", "TECH_CYBER"],
  // Computing
  "Data Science": ["TECH_CYBER", "MACRO_FINANCE"],
  // Medical sciences
  "Environmental Health Science": ["HEALTH", "SCIENCE_ENV_AG"],
  "Nutrition and Dietetics": ["HEALTH", "SCIENCE_ENV_AG"],
  "Veterinary Medicine": ["HEALTH", "SCIENCE_ENV_AG"],
  Biotechnology: ["HEALTH", "SCIENCE_ENV_AG"],
  // Agriculture
  "Food Science and Technology": ["SCIENCE_ENV_AG", "HEALTH"],
  // Engineering
  "Computer Engineering": ["SCIENCE_ENV_AG", "TECH_CYBER"],
  "Telecommunications Engineering": ["SCIENCE_ENV_AG", "TECH_CYBER"],
  "Systems Engineering": ["SCIENCE_ENV_AG", "TECH_CYBER"],
  "Petroleum Engineering": ["SCIENCE_ENV_AG", "MACRO_FINANCE"],
  "Industrial and Production Engineering": ["SCIENCE_ENV_AG", "MACRO_FINANCE"],
  "Biomedical Engineering": ["SCIENCE_ENV_AG", "HEALTH"],
  // Education
  "Educational Technology": ["MACRO_FINANCE", "TECH_CYBER"],
  "Library and Information Science": ["MACRO_FINANCE", "TECH_CYBER"],
  "Health Education": ["MACRO_FINANCE", "HEALTH"],
  // No section of their own: the COO picks one
  Physics: SCIENCE,
  Mathematics: ["MACRO_FINANCE", "SCIENCE_ENV_AG"],
  Geology: SCIENCE,
  Geography: ["SCIENCE_ENV_AG", "MACRO_FINANCE"],
  Architecture: SCIENCE,
  "Surveying and Geoinformatics": SCIENCE,
  Meteorology: SCIENCE,
  "Home Economics": ["HEALTH", "MACRO_FINANCE"],
  "Water Resources Management and Agrometeorology": SCIENCE,
  // Group labels (the COO records the real department; until then, the group's sources)
  "Engineering (branch not stated)": SCIENCE,
  "Medical or health sciences (branch not stated)": HEALTH,
  "Management Sciences (department not stated)": MACRO,
  "Social Sciences (department not stated)": MACRO,
  "Arts or Humanities (department not stated)": NONE,
  "Sciences (department not stated)": ["SCIENCE_ENV_AG", "HEALTH"],
  "Environmental Sciences (department not stated)": SCIENCE,
  "Media Studies (empirical or not stated)": ["MACRO_FINANCE", "TECH_CYBER"],
  "General (placeholder)": MACRO,
};

/** The domains for a Table A row, or null for a row with no section and no exception (check:secondary fails on one). */
export function domainsForEntry(entry: DepartmentEntry): Domain[] | null {
  const named = DEPARTMENT_DOMAINS[entry.name];
  if (named) return [...named];
  if (entry.section === null) return null;
  // Pure and lab sciences whose samples are not people (filed under Medical Sciences).
  if (entry.pureScience && entry.section === "MEDICAL_SCIENCE") return ["SCIENCE_ENV_AG", "HEALTH"];
  // Social sciences filed under Humanities (International Relations, Gender Studies).
  if (entry.socialScience && entry.section === "HUMANITIES") return [...MACRO];
  return [...SECTION_DOMAINS[entry.section]];
}

export interface DomainRouting {
  /** The department as recorded (the COO-confirmed one on the mode card), or null. */
  department: string | null;
  /** The Table A row it matched, or null. */
  matched: string | null;
  domains: Domain[];
  /** One plain sentence: why these sources. */
  basis: string;
}

export function domainList(domains: readonly Domain[]): string {
  const labels = domains.map((d) => DOMAIN_LABELS[d]);
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join("; ")} and ${labels[labels.length - 1]}`;
}

export function routeDepartment(department: string | null | undefined): DomainRouting {
  const name = department?.trim() || null;
  const match = matchDepartment(name);
  if (!match) {
    return {
      department: name,
      matched: null,
      domains: [...MACRO],
      basis: `${name ? `"${name}" is not in the department table` : "No department is recorded"}: a Mode 5 report is written as an economics study, so the ${domainList(MACRO)} sources are used.`,
    };
  }
  const domains = domainsForEntry(match.entry) ?? [...MACRO];
  return {
    department: name,
    matched: match.entry.name,
    domains,
    basis: domains.length
      ? `${match.displayName}: the ${domainList(domains)} sources.`
      : `${match.displayName}: no automatic data source covers this department, so the specialist supplies the data.`,
  };
}

export function domainsForDepartment(department: string | null | undefined): Domain[] {
  return routeDepartment(department).domains;
}

/** A stable key for "the same routing" (a stored model reading is reused only under the same one). */
export function routingKey(domains: readonly Domain[]): string {
  return [...domains].sort().join("+") || "none";
}
