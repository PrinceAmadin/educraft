/**
 * Phase D3 — the mode classifier. Recommends a project's research mode (1–5)
 * from three signals and says what the COO still has to decide on the mode
 * card. Pure (no database), so the card service, the card screen and
 * `npm run check:modes` share it.
 *
 *   1. the department's default mode (Table A, department-map.ts: never duplicated here)
 *   2. a keyword scan of the project topic
 *   3. the client's own answer to "How will your project collect its information?" (A–E);
 *      older projects without it fall back, more weakly, to Project type + Data requirements
 *
 * Recommendation order: a department whose mode is fixed (Accounting, always 5), then the
 * client's A–E answer, then the keyword scan, then the older intake fields, then the
 * department default. Any signal that disagrees is reported as a conflict for the COO.
 * Where the section cannot be worked out (Mode 3 outside Engineering and Computing,
 * departments with no default, group names) it is left to the COO: never guessed.
 */
import type { DataRequirement, IntakeModeAnswer, ProjectType } from "@prisma/client";
import {
  SECTION_KEYS,
  SECTION_MODES,
  DepartmentRoutingError,
  MODE_NAMES,
  defaultReferencingStyle,
  matchDepartment,
  resolveSection,
  type DepartmentEntry,
  type ResearchModeNumber,
  type SectionKey,
} from "./generation/department-map";
import {
  CITATION_PLACEMENTS,
  citationPlacementFor,
  isReferencingStyleKey,
  type CitationPlacement,
  type ReferencingStyleKey,
} from "./generation/referencing";

export type ModeCode = "THEMATIC" | "SURVEY" | "BUILD" | "LAB" | "API_DATA";

export const MODE_CODES: Record<ResearchModeNumber, ModeCode> = {
  1: "THEMATIC",
  2: "SURVEY",
  3: "BUILD",
  4: "LAB",
  5: "API_DATA",
};

export const MODE_NUMBERS: ResearchModeNumber[] = [1, 2, 3, 4, 5];

export function isModeNumber(n: unknown): n is ResearchModeNumber {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5;
}

export function modeName(n: ResearchModeNumber): ModeCode {
  return MODE_CODES[n];
}

/** Short everyday names, for sentences. */
export const MODE_SHORT: Record<ResearchModeNumber, string> = { 1: "thematic", 2: "survey", 3: "build", 4: "lab", 5: "secondary data" };

/** "Mode 2 (survey)": the wording the conflict messages use. */
export function modeTitle(n: ResearchModeNumber): string {
  return `Mode ${n} (${MODE_SHORT[n]})`;
}

/** "Mode 2: Survey / Questionnaire": the wording for headings and lists. */
export function modeHeading(n: ResearchModeNumber): string {
  return `Mode ${n}: ${MODE_NAMES[n]}`;
}

// ─── Keywords ───────────────────────────────────────────────────────────────

type Keyword = string | RegExp;

/**
 * The spec's lists with the founder's fixes: "assessment of" dropped from Mode 2 and
 * "effect of [substance]" (a placeholder, never a real phrase) dropped from Mode 4; the
 * economics keywords added to Mode 5 only. A few spelling variants are listed beside
 * their spec form (cointegration, postcolonial); British/American -isation/-ization and
 * hyphens are handled by normalising the text.
 */
export const MODE_KEYWORDS: Record<ResearchModeNumber, readonly Keyword[]> = {
  1: [
    "jurisprudence",
    "doctrinal analysis",
    "critical analysis of",
    "nature and scope",
    "legal framework",
    "constitutional",
    "rights of",
    "feminist literary",
    "post-colonial",
    "postcolonial",
    "discourse analysis",
    "thematic analysis",
  ],
  2: [
    "attitude of",
    "perception of",
    "knowledge of",
    "awareness of",
    "factors affecting",
    "effect of covid",
    "prevalence of",
    "determinants of",
    "survey of",
    "influence of",
    "impact of",
  ],
  3: [
    "design and implementation",
    "development of a",
    "design and development",
    "build a",
    "construction of",
    "prototype",
    "system design",
    "web application",
    "mobile application",
    "android application",
    "management system",
    "information system",
    "automated",
    "smart system",
    "iot-based",
  ],
  4: [
    "antimicrobial activity",
    "antibacterial",
    "antifungal",
    "proximate analysis",
    "phytochemical",
    "physicochemical",
    "soil analysis",
    "yield of",
    "isolation and characterisation",
    "formulation and evaluation",
    "microbiological quality",
  ],
  5: [
    "time series",
    "panel data",
    "gdp",
    "exchange rate",
    "inflation",
    "inflation rate",
    "interest rate",
    "stock market",
    "fiscal policy",
    "monetary policy",
    "co-integration",
    "cointegration",
    "granger causality",
    "ardl",
    "var model",
    "economic analysis",
    "financial analysis",
    "regression analysis",
    /\(\s*\d{4}\s*[-–—]\s*\d{4}\s*\)/, // a year range such as (2000–2023)
  ],
};

/**
 * Keywords that only mean something in particular departments (A7): Civil and Materials
 * projects about concrete, soil or material testing are often lab tests (Mode 4), while
 * the department default is Mode 3.
 */
export const DEPARTMENT_KEYWORDS: { departments: string[]; mode: ResearchModeNumber; keywords: string[]; note: string }[] = [
  {
    departments: ["Civil Engineering", "Materials and Metallurgical Engineering"],
    mode: 4,
    keywords: ["concrete", "soil", "aggregate", "compressive strength", "stabilisation", "stabilization", "material testing"],
    note: "Topics about concrete, soil, aggregates or material testing in this department are often laboratory tests (Mode 4) rather than builds (Mode 3).",
  },
];

export interface KeywordTrigger {
  trigger: string;
  mode: ResearchModeNumber;
  modeName: ModeCode;
  /** Only counted because of the department (A7). */
  departmentRule?: boolean;
}

/** Lower case, hyphens and dashes as spaces, -isation spelt -ization, single spaces. */
function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/isation/g, "ization")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Match = { trigger: string; mode: ResearchModeNumber; start: number; end: number; departmentRule?: boolean };

function findMatches(topic: string, normalized: string, keywords: readonly Keyword[], mode: ResearchModeNumber, departmentRule?: boolean): Match[] {
  const found: Match[] = [];
  for (const keyword of keywords) {
    if (keyword instanceof RegExp) {
      const m = keyword.exec(topic);
      // A regex match is on the original text; give it a position far from any word match.
      if (m) found.push({ trigger: m[0].trim(), mode, start: -1 - found.length, end: -1 - found.length, departmentRule });
      continue;
    }
    // Whole words only (so "gdp" never matches inside another word); a plural "s" is allowed.
    // No lookbehind: older phone browsers cannot parse it, and this module is shared with the card.
    const re = new RegExp(`(^|[^a-z0-9])(${escapeRegExp(normalizeText(keyword))}s?)(?![a-z0-9])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized))) {
      const start = m.index + m[1].length;
      found.push({ trigger: keyword, mode, start, end: start + m[2].length, departmentRule });
    }
  }
  return found;
}

/**
 * The keywords in a topic, as the card lists them. Overlapping matches for the same
 * mode count once, the longer one kept ("inflation rate" is one trigger, not two).
 * Pass the department's Table A name to include its department-only keywords (A7).
 */
export function scanTopicForModeKeywords(topic: string | null | undefined, department?: string | null): KeywordTrigger[] {
  if (!topic?.trim()) return [];
  const normalized = normalizeText(topic);
  const matches: Match[] = [];
  for (const mode of MODE_NUMBERS) matches.push(...findMatches(topic, normalized, MODE_KEYWORDS[mode], mode));
  for (const rule of DEPARTMENT_KEYWORDS) {
    if (department && rule.departments.includes(department)) matches.push(...findMatches(topic, normalized, rule.keywords, rule.mode, true));
  }
  // Longest first; drop a match that overlaps an accepted one of the same mode, and repeats of the same keyword.
  matches.sort((a, b) => b.end - b.start - (a.end - a.start));
  const accepted: Match[] = [];
  for (const m of matches) {
    const overlaps = accepted.some((a) => a.mode === m.mode && ((m.start < a.end && a.start < m.end) || a.trigger === m.trigger));
    if (!overlaps) accepted.push(m);
  }
  return accepted
    .sort((a, b) => a.mode - b.mode || a.trigger.localeCompare(b.trigger))
    .map((m) => ({ trigger: m.trigger, mode: m.mode, modeName: MODE_CODES[m.mode], ...(m.departmentRule ? { departmentRule: true } : {}) }));
}

/** The mode most keywords point to; null when there are none or two modes tie. */
export function keywordSignal(triggers: KeywordTrigger[]): { mode: ResearchModeNumber | null; tied: ResearchModeNumber[] } {
  const counts = new Map<ResearchModeNumber, number>();
  for (const t of triggers) counts.set(t.mode, (counts.get(t.mode) ?? 0) + 1);
  if (counts.size === 0) return { mode: null, tied: [] };
  const top = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([m]) => m).sort();
  return leaders.length === 1 ? { mode: leaders[0], tied: [] } : { mode: null, tied: leaders };
}

// ─── The client's answer ────────────────────────────────────────────────────

/** The intake question's options (the spec's plain-language wording lives with the form in constants.ts). */
export const ANSWER_MODE: Record<IntakeModeAnswer, ResearchModeNumber> = { A: 1, B: 2, C: 3, D: 4, E: 5 };

export function intakeAnswerToMode(answer: IntakeModeAnswer | null | undefined): ResearchModeNumber | null {
  return answer ? ANSWER_MODE[answer] : null;
}

/**
 * For projects ordered before the A–E question: a weaker reading of Project type and
 * Data requirements. "Practical" could be a build or a lab study, so it gives nothing.
 */
export function legacyIntakeMode(projectType: ProjectType | null | undefined, dataRequirements: DataRequirement | null | undefined): { mode: ResearchModeNumber; from: string } | null {
  if (projectType === "SURVEY_BASED") return { mode: 2, from: "Project type: Survey-based" };
  if (projectType === "DESIGN_BASED") return { mode: 3, from: "Project type: Design-based" };
  if (projectType === "THEORETICAL") return { mode: 1, from: "Project type: Theoretical" };
  if (dataRequirements === "SECONDARY") return { mode: 5, from: "Data requirements: Secondary" };
  return null;
}

// ─── Department ─────────────────────────────────────────────────────────────

export type DepartmentIssue = "UNKNOWN" | "GROUP" | "NO_DEFAULT";

export interface DepartmentDefault {
  entered: string | null;
  /** The Table A row's name (or the typed name when a token rule matched it). */
  matched: string | null;
  entry: DepartmentEntry | null;
  mode: ResearchModeNumber | null;
  section: SectionKey | "LAW" | null;
  lockedMode: boolean;
  /** Why there is no default: not in the table, a group label, or a department the COO decides for (A9). */
  issue: DepartmentIssue | null;
}

/** The department's default mode, from Table A (department-map.ts). */
export function getDepartmentModeDefault(department: string | null | undefined): DepartmentDefault {
  const entered = department?.trim() || null;
  const match = matchDepartment(entered);
  if (!match) return { entered, matched: null, entry: null, mode: null, section: null, lockedMode: false, issue: "UNKNOWN" };
  const { entry, displayName } = match;
  const issue: DepartmentIssue | null = entry.group ? "GROUP" : entry.defaultMode === null ? "NO_DEFAULT" : null;
  return { entered, matched: displayName, entry, mode: entry.defaultMode, section: entry.section, lockedMode: Boolean(entry.lockedMode), issue };
}

/** The modes a department may take: none for a group label, one when fixed, 1 or 2 for Law, else all five. */
export function allowedModes(entry: DepartmentEntry | null): ResearchModeNumber[] {
  if (!entry || entry.group) return [];
  if (entry.lockedMode && entry.defaultMode) return [entry.defaultMode];
  if (entry.section === "LAW") return [1, 2];
  return [...MODE_NUMBERS];
}

/** The sections the COO may choose for a department in a mode (Law's follows its mode; a fixed department keeps its own). */
export function sectionOptionsFor(entry: DepartmentEntry | null, mode: ResearchModeNumber): SectionKey[] {
  if (!entry || entry.group || entry.section === "LAW") return [];
  if (entry.lockedMode && entry.section) return [entry.section];
  return SECTION_KEYS.filter((s) => s !== "LAW_DOCTRINAL" && s !== "LAW_NON_DOCTRINAL" && SECTION_MODES[s].includes(mode));
}

/** The section the loader will use without a COO choice, or null when the COO must pick one. */
export function defaultSectionFor(entry: DepartmentEntry | null, mode: ResearchModeNumber): SectionKey | null {
  if (!entry || entry.group || !allowedModes(entry).includes(mode)) return null;
  try {
    return resolveSection(entry, mode);
  } catch (error) {
    if (error instanceof DepartmentRoutingError) return null;
    throw error;
  }
}

// ─── Classification ─────────────────────────────────────────────────────────

export interface ClassifyInput {
  /** The department to classify for: the COO's confirmed one if any, else what the client typed. */
  department: string | null;
  topic: string | null;
  answer?: IntakeModeAnswer | null;
  projectType?: ProjectType | null;
  dataRequirements?: DataRequirement | null;
}

export type RecommendedBy = "LOCKED_DEPARTMENT" | "CLIENT_ANSWER" | "KEYWORDS" | "INTAKE_FIELDS" | "DEPARTMENT_DEFAULT";

export interface ModeClassification {
  department: DepartmentDefault;
  departmentDefault: ResearchModeNumber | null;
  clientAnswer: { answer: IntakeModeAnswer; mode: ResearchModeNumber } | null;
  /** Only when there is no A–E answer. */
  intakeFields: { mode: ResearchModeNumber; from: string } | null;
  keywordTriggers: KeywordTrigger[];
  keywordMode: ResearchModeNumber | null;
  recommendedMode: ResearchModeNumber | null;
  recommendedBy: RecommendedBy | null;
  conflictDetected: boolean;
  /** Plain-English reasons, one per disagreeing signal. */
  conflicts: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  allowedModes: ResearchModeNumber[];
  /** For the recommended mode, without a COO choice; null when the COO must pick. */
  section: SectionKey | null;
  needsSectionPick: boolean;
  sectionOptions: SectionKey[];
  needsModePick: boolean;
  suggestedReferencingStyle: ReferencingStyleKey | null;
  /** Department-specific reminders (A7). */
  notes: string[];
}

export function classifyMode(input: ClassifyInput): ModeClassification {
  const department = getDepartmentModeDefault(input.department);
  const entry = department.entry;
  const allowed = allowedModes(entry);
  const departmentDefault = entry && !entry.group ? entry.defaultMode : null;

  const answerMode = intakeAnswerToMode(input.answer);
  const clientAnswer = input.answer && answerMode ? { answer: input.answer, mode: answerMode } : null;
  const intakeFields = clientAnswer ? null : legacyIntakeMode(input.projectType, input.dataRequirements);
  const keywordTriggers = scanTopicForModeKeywords(input.topic, department.matched);
  const keywords = keywordSignal(keywordTriggers);

  // Recommendation, strongest signal first. A mode the department cannot take (Law in
  // Mode 3, Accounting in anything but 5) is never recommended; it shows as a conflict.
  const takes = (mode: ResearchModeNumber) => allowed.length === 0 || allowed.includes(mode);
  let recommendedMode: ResearchModeNumber | null = null;
  let recommendedBy: RecommendedBy | null = null;
  const pick = (mode: ResearchModeNumber | null, by: RecommendedBy) => {
    if (recommendedMode === null && mode !== null && takes(mode)) {
      recommendedMode = mode;
      recommendedBy = by;
    }
  };
  if (entry?.lockedMode && entry.defaultMode) pick(entry.defaultMode, "LOCKED_DEPARTMENT");
  pick(clientAnswer?.mode ?? null, "CLIENT_ANSWER");
  pick(keywords.mode, "KEYWORDS");
  pick(intakeFields?.mode ?? null, "INTAKE_FIELDS");
  pick(departmentDefault, "DEPARTMENT_DEFAULT");
  // Assigned inside `pick`, which TypeScript's flow analysis does not follow.
  const recommended = recommendedMode as ResearchModeNumber | null;
  const by = recommendedBy as RecommendedBy | null;

  // Conflicts: every present signal that points elsewhere.
  const conflicts: string[] = [];
  const signals: { mode: ResearchModeNumber | null; label: string }[] = [
    { mode: clientAnswer?.mode ?? null, label: clientAnswer ? `The client answered ${clientAnswer.answer} (${MODE_SHORT[clientAnswer.mode]}, Mode ${clientAnswer.mode})` : "" },
    { mode: keywords.mode, label: keywords.mode ? `The topic's keywords point to ${modeTitle(keywords.mode)}` : "" },
    { mode: intakeFields?.mode ?? null, label: intakeFields ? `${intakeFields.from} suggests ${modeTitle(intakeFields.mode)}` : "" },
    { mode: departmentDefault, label: departmentDefault && department.matched ? `${department.matched} defaults to ${modeTitle(departmentDefault)}` : "" },
  ];
  for (const s of signals) {
    if (s.mode === null || s.mode === recommended) continue;
    if (!takes(s.mode)) {
      conflicts.push(
        entry?.lockedMode ? `${s.label}, but ${entry.name} is always Mode ${entry.defaultMode}.` : `${s.label}, but ${department.matched} cannot take Mode ${s.mode}.`,
      );
    } else if (recommended !== null) {
      conflicts.push(`${s.label}, not Mode ${recommended}.`);
    }
  }
  if (keywords.tied.length > 1) conflicts.push(`The topic's keywords point equally to ${keywords.tied.map((m) => `Mode ${m}`).join(" and ")}.`);

  const agreeing = recommended === null ? 0 : signals.filter((s) => s.mode === recommended).length + (by === "LOCKED_DEPARTMENT" ? 1 : 0);
  const confidence: ModeClassification["confidence"] = recommended === null || conflicts.length ? "LOW" : agreeing >= 2 ? "HIGH" : "MEDIUM";

  const section = recommended !== null ? defaultSectionFor(entry, recommended) : null;
  const sectionOptions = recommended !== null ? sectionOptionsFor(entry, recommended) : [];
  const needsSectionPick = recommended !== null && section === null && sectionOptions.length > 0;

  const notes = DEPARTMENT_KEYWORDS.filter((r) => department.matched && r.departments.includes(department.matched) && keywordTriggers.some((t) => t.departmentRule && t.mode === r.mode)).map((r) => r.note);

  return {
    department,
    departmentDefault,
    clientAnswer,
    intakeFields,
    keywordTriggers,
    keywordMode: keywords.mode,
    recommendedMode: recommended,
    recommendedBy: by,
    conflictDetected: conflicts.length > 0,
    conflicts,
    confidence,
    allowedModes: allowed,
    section,
    needsSectionPick,
    sectionOptions,
    needsModePick: recommended === null,
    suggestedReferencingStyle: entry && !entry.group ? defaultReferencingStyle(entry) : null,
    notes,
  };
}

// ─── The COO's decision ─────────────────────────────────────────────────────

export interface ModeDecision {
  department: string;
  modeNumber: number;
  /** The COO's section choice; null/absent = the department's own. */
  section?: SectionKey | null;
  referencingStyle: string;
  customStyleText?: string | null;
  citationPlacement?: CitationPlacement | null;
  thematicTitles?: { chapter3?: string | null; chapter4?: string | null } | null;
  samples?: { nonHuman?: boolean | null; description?: string | null } | null;
}

export type ValidDecision = {
  ok: true;
  entry: DepartmentEntry;
  department: string;
  mode: ResearchModeNumber;
  section: SectionKey;
  template: "A" | "B";
  referencingStyle: ReferencingStyleKey;
};

export const THEMATIC_TITLE_MAX = 200;

/**
 * Whether a decision can be saved or approved, with every problem in plain language.
 * The same rules the D1 loader applies, so an approved mode always assembles.
 */
export function validateModeDecision(d: ModeDecision): ValidDecision | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const match = matchDepartment(d.department);
  if (!match) problems.push(`"${d.department}" is not in the department list. Pick the department from the list.`);
  else if (match.entry.group) problems.push(`"${match.entry.name}" is not a department. Pick the exact department.`);

  if (!isModeNumber(d.modeNumber)) problems.push("Pick a mode from 1 to 5.");

  let section: SectionKey | null = null;
  if (match && !match.entry.group && isModeNumber(d.modeNumber)) {
    const mode = d.modeNumber;
    const allowed = allowedModes(match.entry);
    if (!allowed.includes(mode)) {
      problems.push(
        match.entry.lockedMode
          ? `${match.entry.name} is always Mode ${allowed[0]}.`
          : `${match.displayName} cannot take Mode ${mode} (allowed: ${allowed.map((m) => `Mode ${m}`).join(", ")}).`,
      );
    } else {
      try {
        section = resolveSection(match.entry, mode, d.section ?? null);
      } catch (error) {
        if (!(error instanceof DepartmentRoutingError)) throw error;
        const options = sectionOptionsFor(match.entry, mode);
        problems.push(
          d.section
            ? error.message
            : `Pick the section for a ${modeTitle(mode)} project in ${match.displayName}: ${orList(options.map(sectionLabel))}.`,
        );
      }
    }
  }

  const style = d.referencingStyle;
  if (!isReferencingStyleKey(style)) problems.push("Pick a referencing style.");
  else if (style === "CHICAGO") problems.push("Pick Chicago author-date or Chicago notes-bibliography.");
  else if (style === "CUSTOM" && !d.customStyleText?.trim()) problems.push("Enter the supervisor's referencing format for a Custom style.");

  const template: "A" | "B" = d.modeNumber === 1 ? "B" : "A";
  if (d.citationPlacement != null) {
    if (!CITATION_PLACEMENTS.includes(d.citationPlacement)) problems.push("Pick a citation placement from the list.");
    else if (section && isReferencingStyleKey(style) && style !== "CHICAGO") {
      const placement = citationPlacementFor(style, template, section, d.citationPlacement);
      if ("refused" in placement) problems.push(placement.refused);
    }
  }

  if (d.modeNumber === 1) {
    const t3 = d.thematicTitles?.chapter3?.trim();
    const t4 = d.thematicTitles?.chapter4?.trim();
    if (!t3 || !t4) problems.push("Enter the Chapter 3 and Chapter 4 titles for a Mode 1 (thematic) report.");
  }
  for (const [label, value] of [
    ["Chapter 3 title", d.thematicTitles?.chapter3],
    ["Chapter 4 title", d.thematicTitles?.chapter4],
  ] as const) {
    if (value && value.trim().length > THEMATIC_TITLE_MAX) problems.push(`The ${label} is longer than ${THEMATIC_TITLE_MAX} characters.`);
  }

  if (problems.length || !match || !section || !isModeNumber(d.modeNumber) || !isReferencingStyleKey(style)) {
    return { ok: false, problems: problems.length ? problems : ["The decision is incomplete."] };
  }
  return { ok: true, entry: match.entry, department: match.displayName, mode: d.modeNumber, section, template, referencingStyle: style };
}

/**
 * What a saved (not yet approved) choice needs: a real department, a mode it can take,
 * a known style, and a section or placement that fits if one is given. Titles, a custom
 * format and a missing section can wait: the card lists them until approval.
 */
export function validateModeDraft(d: ModeDecision): string[] {
  const problems: string[] = [];
  const match = matchDepartment(d.department);
  if (!match) problems.push(`"${d.department}" is not in the department list. Pick the department from the list.`);
  else if (match.entry.group) problems.push(`"${match.entry.name}" is not a department. Pick the exact department.`);
  if (!isModeNumber(d.modeNumber)) problems.push("Pick a mode from 1 to 5.");
  if (match && !match.entry.group && isModeNumber(d.modeNumber)) {
    const allowed = allowedModes(match.entry);
    if (!allowed.includes(d.modeNumber)) {
      problems.push(match.entry.lockedMode ? `${match.entry.name} is always Mode ${allowed[0]}.` : `${match.displayName} cannot take Mode ${d.modeNumber}.`);
    } else if (d.section) {
      try {
        resolveSection(match.entry, d.modeNumber, d.section);
      } catch (error) {
        if (!(error instanceof DepartmentRoutingError)) throw error;
        problems.push(error.message);
      }
    }
  }
  if (!isReferencingStyleKey(d.referencingStyle) || d.referencingStyle === "CHICAGO") problems.push("Pick a referencing style from the list.");
  if (d.citationPlacement != null && !CITATION_PLACEMENTS.includes(d.citationPlacement)) problems.push("Pick a citation placement from the list.");
  return problems;
}

/** "A", "A or B", "A, B or C". */
export function orList(items: string[]): string {
  return items.length <= 2 ? items.join(" or ") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** "COMPUTER_SCIENCE" → "Computer Science". */
export function sectionLabel(section: SectionKey): string {
  return section
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
