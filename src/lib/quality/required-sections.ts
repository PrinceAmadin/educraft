/**
 * Phase D8 Layer 3 (ST3–ST7): the sections each chapter must have, by prompt
 * section and research mode. Transcribed from the chapter prompt files' own
 * [DEPARTMENT: X] numbered section lists (prompts/chapter-N/*.docx); sections
 * the prompts mark "(if applicable)", "(optional)", "(PGD projects)" or "(where
 * applicable)", bare "Introduction" and "Summary" lines, and [bracketed]
 * content-named sections are not required. Matched by key words on the chapter's
 * H2/H3 headings, never by number. `npm run check:quality` checks every entry
 * here still matches a heading line in its prompt block. Pure.
 */

import type { SectionKey } from "@/lib/generation/department-map";

export interface RequiredSection {
  label: string;
  /** Tried against each H2 and H3 heading of the chapter. */
  match: RegExp;
  /** A missing Ethical Considerations section in Nursing and Medical is CRITICAL (Structural Quality v1.1). */
  critical?: boolean;
}

export interface SectionContext {
  mode: number | null;
  /** Table A pure / lab science (non-human samples; Results and Discussion combined in Mode 4). */
  pureScience: boolean;
  /** Chapter One states hypotheses: the chapters that test them "if stated" must then have that section. */
  hasHypotheses: boolean;
}

/** THEMATIC: a Template B thematic chapter, judged by its approved title and at least three sections. */
export type ChapterRequirement = RequiredSection[] | "THEMATIC";

const R = (label: string, match: RegExp, extra: Partial<RequiredSection> = {}): RequiredSection => ({ label, match, ...extra });

// Chapter One
const BACKGROUND = R("Background of the Study", /background/i);
const PROBLEM = R("Statement of the Problem", /statement of (?:the )?(?:research )?problem|problem statement|research problem/i);
const OBJECTIVES = R("Objectives of the Study", /objective/i);
const AIM = R("Aim of the Study", /\baims?\b|purpose/i);
const RQ = R("Research Questions", /research questions?/i);
const HYPOTHESES = R("Research Hypotheses", /hypothes[ie]s/i);
const RQ_OR_HYP = R("Research Questions / Hypothesis", /research questions?|hypothes[ie]s/i);
const SIGNIFICANCE = R("Significance of the Study", /significance/i);
const SCOPE = R("Scope of the Study", /scope|delimitation/i);
const DEFINITIONS = R("Definition of Terms", /definitions? of (?:key |operational )?terms|operational definitions?|terms? defined/i);
const OUTLINE = R("Outline of the Project", /outline|organi[sz]ation of the|structure of the (?:study|report|project)/i);
const GAP_JUSTIFICATION = R("Gap in Knowledge / Justification of the Study", /gap in knowledge|justification|rationale/i);
const METHODOLOGY_BRIEF = R("Research Methodology", /methodology|research method/i);
const LITERATURE_BRIEF = R("Literature Review", /literature|related (?:works|studies)/i);

// Chapter Two
const CONCEPTUAL = R("Conceptual Review", /conceptual/i);
const THEORETICAL = R("Theoretical Framework / Review", /theor(?:etical|y|ies)/i);
const EMPIRICAL = R("Empirical Review / Review of Related Studies", /empirical|related (?:works|studies)|review of related|previous studies/i);
const GAP_OR_SUMMARY = R("Research Gap / Summary", /gap|summary/i);
const GAP = R("Research Gap", /gap/i);
const EXISTING_SYSTEMS = R("Review of Existing Systems / Related Works", /existing systems?|related works?|related systems/i);
const TOOLS = R("Tools, Languages and Technologies", /tools|languages?|technolog/i);
const DESIGN_METHODOLOGY = R("Theoretical Framework / Design Methodology", /theoretical|design methodology|methodolog/i);
const SUMMARY_TRANSITION = R("Summary and Transition to Thematic Chapters", /summary|transition|conclusion/i);

// Chapter Three
const RESEARCH_DESIGN = R("Research Design", /design/i);
const AREA = R("Area of the Study", /study area|area of (?:the )?study|setting|study site|location/i);
const POPULATION = R("Population of the Study", /population/i);
const SAMPLE_SIZE = R("Sample Size", /sample size/i);
const SAMPLING = R("Sample and Sampling Technique", /sampl/i);
const INSTRUMENT = R("Instrument for Data Collection", /instrument|questionnaire/i);
const VALIDITY = R("Validity of the Instrument", /validity/i);
const RELIABILITY = R("Reliability of the Instrument", /reliability/i);
const VALIDITY_RELIABILITY = R("Validity and Reliability", /validity|reliability/i);
const DATA_COLLECTION = R("Method of Data Collection", /data collection|collection of data|administration of (?:the )?instrument|collection procedure/i);
const DATA_ANALYSIS = R("Method of Data Analysis", /data analysis|analysis of data|method of analysis|analytical|statistical analysis/i);
const ETHICS = R("Ethical Considerations", /ethic/i);
const ETHICS_CRITICAL = R("Ethical Considerations", /ethic/i, { critical: true });
const INCLUSION = R("Inclusion and Exclusion Criteria", /inclusion|exclusion|eligibility/i);
const LAB_ANALYSIS = R("Laboratory Analysis", /laborator|assay|analysis of (?:the )?samples|sample (?:collection|processing)/i);
const SAMPLE_COLLECTION = R("Sample Collection and Processing", /sample (?:collection|processing)|collection of (?:the )?samples|sampling/i);
const STATISTICAL = R("Statistical Analysis", /statistical|data analysis/i);
const BLOCK_DIAGRAM = R("Block Diagram of the System", /block diagram|flow ?chart|system architecture/i);
const DESIGN_OR_FLOW = R("Design / Flowchart of the Work", /design|flow ?chart|block diagram/i);
const CALCULATIONS = R("Design Calculations", /calculation/i);
const IMPLEMENTATION_ENG = R("Design Implementation", /implementation|schematic|circuit|construction|fabrication/i);
const WORKING_PRINCIPLE = R("Working Principle", /working principle|principle of operation|mode of operation/i);
const BEME = R("Bill of Engineering Measurement and Evaluation", /bill of engineering|\bbeme\b|bill of materials/i);
const TESTING = R("Testing and Measurements", /test|measurement/i);
const SYSTEM_DESIGN = R("System Design", /system design|design of the (?:proposed )?system|architecture/i);
const DATABASE = R("Database Design", /database/i);
const LANGUAGE = R("Choice of Programming Language / Development Environment", /programming language|language|development environment|tools/i);
const REQUIREMENTS = R("System Requirements", /requirement/i);
const IMPLEMENTATION = R("System Implementation", /implementation/i);
const THEORY_ECON = R("Theoretical Framework", /theoretical/i);
const MODEL_SPEC = R("Model Specification", /model specification|specification of (?:the )?model/i);
const DATA_SOURCE = R("Source of Data", /sources? of data|data sources?|nature and source/i);
const ESTIMATION = R("Estimation Technique", /estimation/i);
const EXPERIMENTAL_DESIGN = R("Experimental Design", /design/i);
const MATERIALS = R("Materials Used", /material/i);
const FIELD_LAYOUT = R("Field Layout and Treatment Application", /layout|treatment/i);
const MEASUREMENT = R("Data Collection Parameters and Measurement", /data collection|parameters|measurement/i);

// Chapter Four
const RESULTS = R("Results", /result|effect of/i);
const PERFORMANCE = R("Performance Analysis / Evaluation", /performance|evaluation|analysis/i);
const DISCUSSION = R("Discussion of Findings", /discussion/i);
const DEMOGRAPHIC = R("Socio-Demographic Profile of Respondents", /demographic|characteristics of (?:the )?(?:study )?(?:respondents|participants|subjects)/i);
const DESCRIPTIVE = R("Descriptive Statistics", /descriptive/i);
const RELIABILITY_TEST = R("Reliability Test Results", /reliability/i);
const RQ_ANALYSIS = R("Analysis of Research Questions", /research questions?/i);
const HYPOTHESES_TESTING = R("Hypotheses Testing", /hypothes[ie]s/i);
const KEY_FINDINGS = R("Summary of Major Findings", /summary/i);
const PRE_ESTIMATION = R("Pre-Estimation Tests", /pre-?estimation|unit root|stationarity|diagnostic/i);
const ESTIMATION_RESULTS = R("Model Estimation Results", /estimation|regression|model results/i);
const TESTING_APPROACH = R("System Testing Approach", /testing|test/i);
const UNIT_TESTING = R("Unit Testing", /unit test/i);
const INTEGRATION_TESTING = R("Integration Testing", /integration/i);
const SYSTEM_TESTING = R("System / Acceptance Testing", /system test|acceptance/i);
const PERFORMANCE_EVAL = R("Performance Evaluation", /performance/i);

// Chapter Five
const SUMMARY = R("Summary of Findings", /summary/i);
const CONCLUSION = R("Conclusion", /conclusion/i);
const RECOMMENDATIONS = R("Recommendations", /recommendation/i);
const LIMITATIONS = R("Limitations of the Study", /limitation/i);
const FURTHER = R("Suggestions for Further Study", /further (?:study|studies|research|work|investigation)|future (?:work|research|studies)/i);
const IMPLICATIONS = R("Educational Implications", /implication/i);

/** The sections chapter `chapter` of section `section` must have (null = nothing required beyond the chapter itself). */
export function requiredSections(section: SectionKey, chapter: number, ctx: SectionContext): ChapterRequirement | null {
  const hyp = ctx.hasHypotheses ? [HYPOTHESES_TESTING] : [];
  const combined = ctx.pureScience && section === "MEDICAL_SCIENCE" && ctx.mode === 4;
  const human = !(ctx.pureScience && section === "MEDICAL_SCIENCE");
  switch (chapter) {
    case 1:
      switch (section) {
        case "ENGINEERING":
          return [BACKGROUND, PROBLEM, SIGNIFICANCE, OBJECTIVES, SCOPE, OUTLINE];
        case "MEDICAL_SCIENCE":
          return [BACKGROUND, PROBLEM, GAP_JUSTIFICATION, AIM, OBJECTIVES, RQ, HYPOTHESES, SIGNIFICANCE, SCOPE, DEFINITIONS];
        case "NURSING":
          return [BACKGROUND, PROBLEM, OBJECTIVES, RQ_OR_HYP, SIGNIFICANCE, SCOPE, DEFINITIONS];
        case "COMPUTER_SCIENCE":
          return [BACKGROUND, PROBLEM, OBJECTIVES, SIGNIFICANCE, SCOPE, DEFINITIONS];
        case "BUSINESS":
        case "ECONOMICS":
          return [BACKGROUND, PROBLEM, RQ, OBJECTIVES, HYPOTHESES, SIGNIFICANCE, SCOPE, DEFINITIONS];
        case "LAW_DOCTRINAL":
          return [BACKGROUND, PROBLEM, OBJECTIVES, RQ, SIGNIFICANCE, SCOPE, METHODOLOGY_BRIEF, LITERATURE_BRIEF];
        case "LAW_NON_DOCTRINAL":
          return [BACKGROUND, PROBLEM, OBJECTIVES, RQ, SIGNIFICANCE, SCOPE];
        case "HUMANITIES":
          return [BACKGROUND, OBJECTIVES, SIGNIFICANCE, SCOPE, METHODOLOGY_BRIEF, LITERATURE_BRIEF];
        case "EDUCATION":
          return [BACKGROUND, PROBLEM, AIM, OBJECTIVES, RQ, SIGNIFICANCE, SCOPE, DEFINITIONS];
        case "AGRICULTURE":
          return [BACKGROUND, PROBLEM, OBJECTIVES, SIGNIFICANCE, SCOPE, DEFINITIONS];
      }
      break;
    case 2:
      switch (section) {
        case "ENGINEERING":
          return [GAP];
        case "MEDICAL_SCIENCE":
        case "NURSING":
        case "BUSINESS":
        case "EDUCATION":
        case "LAW_DOCTRINAL":
          return [CONCEPTUAL, THEORETICAL, EMPIRICAL, GAP_OR_SUMMARY];
        case "LAW_NON_DOCTRINAL":
          return [CONCEPTUAL, THEORETICAL, EMPIRICAL, GAP];
        case "COMPUTER_SCIENCE":
          return [CONCEPTUAL, EXISTING_SYSTEMS, TOOLS, DESIGN_METHODOLOGY, GAP_OR_SUMMARY];
        case "ECONOMICS":
          return [CONCEPTUAL, EMPIRICAL, THEORETICAL, GAP];
        case "HUMANITIES":
          return [THEORETICAL, SUMMARY_TRANSITION];
        case "AGRICULTURE":
          return [CONCEPTUAL, EMPIRICAL, GAP_OR_SUMMARY];
      }
      break;
    case 3:
      switch (section) {
        case "ENGINEERING":
          return ctx.mode === 4 ? [DESIGN_OR_FLOW, CALCULATIONS, WORKING_PRINCIPLE, BEME, TESTING] : [BLOCK_DIAGRAM, CALCULATIONS, IMPLEMENTATION_ENG, WORKING_PRINCIPLE, BEME, TESTING];
        case "MEDICAL_SCIENCE":
          if (!human) return [RESEARCH_DESIGN, AREA, SAMPLE_COLLECTION, LAB_ANALYSIS, STATISTICAL];
          return ctx.mode === 4
            ? [RESEARCH_DESIGN, AREA, POPULATION, SAMPLE_SIZE, SAMPLING, INCLUSION, ETHICS_CRITICAL, DATA_COLLECTION, LAB_ANALYSIS, STATISTICAL]
            : [RESEARCH_DESIGN, AREA, POPULATION, SAMPLE_SIZE, SAMPLING, ETHICS_CRITICAL, DATA_COLLECTION, STATISTICAL];
        case "NURSING":
          return [RESEARCH_DESIGN, AREA, POPULATION, SAMPLE_SIZE, SAMPLING, INSTRUMENT, VALIDITY, RELIABILITY, DATA_COLLECTION, DATA_ANALYSIS, ETHICS_CRITICAL];
        case "COMPUTER_SCIENCE":
          return [SYSTEM_DESIGN, DATABASE, LANGUAGE, REQUIREMENTS, IMPLEMENTATION];
        case "BUSINESS":
          return [RESEARCH_DESIGN, POPULATION, SAMPLING, INSTRUMENT, VALIDITY_RELIABILITY, DATA_COLLECTION, DATA_ANALYSIS];
        case "ECONOMICS":
          return [THEORY_ECON, MODEL_SPEC, DATA_ANALYSIS, DATA_SOURCE, ESTIMATION];
        case "AGRICULTURE":
          return [AREA, EXPERIMENTAL_DESIGN, MATERIALS, FIELD_LAYOUT, MEASUREMENT, STATISTICAL];
        case "EDUCATION":
          return [RESEARCH_DESIGN, AREA, POPULATION, SAMPLING, INSTRUMENT, VALIDITY, RELIABILITY, DATA_COLLECTION, DATA_ANALYSIS];
        case "LAW_NON_DOCTRINAL":
          return [RESEARCH_DESIGN, POPULATION, SAMPLING, INSTRUMENT, VALIDITY_RELIABILITY, DATA_COLLECTION, DATA_ANALYSIS, ETHICS];
        case "HUMANITIES":
        case "LAW_DOCTRINAL":
          return "THEMATIC";
      }
      break;
    case 4:
      switch (section) {
        case "ENGINEERING":
          return ctx.mode === 4 ? [RESULTS, DISCUSSION] : [RESULTS, PERFORMANCE, DISCUSSION];
        case "MEDICAL_SCIENCE":
          if (combined) return [RESULTS, DISCUSSION];
          return human ? [DEMOGRAPHIC, KEY_FINDINGS] : [KEY_FINDINGS];
        case "NURSING":
        case "EDUCATION":
          return [RQ_ANALYSIS, ...hyp, KEY_FINDINGS];
        case "COMPUTER_SCIENCE":
          return [TESTING_APPROACH, UNIT_TESTING, INTEGRATION_TESTING, SYSTEM_TESTING, PERFORMANCE_EVAL, DISCUSSION];
        case "BUSINESS":
          return [DEMOGRAPHIC, DESCRIPTIVE, RELIABILITY_TEST, RQ_ANALYSIS, HYPOTHESES_TESTING, DISCUSSION];
        case "ECONOMICS":
          return [DESCRIPTIVE, PRE_ESTIMATION, ESTIMATION_RESULTS, DISCUSSION];
        case "AGRICULTURE":
          return [RESULTS];
        case "LAW_NON_DOCTRINAL":
          return [DEMOGRAPHIC, RQ_ANALYSIS, ...hyp, DISCUSSION];
        case "HUMANITIES":
        case "LAW_DOCTRINAL":
          return "THEMATIC";
      }
      break;
    case 5:
      switch (section) {
        case "MEDICAL_SCIENCE":
          return combined ? [SUMMARY, CONCLUSION, RECOMMENDATIONS] : [DISCUSSION, CONCLUSION, RECOMMENDATIONS, LIMITATIONS, FURTHER];
        case "EDUCATION":
          return [SUMMARY, CONCLUSION, IMPLICATIONS, RECOMMENDATIONS, LIMITATIONS, FURTHER];
        case "HUMANITIES":
        case "LAW_DOCTRINAL":
        case "LAW_NON_DOCTRINAL":
          return [CONCLUSION, RECOMMENDATIONS];
        default:
          return [SUMMARY, CONCLUSION, RECOMMENDATIONS, LIMITATIONS, FURTHER];
      }
  }
  return null;
}

/**
 * Medical (not the combined pure-science chapter): Chapter Four is results only,
 * the discussion belongs to Chapter Five. A Discussion section there is a failure.
 */
export function forbidsDiscussionInChapterFour(section: SectionKey, ctx: SectionContext): boolean {
  return section === "MEDICAL_SCIENCE" && !(ctx.pureScience && ctx.mode === 4);
}
