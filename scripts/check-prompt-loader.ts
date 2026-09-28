/**
 * Phase D1: the prompt loader and the department table, proven without a database or
 * any Claude call. `npm run check:prompts` (add `-- --print` to print the Electrical
 * Engineering Chapter 1 prompt in full). Full sample prompts are written to
 * scripts/tmp/prompt-samples/ (git-ignored) for reading.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CHAPTER_LIMIT_MESSAGE, MAX_REPORT_CHAPTERS, deliverableTemplate } from "../src/lib/deliverables";
import { intakeSubmitSchema } from "../src/lib/validations/intake";
import { intakeEditSchema } from "../src/lib/validations/intake-edit";
import {
  DEGREE_NAMES,
  DEPARTMENTS,
  defaultReferencingStyle,
  degreeName,
  getDegreeFromDepartment,
  lookupDepartment,
  matchDepartment,
  resolveSection,
  type ResearchModeNumber,
  type SectionKey,
} from "../src/lib/generation/department-map";
import {
  BLOCK_GAP,
  LOADER_TEXT,
  describePromptLibrary,
  extractDepartmentSection,
  getModeInstructions,
  loadChapterPrompt,
  loadPromptLibrary,
  splitPromptBlocks,
  type ChapterNumber,
  type ChapterPromptInput,
} from "../src/lib/generation/prompt-loader";

let failures = 0;
let passes = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const a = JSON.stringify(actual);
  const w = JSON.stringify(wanted);
  if (a !== w) {
    failures++;
    console.log(`FAIL ${label}\n     got    ${a}\n     wanted ${w}`);
  } else passes++;
}
const has = (label: string, text: string, needle: string | RegExp) => expect(label, typeof needle === "string" ? text.includes(needle) : needle.test(text), true);
const lacks = (label: string, text: string, needle: string | RegExp) => expect(label, typeof needle === "string" ? text.includes(needle) : needle.test(text), false);
async function refuses(label: string, run: () => unknown, message: RegExp) {
  try {
    await run();
    failures++;
    console.log(`FAIL ${label}\n     expected an error matching ${message}, got none`);
  } catch (err) {
    const m = (err as Error).message;
    if (message.test(m)) passes++;
    else {
      failures++;
      console.log(`FAIL ${label}\n     error was: ${m}\n     wanted:    ${message}`);
    }
  }
}

// Test fixtures only — not a real project or real papers.
const REFERENCES: ChapterPromptInput["references"] = [
  { title: "Design of an IoT-Based Smart Energy Meter for Prepaid Billing", proposedTitle: "", authors: "Okafor, C.; Bello, A.", year: 2021, journal: "Journal of Electrical Systems", doi: "10.1000/qa.test.1", abstract: "A prepaid energy meter built on an ESP32 microcontroller was tested in 20 homes; billing error stayed under 2%." },
  { title: "Load Profiling of Residential Buildings in Southern Nigeria", proposedTitle: "", authors: "Adeyemi, T.; Musa, K.; Eze, O.", year: 2019, journal: "Energy Reports", doi: "10.1000/qa.test.2", abstract: "Hourly load data from 45 households show evening peaks of 1.8 kW." },
  { title: "Low-Cost Current Sensing for Smart Metering", proposedTitle: "", authors: "Nwosu, P.", year: 2023, journal: null, doi: null, abstract: null },
];
const PROJECT: ChapterPromptInput["project"] = {
  projectTitle: "Design and Implementation of an IoT-Based Smart Energy Meter for Residential Buildings",
  university: "University of Benin",
  supervisorName: "Dr. A. Okafor",
  hodName: null,
  matricNumber: null,
  projectPartners: null,
  projectType: "PRACTICAL",
  specialInstructions: "Chapter-based order: Chapter 1 only, not the full report.\n\nUse Nigerian examples throughout.",
  minimumPages: "85",
  referencingStyle: "APA_7TH",
};
const EARLIER = { objectives: ["To design the meter", "To test its accuracy"], researchQuestions: ["How accurate is the meter?"], hypotheses: [] };
const TITLES = { chapter3: "The Doctrine of Legitimate Expectation in Nigerian Courts", chapter4: "Judicial Review After 1999" };

type InputOverrides = Omit<Partial<ChapterPromptInput>, "project"> & { project?: Partial<ChapterPromptInput["project"]> };
function input(over: InputOverrides = {}): ChapterPromptInput {
  const { project, ...rest } = over;
  return {
    chapter: 1,
    department: "Electrical and Electronic Engineering",
    mode: 3,
    references: REFERENCES,
    fromEarlierChapters: EARLIER,
    thematicTitles: TITLES,
    ...rest,
    project: { ...PROJECT, ...project },
  };
}

const TOKEN = /\{[A-Z][A-Z0-9_]*\}/;
const SHARED_HEADINGS = ["# EDUCRAFT VOICE RULES", "# EDUCRAFT FORMATTING RULES", "# EDUCRAFT ANTI-AI RULES", "# EDUCRAFT REFERENCE RULES"];
const PLACEHOLDER_RULE = "[FIGURE PLACEHOLDER: description of figure needed]";
const SAMPLES_DIR = path.join(process.cwd(), "scripts", "tmp", "prompt-samples");

function sharedFilesPresent(label: string, text: string) {
  for (const h of SHARED_HEADINGS) {
    if (!text.includes(h)) {
      failures++;
      console.log(`FAIL ${label}: shared rules file "${h}" is MISSING from the assembled prompt`);
    } else passes++;
  }
}

async function sample(name: string, over: InputOverrides) {
  const p = await loadChapterPrompt(input(over));
  await writeFile(path.join(SAMPLES_DIR, `${name}.txt`), p.text);
  return p;
}

async function main() {
  await mkdir(SAMPLES_DIR, { recursive: true });

  // ── The library: file names, tags, one read ─────────────────────────────────────────────
  const t0 = Date.now();
  const [lib, again] = await Promise.all([loadPromptLibrary(), loadPromptLibrary()]);
  const firstLoadMs = Date.now() - t0;
  expect("the library is read once and shared by concurrent callers", lib === again && (await loadPromptLibrary()) === lib, true);
  const files = await describePromptLibrary();
  console.log(`Prompt library loaded in ${firstLoadMs} ms:`);
  for (const f of files) {
    const depts = f.blocks.filter((b) => b.startsWith("DEPARTMENT: ")).map((b) => b.slice(12));
    console.log(`  chapter-${f.chapter}/${f.fileName} — ${depts.length} department blocks: ${depts.join(", ")}`);
  }
  const faculty = ["ENGINEERING", "MEDICAL_SCIENCE", "NURSING", "COMPUTER_SCIENCE", "BUSINESS", "ECONOMICS", "LAW_NON_DOCTRINAL", "HUMANITIES", "EDUCATION", "AGRICULTURE"];
  for (const f of files) {
    const law = f.chapter === 3 ? "DEPARTMENT: LAW_DOCTRINAL_CH3" : "DEPARTMENT: LAW_DOCTRINAL";
    expect(`chapter ${f.chapter} has every faculty section`, faculty.filter((t) => !f.blocks.includes(`DEPARTMENT: ${t}`)), []);
    expect(`chapter ${f.chapter} has its doctrinal Law section`, f.blocks.includes(law), true);
    expect(`chapter ${f.chapter} has SHARED`, f.blocks.includes("SHARED: ALL DEPARTMENTS"), true);
  }
  expect("(ALL MODES) rule groups found above the routing header: chapters 4 and 5 only", files.map((f) => f.allModesRules), [0, 0, 0, 1, 1]);
  expect("Template B blocks sit where expected", [
    files[2].blocks.includes("DEPARTMENT: TEMPLATE_B_THEMATIC"),
    files[3].blocks.includes("DEPARTMENT: TEMPLATE_B_THEMATIC_CH4"),
    files[4].blocks.includes("DEPARTMENT: TEMPLATE_B_THEMATIC_CH5"),
    files[4].blocks.includes("DEPARTMENT: TEMPLATE_B_CONCLUSION"),
    files[0].blocks.includes("TEMPLATE B — CITATION MODE BLOCKS"),
    files[0].blocks.includes("TEMPLATE B — QUALITY GATE RULES"),
  ], [true, true, true, true, true, true]);
  expect("every chapter has all five mode blocks", await Promise.all(([1, 2, 3, 4, 5] as const).map(async (c) => (await Promise.all(([1, 2, 3, 4, 5] as const).map((m) => getModeInstructions(c, m)))).every((t) => /^MODE [1-5] — /.test(t)))), [true, true, true, true, true]);
  expect("extractDepartmentSection finds ENGINEERING in chapter 1", (await extractDepartmentSection(1, "ENGINEERING"))?.startsWith("ENGINEERING"), true);

  // ── The founder's D1 test: Chapter 1, "Electrical Engineering", Mode 3 ──────────────────
  const eee = await sample("ch1-electrical-engineering-mode3", { chapter: 1, department: "Electrical Engineering", mode: 3 });
  expect("'Electrical Engineering' resolves to the EEE row and the ENGINEERING section", [eee.department, eee.section, eee.template], ["Electrical and Electronic Engineering", "ENGINEERING", "A"]);
  has("Ch1 EEE: [DEPARTMENT: ENGINEERING] section present", eee.text, "[DEPARTMENT: ENGINEERING]");
  has("Ch1 EEE: Mode 3 instructions present", eee.text, "MODE 3 — IMPLEMENTATION");
  has("Ch1 EEE: voice_rules.md content present", eee.text, "THE FIVE CORE PRINCIPLES");
  sharedFilesPresent("Ch1 EEE", eee.text);
  has("Ch1 EEE: C1 precedence sentence present", eee.text, LOADER_TEXT.modePrecedence);
  lacks("Ch1 EEE: no other department section", eee.text, /\[DEPARTMENT: (?!ENGINEERING\])/);
  lacks("Ch1 EEE: no other mode block", eee.text, /^MODE [1245] — /m);
  lacks("Ch1 EEE: no image rules in Chapter 1", eee.text, PLACEHOLDER_RULE);
  lacks("Ch1 EEE: no unfilled placeholder", eee.text, TOKEN);
  has("Ch1 EEE: report page target filled", eee.text, "85 pages — Total report page target");
  has("Ch1 EEE: client text kept", eee.text, "Use Nigerian examples throughout.");
  lacks("Ch1 EEE: the system's 'Chapter-based order' line is not shown as a client instruction", eee.text, "Chapter-based order: Chapter 1 only");
  has("Ch1 EEE: optional HOD defaults (B1)", eee.text, "Not provided — Head of Department name");
  has("Ch1 EEE: in-text citation rule for APA", eee.text, LOADER_TEXT.inTextCitationBlock);
  has("Ch1 EEE: approved in-text placement wording", eee.text, "Not applicable — in-text citations with a References list");
  has("Ch1 EEE: references listed in APA", eee.text, "Okafor, C., & Bello, A. (2021). Design of an IoT-Based Smart Energy Meter for Prepaid Billing. Journal of Electrical Systems. https://doi.org/10.1000/qa.test.1");

  // ── Required prompt 2: Chapter 2, Economics, Mode 5 ─────────────────────────────────────
  const eco = await sample("ch2-economics-mode5", { chapter: 2, department: "Economics", mode: 5 });
  expect("Ch2 Economics routes to ECONOMICS", [eco.section, eco.template], ["ECONOMICS", "A"]);
  has("Ch2 Economics: [DEPARTMENT: ECONOMICS]", eco.text, "[DEPARTMENT: ECONOMICS]");
  has("Ch2 Economics: Mode 5 instructions", eco.text, "MODE 5 — SECONDARY DATA / QUANTITATIVE MODELLING");
  has("Ch2 Economics: the all-modes Five Laws reminder", eco.text, "THE FIVE LAWS OF CHAPTER TWO");
  sharedFilesPresent("Ch2 Economics", eco.text);
  has("Ch2 Economics: image rules included", eco.text, "═══ IMAGE RULES ═══");
  has("Ch2 Economics: exact figure placeholder instruction (C3)", eco.text, LOADER_TEXT.figurePlaceholder);
  const imagePart = eco.chapterBlock.slice(eco.chapterBlock.indexOf("═══ IMAGE RULES ═══"));
  lacks("Ch2 image rules: they are the last part of the chapter block", imagePart.slice(3), "═══ ");
  lacks("Ch2 image rules: no instruction to search, download or embed (apart from the ban itself)", imagePart.replace(LOADER_TEXT.noImageSearch, ""), /\b(search\w*|download\w*|embed\w*)\b/i);
  lacks("Ch2 image rules: the 'never insert a placeholder' rule is gone", imagePart, /Never insert a placeholder/i);
  has("Ch2 image rules: the content-driven judgement is kept", imagePart, "THE CORE PRINCIPLE");
  has("Ch2 image rules: 'If yes' keeps its first clause", imagePart, "If yes — the agent determines what image would be most useful.");
  has("Ch2 image rules: the agent-made chart line is kept", imagePart, "a chart or graph derived from the reviewed data");
  lacks("Ch2 Economics: no unfilled placeholder", eco.text, TOKEN);

  // ── Required prompt 3: Chapter 3, Law Doctrinal, Mode 1 ────────────────────────────────
  const law = await sample("ch3-law-doctrinal-mode1", { chapter: 3, department: "Law", mode: 1, project: { referencingStyle: "NALT" } });
  expect("Ch3 Law: doctrinal, Template B, NALT footnotes", [law.section, law.template, law.referencingStyle, law.citationPlacement], ["LAW_DOCTRINAL", "B", "NALT", "MODE_C"]);
  has("Ch3 Law: the five-chapter note overrides the Law section's six chapters", law.text, LOADER_TEXT.fiveChapters);
  has("Ch3 Law: court cases only from the list, else the last-resort placeholder", law.text, LOADER_TEXT.primarySourcesRule("case"));
  expect("Ch3 Law: blocks used", law.blocksUsed.filter((b) => b.startsWith("ch3:")).slice(0, 4), ["ch3:MODE 1", "ch3:SHARED", "ch3:TEMPLATE_B_THEMATIC", "ch3:LAW_DOCTRINAL_CH3"]);
  expect("Ch3 Law: TEMPLATE_B_THEMATIC comes before the Law section that says 'above'", law.text.indexOf("[DEPARTMENT: TEMPLATE_B_THEMATIC]") < law.text.indexOf("[DEPARTMENT: LAW_DOCTRINAL_CH3]"), true);
  has("Ch3 Law: Template B quality gate", law.text, "QB1: No 'Methodology' chapter");
  has("Ch3 Law: MODE C citation block with the NALT repeat rule", law.text, "NALT Law Projects (NALT + MODE C)");
  has("Ch3 Law: NALT defined from the Chapter 1 prompt", law.text, "NALT — Law Doctrinal (footnotes + bibliography — auto-locked to MODE C)");
  has("Ch3 Law: note-style citation statement", law.text, LOADER_TEXT.styleNotes("NALT"));
  has("Ch3 Law: the APA default is overridden (B2)", law.text, LOADER_TEXT.styleOverridesApa("NALT"));
  has("Ch3 Law: thematic title from the card", law.text, "THE DOCTRINE OF LEGITIMATE EXPECTATION IN NIGERIAN COURTS");
  lacks("Ch3 Law: pointer to the image rules file stripped", law.text, "chapter_2_literature_review.docx");
  lacks("Ch3 Law: Template B 'Image Intelligence' guidance stripped", law.text, "Image Intelligence in Template B");
  lacks("Ch3 Law: no search query in the [FIG] tag", law.text, "search_query");
  has("Ch3 Law: the [FIG] tag carries the placeholder", law.text, "[FIG] [FIGURE PLACEHOLDER: description of figure needed] | caption [/FIG]");
  has("Ch3 Law: Chapter 3 gets the figure placeholder rule", law.text, LOADER_TEXT.figurePlaceholder);
  has("Ch3 Law: the citation guidance after the stripped part is kept", law.text, "Citation in Template B Chapter Three");
  sharedFilesPresent("Ch3 Law", law.text);
  lacks("Ch3 Law: no unfilled placeholder", law.text, TOKEN);

  console.log("\nAssembled prompt sizes:");
  for (const [name, p] of [["Ch1 Electrical Engineering, Mode 3", eee], ["Ch2 Economics, Mode 5", eco], ["Ch3 Law Doctrinal, Mode 1", law]] as const) {
    console.log(`  ${name.padEnd(36)} ${String(p.text.length).padStart(7)} characters  ≈ ${String(p.approxTokens).padStart(6)} tokens  (${p.parts.length} parts)`);
  }

  // ── Image rules: Chapter 2 only; figure placeholders in 3 and 4 ────────────────────────
  for (const chapter of [1, 3, 4, 5] as const) {
    const p = await loadChapterPrompt(input({ chapter, department: "History", mode: 1 }));
    lacks(`image rules absent from History chapter ${chapter}`, p.text, "═══ IMAGE RULES ═══");
    lacks(`no image-rules file pointer in History chapter ${chapter}`, p.text, "IMAGE INTELLIGENCE RULES");
    expect(`figure placeholder rule in History chapter ${chapter} only when it is 3 or 4`, p.text.includes(LOADER_TEXT.figurePlaceholder), chapter === 3 || chapter === 4);
  }

  // ── The all-modes rules above the routing header ────────────────────────────────────────
  const survey4 = await sample("ch4-nursing-mode2", { chapter: 4, department: "Nursing", mode: 2, project: { referencingStyle: "NMCN" } });
  has("Chapter 4: the no-fabrication rule reaches the prompt", survey4.text, "[DATA NOT PROVIDED — COO TO REVIEW]");
  has("Chapter 4: the cardinal rules heading", survey4.text, "CARDINAL RULES FOR CHAPTER 4");
  has("Chapter 4, Mode 2: its data checklist is included", survey4.text, "SPSS output file (.sav)");
  lacks("Chapter 4, Mode 2: other modes' checklists are not", survey4.text, "Test case results table");
  has("Chapter 4: per-chapter page range from the section (B4)", survey4.text, "18–25 pages");
  has("Chapter 4: objectives from Chapter 1", survey4.text, "1. To design the meter; 2. To test its accuracy");
  has("Chapter 4: 'no hypotheses' stated plainly", survey4.text, "None — no hypotheses stated");
  has("NMCN defined from the Chapter 1 prompt", survey4.text, "NMCN Style — Nursing (follows APA but with currency rules)");
  lacks("NMCN follows APA, so no 'APA does not apply' line", survey4.text, LOADER_TEXT.styleOverridesApa("NMCN Style"));
  const nursing5 = await loadChapterPrompt(input({ chapter: 5, department: "Nursing", mode: 2, project: { referencingStyle: "NMCN" } }));
  has("Chapter 5: the objective-completeness rule reaches the prompt", nursing5.text, "[OBJECTIVE NOT MET — COO TO REVIEW]");
  has("Chapter 5: the all-modes recommendation standards", nursing5.text, "RECOMMENDATION QUALITY STANDARDS");
  const noRq = await loadChapterPrompt(input({ chapter: 4, department: "Nursing", mode: 2, fromEarlierChapters: { ...EARLIER, researchQuestions: [] } }));
  has("no research questions → 'None' (Table B)", noRq.text, /^None\s+— for Business, Education, Medical projects that specified RQs/m);
  const eng3 = await loadChapterPrompt(input({ chapter: 3 }));
  has("Chapter 3, Engineering: default title METHODOLOGY", eng3.text, "[H1] METHODOLOGY (e.g.,");
  has("Chapter 4 title in a standard report: approved wording", (await loadChapterPrompt(input({ chapter: 4 }))).text, "Not applicable (Template A)");

  // ── Template B chain (five chapters at most: Chapter 5 is always the conclusion) ────────
  const hist5 = await sample("ch5-history", { chapter: 5, department: "History", mode: 1, project: { referencingStyle: "CHICAGO_NOTES_BIBLIOGRAPHY" } });
  expect("History Chapter 5 is the conclusion", hist5.blocksUsed.filter((b) => b.startsWith("ch5:T") || b.startsWith("ch5:H")), ["ch5:TEMPLATE_B_CONCLUSION", "ch5:HUMANITIES"]);
  expect("History: MODE B endnotes (B3)", hist5.citationPlacement, "MODE_B");
  has("MODE B block carries the entry formats", hist5.text, "Entry format — first appearance");
  // D11 Fix 1: note markers as ^3 and one [ENDNOTES] block per part; the assembly joins them (MODE B) or shows a chapter's together (MODE A).
  has("MODE B: markers written as ^3, never ¹ (D11)", hist5.text, LOADER_TEXT.noteMarkers);
  has("MODE B: each part lists its notes; the assembly joins them into one list (D11)", hist5.text, LOADER_TEXT.endnotesDocument);
  expect("MODE B: no chapter-endnotes wording", hist5.text.includes(LOADER_TEXT.endnotesChapter), false);
  expect("MODE C (page footnotes) is untouched by the endnote notes", [law.text.includes(LOADER_TEXT.noteMarkers), law.text.includes(LOADER_TEXT.endnotesDocument), law.text.includes(LOADER_TEXT.endnotesChapter)], [false, false, false]);
  expect("in-text reports get no endnote notes", eng3.text.includes(LOADER_TEXT.noteMarkers), false);
  expect("the endnote wording tells the model the notes are joined, not collected at the document end", /collected at the document end/.test(LOADER_TEXT.endnotesDocument) && /replaces/.test(LOADER_TEXT.endnotesDocument), true);
  has("a thematic conclusion keeps the closing cardinal rules", hist5.text, "[OBJECTIVE NOT MET — COO TO REVIEW]");
  has("…and the recommendation standards", hist5.text, "RECOMMENDATION QUALITY STANDARDS");
  expect("no thematic-argument Chapter 5 block is loaded", hist5.blocksUsed.some((b) => b.includes("TEMPLATE_B_THEMATIC_CH5")), false);
  has("History gets the five-chapter note (its section says FIVE or SIX)", hist5.text, LOADER_TEXT.fiveChapters);
  has("History: archival sources only from the list, else the last-resort placeholder", hist5.text, LOADER_TEXT.primarySourcesRule("archive"));
  const hist4 = await loadChapterPrompt(input({ chapter: 4, department: "History", mode: 1 }));
  lacks("a thematic Chapter 4 skips the data-chapter cardinal rules", hist4.text, "CARDINAL RULES FOR CHAPTER 4");
  has("…but keeps its hard-reject trigger", hist4.text, "HARD REJECT TRIGGER");
  const law5 = await sample("ch5-law-doctrinal", { chapter: 5, department: "Law", mode: 1, project: { referencingStyle: "NALT" } });
  expect("Law Chapter 5 is the conclusion: TEMPLATE_B_CONCLUSION + the Law conclusion part", law5.blocksUsed.filter((b) => b.startsWith("ch5:T") || b.startsWith("ch5:L")), ["ch5:TEMPLATE_B_CONCLUSION", "ch5:LAW_DOCTRINAL (conclusion part, read as Chapter Five)"]);
  has("Law Chapter 5 carries the Law conclusion instructions", law5.text, "Law Doctrinal Chapter Six contains");
  has("…introduced as Chapter Five", law5.text, LOADER_TEXT.lawConclusionAsFive);
  lacks("Law Chapter 5 drops the third-argument part", law5.text, "Chapter Five (Third Thematic Argument)");
  has("Law Chapter 5 gets the five-chapter note", law5.text, LOADER_TEXT.fiveChapters);
  const law1 = await loadChapterPrompt(input({ chapter: 1, department: "Law", mode: 1, project: { referencingStyle: "NALT" } }));
  has("Law Chapter 1: its SIX-CHAPTER RULE is overridden by the five-chapter note", law1.text, "SIX-CHAPTER RULE");
  has("…the note is there", law1.text, LOADER_TEXT.fiveChapters);
  const nonDoc4 = await loadChapterPrompt(input({ chapter: 4, department: "Law", mode: 2, project: { referencingStyle: "NALT" } }));
  expect("Non-doctrinal Law Chapter 4 also loads BUSINESS, which it refers to", nonDoc4.blocksUsed.filter((b) => b.startsWith("ch4:") && !b.includes("MODE") && !b.includes("SHARED") && !b.includes("rules") && !b.includes("extras")), ["ch4:LAW_NON_DOCTRINAL", "ch4:BUSINESS"]);
  expect("Non-doctrinal Law with NALT still uses footnotes", nonDoc4.citationPlacement, "MODE_C");
  has("Non-doctrinal Law (its sections say SIX chapters) gets the five-chapter note", nonDoc4.text, LOADER_TEXT.fiveChapters);
  has("Non-doctrinal Law Chapter 4 holds the discussion", nonDoc4.text, LOADER_TEXT.lawNonDoctrinalCh4);
  const nonDoc5 = await sample("ch5-law-non-doctrinal", { chapter: 5, department: "Law", mode: 2, project: { referencingStyle: "NALT" } });
  expect("Non-doctrinal Law Chapter 5 no longer loads the MEDICAL_SCIENCE discussion", nonDoc5.blocksUsed.filter((b) => b.startsWith("ch5:") && /LAW|MEDICAL|BUSINESS/.test(b)), ["ch5:LAW_NON_DOCTRINAL"]);
  has("Non-doctrinal Law Chapter 5 is the conclusion only", nonDoc5.text, LOADER_TEXT.lawNonDoctrinalCh5);
  has("…with a summary-chapter length", nonDoc5.text, /8–14 pages\s+— enforced/);
  const eduB = await loadChapterPrompt(input({ chapter: 3, department: "Educational Foundations", mode: 1 }));
  expect("Theoretical Education (Mode 1) takes the Humanities thematic chain", [eduB.section, eduB.blocksUsed.includes("ch3:HUMANITIES")], ["HUMANITIES", true]);

  // ── References: abstracts (Q3), statutes, no quotations (Q6) ────────────────────────────
  has("each reference carries its abstract", eee.text, "Abstract: A prepaid energy meter built on an ESP32");
  has("a reference without an abstract is kept and marked", eee.text, "Low-Cost Current Sensing for Smart Metering.\nAbstract unavailable.");
  lacks("the old wording is gone from the list", eee.text, "Abstract: abstract unavailable");
  has("statutes and the Constitution may be cited by name", eee.text, "apart from statutes and the Constitution, which you may cite by name");
  has("the abstract rule is stated", eee.text, "Report a study's methods and findings only as far as its abstract states them");
  has("no direct quotations; pinpoints left as p. [page] (Q6)", eee.text, LOADER_TEXT.noDirectQuotes);
  lacks("a science project gets no case or archive rule", eee.text, "[CASE TO BE SUPPLIED]");

  // ── Loader notes (A1, A2) ───────────────────────────────────────────────────────────────
  const soc = await sample("ch1-sociology-mode2", { chapter: 1, department: "Sociology", mode: 2 });
  expect("Sociology uses BUSINESS", soc.section, "BUSINESS");
  has("Sociology gets the social-science note (A1)", soc.text, LOADER_TEXT.socialScience);
  lacks("Marketing does not", (await loadChapterPrompt(input({ chapter: 1, department: "Marketing", mode: 2 }))).text, "social science discipline");
  const chem4 = await sample("ch4-chemistry-mode4", { chapter: 4, department: "Chemistry", mode: 4, samples: { description: "soil and water" } });
  has("Chemistry gets the non-human samples note (A2)", chem4.text, LOADER_TEXT.nonHumanSamples("soil and water"));
  has("Chemistry Chapter 4 combines Results and Discussion", chem4.text, LOADER_TEXT.combinedResultsCh4);
  has("…and says so over the Chapter 4 cardinal rules it sits beside", chem4.text, "CARDINAL RULES FOR CHAPTER 4");
  const chem5 = await loadChapterPrompt(input({ chapter: 5, department: "Chemistry", mode: 4 }));
  has("Chemistry Chapter 5 replaces the discussion sections", chem5.text, LOADER_TEXT.combinedResultsCh5);
  has("Chemistry Chapter 5 uses a summary-chapter length", chem5.text, /8–14 pages\s+— enforced/);
  has("Chemistry without a sample description gets the generic wording", chem5.text, LOADER_TEXT.nonHumanSamples(LOADER_TEXT.nonHumanDefault));
  const chemSurvey = await loadChapterPrompt(input({ chapter: 3, department: "Chemistry", mode: 2 }));
  expect("Chemistry on a Mode 2 survey goes to BUSINESS", chemSurvey.section, "BUSINESS");
  lacks("…with no non-human note", chemSurvey.text, "samples are not human participants");
  for (const dept of ["Microbiology", "Biotechnology", "Science Laboratory Technology"]) {
    const p = await loadChapterPrompt(input({ chapter: 4, department: dept, mode: 4 }));
    lacks(`${dept} keeps Results and Discussion separate`, p.text, LOADER_TEXT.combinedResultsCh4);
    lacks(`${dept} gets no non-human note by default`, p.text, "samples are not human participants");
  }
  const microSoil = await loadChapterPrompt(input({ chapter: 3, department: "Microbiology", mode: 4, samples: { nonHuman: true, description: "soil" } }));
  has("…but a project can switch the note on", microSoil.text, LOADER_TEXT.nonHumanSamples("soil"));

  // ── Every department, every chapter of its default mode ─────────────────────────────────
  let assembled = 0;
  const problems: string[] = [];
  for (const entry of DEPARTMENTS) {
    if (entry.group) continue;
    const runs: { mode: ResearchModeNumber; override?: SectionKey }[] = entry.defaultMode
      ? [{ mode: entry.defaultMode }]
      : [{ mode: 3, override: "ENGINEERING" }, { mode: 4, override: "MEDICAL_SCIENCE" }, { mode: 2, override: "BUSINESS" }];
    for (const run of runs) {
      let projectBlock: string | null = null;
      for (let c = 1; c <= 5; c++) {
        try {
          const p = await loadChapterPrompt(
            input({ chapter: c as ChapterNumber, department: entry.name, mode: run.mode, sectionOverride: run.override, project: { referencingStyle: defaultReferencingStyle(entry) } }),
          );
          assembled++;
          if (TOKEN.test(p.text)) problems.push(`${entry.name} ch${c}: unfilled ${TOKEN.exec(p.text)![0]}`);
          if (p.fallback.used) problems.push(`${entry.name} ch${c}: fallback — ${p.fallback.note}`);
          if (/search_query|IMAGE INTELLIGENCE RULES|Image Intelligence in Template B/.test(p.text)) problems.push(`${entry.name} ch${c}: an image-search instruction survived`);
          for (const h of SHARED_HEADINGS) if (!p.text.includes(h)) problems.push(`${entry.name} ch${c}: missing ${h}`);
          if (!p.text.includes(LOADER_TEXT.noDirectQuotes)) problems.push(`${entry.name} ch${c}: no-quotation rule missing`);
          if (!p.text.includes("Abstract: ")) problems.push(`${entry.name} ch${c}: abstracts missing`);
          // D9: one project block for the whole project, so Chapters 2 to 5 read it from the prompt cache.
          if (projectBlock === null) projectBlock = p.projectBlock;
          else if (p.projectBlock !== projectBlock) problems.push(`${entry.name} ch${c}: the project block differs from Chapter 1's`);
          if (p.text !== `${p.projectBlock}${BLOCK_GAP}${p.chapterBlock}`) problems.push(`${entry.name} ch${c}: the prompt is not its two blocks joined`);
          if (p.warnings.length) problems.push(`${entry.name} ch${c}: unexpected warning — ${p.warnings.join(" ")}`);
        } catch (err) {
          problems.push(`${entry.name} Mode ${run.mode} ch${c}: ${(err as Error).message}`);
        }
      }
    }
  }
  expect(`all ${assembled} department × chapter prompts assemble cleanly`, problems, []);

  // ── Department table ────────────────────────────────────────────────────────────────────
  for (const [typed, wanted] of [
    ["Dept. of Electrical/Electronic Engineering.", "Electrical and Electronic Engineering"],
    ["Final year, Computer Science", "Computer Science"],
    ["computing", "Computer Science"],
    ["B.Sc. Accounting", "Accounting"],
    ["Mass Comm.", "Mass Communication"],
    ["Structural Engineering", "Civil Engineering"],
    ["B.Ed Mathematics", "Education (combined with a teaching subject)"],
    ["BEd Physics", "Education (combined with a teaching subject)"],
    ["M.Ed Guidance", "Education (combined with a teaching subject)"],
    ["B.Sc.(Ed) Biology", "Education (combined with a teaching subject)"],
    ["B.Sc.(Ed.) Biology", "Education (combined with a teaching subject)"],
    ["B.Sc.Ed Biology", "Education (combined with a teaching subject)"],
    ["B.A. (Ed.) English", "Education (combined with a teaching subject)"],
    ["Pre-Med", null],
    ["Economics Education", "Education (combined with a teaching subject)"],
    ["Music Education", "Education (combined with a teaching subject)"],
    ["Med Lab Science", null],
    ["Vet Med", null],
    ["Community Med", null],
    ["Business Law", "Commercial and Industrial Law"],
    ["Civil Law", "Law"],
    ["Law Enforcement", "Criminology and Security Studies"],
    ["Law and Order", null],
    ["Environmental management and toxicology", "Environmental Management and Toxicology"],
    ["Medical Laboratory Science (MLS)", "Medical Laboratory Science"],
    ["General", "General (placeholder)"],
    ["Media Studies", "Media Studies (empirical or not stated)"],
    ["Engineering", "Engineering (branch not stated)"],
    ["dsafdsgfdg", null],
  ] as const) {
    expect(`lookup "${typed}"`, lookupDepartment(typed)?.name ?? null, wanted);
  }
  expect("a combined degree keeps the name as typed", matchDepartment("Economics Education")?.displayName, "Economics Education");

  // ── Five chapters at most at intake and in the document slots ───────────────────────────
  const intakeChapters = intakeSubmitSchema.innerType().shape.chapterCount;
  expect("intake refuses 6 chapters", intakeChapters.safeParse("6").success, false);
  expect("intake accepts 5 chapters", intakeChapters.safeParse("5").success, true);
  expect("the refusal says why", intakeChapters.safeParse(6).error?.issues[0]?.message, CHAPTER_LIMIT_MESSAGE);
  const edit6 = intakeEditSchema.safeParse({ project: { chapterCount: 6 } });
  expect("admin edit refuses 6 chapters", edit6.success ? null : edit6.error.issues.find((i) => i.path.join(".") === "project.chapterCount")?.message, CHAPTER_LIMIT_MESSAGE);
  expect(
    "a 6-chapter order gets 5 chapter slots",
    deliverableTemplate({ serviceCode: "FYP-FULL", serviceName: "Final Year Project", chapterCount: 6, chapters: [] }).filter((d) => d.kind === "CHAPTER").length,
    MAX_REPORT_CHAPTERS,
  );
  const find = (name: string) => DEPARTMENTS.find((d) => d.name === name)!;
  expect("Agricultural Economics in Mode 4 → AGRICULTURE (A8)", resolveSection(find("Agricultural Economics"), 4), "AGRICULTURE");
  expect("Agricultural Economics in Mode 2 → BUSINESS (A8)", resolveSection(find("Agricultural Economics"), 2), "BUSINESS");
  expect("Banking and Finance in Mode 2 → BUSINESS (A4)", resolveSection(find("Banking and Finance"), 2), "BUSINESS");
  expect("Public Health switched to NURSING on the card (A5)", resolveSection(find("Public Health"), 2, "NURSING"), "NURSING");
  expect("Computer Engineering switched to COMPUTER_SCIENCE (A6)", resolveSection(find("Computer Engineering"), 3, "COMPUTER_SCIENCE"), "COMPUTER_SCIENCE");
  expect("Civil Engineering in Mode 4 keeps ENGINEERING (A7)", resolveSection(find("Civil Engineering"), 4), "ENGINEERING");
  expect("default styles (B2)", [defaultReferencingStyle(find("Law")), defaultReferencingStyle(find("Nursing")), defaultReferencingStyle(find("History")), defaultReferencingStyle(find("Marketing"))], ["NALT", "NMCN", "CHICAGO_NOTES_BIBLIOGRAPHY", "APA_7TH"]);

  // ── The degree on the title page (getDegreeFromDepartment) ─────────────────────────────
  const noDegree = DEPARTMENTS.filter((d) => !d.degree || !DEGREE_NAMES[d.degree]).map((d) => d.name);
  expect(`every one of the ${DEPARTMENTS.length} Table A entries has a named degree`, noDegree, []);
  const degrees: [string, string][] = [
    ["Computer Science", "B.Sc"],
    ["Computer Engineering", "B.Eng"],
    ["Mechanical Engineering", "B.Eng"],
    ["Prosthetics and Orthotics", "B.Tech"],
    ["Accounting", "B.Sc"],
    ["Banking and Finance", "B.Sc"],
    ["Economics", "B.Sc"],
    ["Law", "LL.B"],
    ["Islamic Law", "LL.B"],
    ["Medicine and Surgery", "MBBS"],
    ["MBBS", "MBBS"],
    ["Medical Laboratory Science", "BMLS"],
    ["Dentistry", "BDS"],
    ["Veterinary Medicine", "DVM"],
    ["Optometry", "OD"],
    ["Microbiology", "B.Sc"],
    ["Architecture", "B.Arch"],
    ["Pharmacy", "B.Pharm"],
    ["Nursing", "B.NSc"],
    ["Midwifery", "B.NSc"],
    ["Education", "B.Ed"],
    ["Guidance and Counselling", "B.Ed"],
    ["B.Ed Mathematics", "B.Ed"],
    ["Library and Information Science", "BLIS"],
    ["Agriculture", "B.Agric"],
    ["Crop Science", "B.Agric"],
    ["Agricultural Economics", "B.Agric"],
    ["Agricultural Extension", "B.Agric"],
    ["Food Science and Technology", "B.Sc"],
    ["English and Literary Studies", "B.A"],
    ["History", "B.A"],
    ["International Relations", "B.Sc"],
    ["Mass Communication", "B.Sc"],
    ["Physics", "B.Sc"],
    ["Engineering", "B.Eng"],
    ["Arts", "B.A"],
  ];
  for (const [dept, want] of degrees) expect(`degree: ${dept}`, getDegreeFromDepartment(dept), want);
  expect("degree: Nursing at a school of nursing is the RN", getDegreeFromDepartment("Nursing", { institution: "School of Nursing, LUTH" }), "RN");
  expect("degree: Midwifery at a school of midwifery is the RM", getDegreeFromDepartment("Midwifery", { faculty: "School of Midwifery" }), "RM");
  expect("degree: Nursing in a university faculty stays B.NSc", getDegreeFromDepartment("Nursing", { faculty: "Clinical Sciences", institution: "University of Lagos" }), "B.NSc");
  expect("degree: an unknown department in a Faculty of Engineering", getDegreeFromDepartment("Underwater Acoustics", { faculty: "Faculty of Engineering" }), "B.Eng");
  expect("degree: an unknown department in a Faculty of Arts", getDegreeFromDepartment("Creative Writing Studio", { faculty: "Arts" }), "B.A");
  expect("degree: an unknown department with no faculty", getDegreeFromDepartment("dsafdsgfdg"), "B.Sc");
  expect("degree: nothing typed", getDegreeFromDepartment(null), "B.Sc");
  expect("degree names", [degreeName("B.Sc"), degreeName("LL.B"), degreeName("MBBS")], ["Bachelor of Science", "Bachelor of Laws", "Bachelor of Medicine, Bachelor of Surgery"]);

  // ── Refusals: nothing incomplete or contradictory reaches Claude ───────────────────────
  await refuses("a group label is refused", () => loadChapterPrompt(input({ department: "Engineering" })), /not a department/);
  await refuses("an unknown department is refused", () => loadChapterPrompt(input({ department: "dsafdsgfdg" })), /not in the department table/);
  await refuses("Accounting cannot leave Mode 5 (A3)", () => loadChapterPrompt(input({ department: "Accounting", mode: 2 })), /always Mode 5/);
  await refuses("Accounting cannot leave ECONOMICS (A3)", () => loadChapterPrompt(input({ department: "Accounting", mode: 5, sectionOverride: "BUSINESS" })), /always uses the ECONOMICS section/);
  await refuses("Law cannot be Mode 3", () => loadChapterPrompt(input({ department: "Law", mode: 3 })), /Mode 1 \(doctrinal\) or Mode 2/);
  await refuses("Law's section follows its mode", () => loadChapterPrompt(input({ department: "Law", mode: 2, sectionOverride: "BUSINESS" })), /section follows the mode/);
  await refuses("Physics needs the COO's section (A9)", () => loadChapterPrompt(input({ department: "Physics", mode: 3 })), /COO must pick the mode and the section/);
  await refuses("an override must be written for the mode", () => loadChapterPrompt(input({ department: "Physics", mode: 2, sectionOverride: "HUMANITIES" })), /written for Mode 1, not Mode 2/);
  await refuses("a non-Law department cannot take a Law section", () => loadChapterPrompt(input({ department: "Sociology", mode: 2, sectionOverride: "LAW_NON_DOCTRINAL" })), /Only Law departments/);
  await refuses("Mode 3 outside Engineering and Computing needs the COO's pick", () => loadChapterPrompt(input({ department: "Health Information Management", mode: 3 })), /hardware build.*software build/);
  await refuses("a missing title is refused", () => loadChapterPrompt(input({ project: { projectTitle: " " } })), /PROJECT_TITLE: The project title is required/);
  await refuses("Chicago without a variant is refused", () => loadChapterPrompt(input({ project: { referencingStyle: "CHICAGO" } })), /Chicago without a variant/);
  await refuses("Custom style without its format is refused", () => loadChapterPrompt(input({ project: { referencingStyle: "CUSTOM" } })), /Custom but the supervisor's format/);
  await refuses("Chapter 4 without Chapter 1's objectives is refused", () => loadChapterPrompt(input({ chapter: 4, fromEarlierChapters: {} })), /OBJECTIVES: Chapter One's objectives have not been extracted/);
  await refuses("B5: a thematic Chapter 1 waits for the card's titles", () => loadChapterPrompt(input({ chapter: 1, department: "History", mode: 1, thematicTitles: {} })), /missing: Chapter 3, Chapter 4/);
  await refuses("there is no Chapter 6 in any department (Q1/Q2)", () => loadChapterPrompt(input({ chapter: 6 as ChapterNumber, department: "Law", mode: 1, project: { referencingStyle: "NALT" } })), /Chapter 6 does not exist; reports have five chapters at most/);
  await refuses("NALT placement cannot be overridden", () => loadChapterPrompt(input({ department: "Law", mode: 1, project: { referencingStyle: "NALT" }, citationPlacement: "MODE_B" })), /NALT always uses page footnotes/);
  await refuses("thematic placement cannot be overridden (B3)", () => loadChapterPrompt(input({ chapter: 1, department: "History", mode: 1, citationPlacement: "MODE_A" })), /Thematic reports use MODE B/);
  await refuses("an impossible chapter number is refused", () => loadChapterPrompt(input({ chapter: 7 as ChapterNumber })), /Chapter 7 does not exist/);
  await refuses("an impossible mode is refused", () => loadChapterPrompt(input({ mode: 0 as ResearchModeNumber })), /Mode 0 does not exist/);
  await refuses("an unknown style is refused", () => loadChapterPrompt(input({ project: { referencingStyle: "apa_7th" as "APA_7TH" } })), /Unknown referencing style/);
  await refuses("an unknown project type is refused", () => loadChapterPrompt(input({ project: { projectType: "BOGUS" as "PRACTICAL" } })), /Unknown project type/);
  await refuses("a notes style cannot be switched to in-text", () => loadChapterPrompt(input({ department: "Marketing", mode: 2, project: { referencingStyle: "CHICAGO_NOTES_BIBLIOGRAPHY" }, citationPlacement: "NOT_APPLICABLE" })), /notes style/);
  const braces = await loadChapterPrompt(input({ project: { specialInstructions: "Follow {SUPERVISOR_STYLE} strictly" } }));
  lacks("braces typed by a client never become a placeholder", braces.text, "{SUPERVISOR_STYLE}");
  const lowerBraces = await loadChapterPrompt(input({ chapter: 3, department: "History", mode: 1, thematicTitles: { ...TITLES, chapter3: "The {hod} of power" } }));
  lacks("a lower-case token upper-cased in a title never becomes a placeholder", lowerBraces.text, "{HOD}");

  // ── D3b: the cases (Law) and archival sources (History) the COO approved, after the references ──
  const CASES: ChapterPromptInput["primarySources"] = {
    kind: "case",
    items: [{ point: "Whether a court is bound by a plea agreement", title: "Chinaka Promise v. Federal Republic of Nigeria", court: "Court of Appeal", decidedOn: "2020", citation: null, suitNumber: "CA/A/767c/2019" }],
    unsupportedPoints: ["Whether a victim must consent to a plea bargain"],
  };
  const lawCases = await loadChapterPrompt(input({ chapter: 2, department: "Law", mode: 1, project: { referencingStyle: "NALT" }, primarySources: CASES }));
  has("D3b Law: the approved cases part", lawCases.text, "═══ APPROVED CASES ═══");
  has(
    "D3b Law: each case with its point",
    lawCases.text,
    "1. Chinaka Promise v. Federal Republic of Nigeria (2020), Court of Appeal, suit no. CA/A/767c/2019. Supports: Whether a court is bound by a plea agreement",
  );
  has("D3b Law: a point with no approved case gets the placeholder", lawCases.text, LOADER_TEXT.unsupportedPoints("case", ["Whether a victim must consent to a plea bargain"]));
  has("D3b Law: the references intro points to the approved list", lawCases.text, "and the court decisions in the APPROVED CASES list that follows");
  has("D3b Law: statutes and the Constitution still cited by name", lawCases.text, "apart from statutes and the Constitution, which you may cite by name");
  lacks("D3b Law: the list-only case rule gives way to the approved list", lawCases.text, LOADER_TEXT.primarySourcesRule("case"));
  has("D3b Law: never invent a case", lawCases.text, LOADER_TEXT.approvedOnlyRule("case"));
  const noCases = await loadChapterPrompt(
    input({ chapter: 4, department: "Law", mode: 1, project: { referencingStyle: "NALT" }, primarySources: { kind: "case", items: [], unsupportedPoints: ["A point"] } }),
  );
  has("D3b Law with nothing ticked: says so and keeps the placeholder", noCases.text, LOADER_TEXT.approvedCasesIntro(0));
  const ARCHIVES: ChapterPromptInput["primarySources"] = {
    kind: "archive",
    items: [
      { point: "How was tax assessed in Benin Province?", title: "Taxation in Nigeria", decidedOn: "1934-1943", holder: "The National Archives, Kew", reference: "CO 583/200/6", recordType: "Primary" },
      { point: "How was tax assessed in Benin Province?", title: "The Administration of Colonial Taxation in Zaria Province", decidedOn: "2015", holder: "Ahmadu Bello University", reference: "hdl:123456789/8183", recordType: "Thesis" },
    ],
    unsupportedPoints: [],
  };
  const histArchives = await loadChapterPrompt(input({ chapter: 2, department: "History", mode: 1, primarySources: ARCHIVES }));
  has("D3b History: the approved archival sources part", histArchives.text, "═══ APPROVED ARCHIVAL SOURCES ═══");
  has("D3b History: a primary record line", histArchives.text, "Taxation in Nigeria, 1934-1943, The National Archives, Kew, CO 583/200/6 (primary record). Bears on: How was tax assessed in Benin Province?");
  has("D3b History: a thesis is marked as a thesis", histArchives.text, "hdl:123456789/8183 (thesis). Bears on:");
  lacks("D3b History: no unsupported line when every point has a source", histArchives.text, "No archival source was found for these points");
  await refuses("D3b: archival sources outside History are refused", () => loadChapterPrompt(input({ chapter: 2, department: "English", mode: 1, primarySources: ARCHIVES })), /outside the History department/);
  await refuses("D3b: cases outside Law are refused", () => loadChapterPrompt(input({ chapter: 2, department: "History", mode: 1, primarySources: CASES })), /not in a Law section/);
  const english = await loadChapterPrompt(input({ chapter: 2, department: "English", mode: 1 }));
  has("D3b: other Humanities departments keep the list-only archive rule", english.text, LOADER_TEXT.primarySourcesRule("archive"));
  lacks("D3b: …and get no approved list", english.text, "APPROVED ARCHIVAL SOURCES");

  // ── D5: the fetched dataset in Mode 5 Chapters 4 and 5 ──
  const DATASET: NonNullable<ChapterPromptInput["secondaryData"]> = {
    period: { start: 2000, end: 2023 },
    equation: "GDP = β0 + β1INF + β2EXR + μ",
    technique: "ARDL",
    fetchedOn: "27 Sept 2026",
    notes: ["Year: calendar year. Annual data, 2000–2023.", "GDP: Gross domestic product, US$ billion. Source: World Bank, World Development Indicators (NY.GDP.MKTP.CD)."],
    csv: "Year,GDP,INF,EXR\n2000,69.45,6.93,101.70\n2001,{HOD},18.87,111.23",
    statsTable: "Statistic | GDP | INF | EXR\n--- | --- | --- | ---\nMean | 1.0000 | 2.0000 | 3.0000",
    correlationTable: " | GDP | INF\n--- | --- | ---\nGDP | 1.0000 | 0.5000",
    missing: ["NSE (All-share index): Not available from the World Bank or the CBN automatically."],
  };
  const eco4 = await loadChapterPrompt(input({ chapter: 4, department: "Economics", mode: 5, secondaryData: DATASET }));
  has("D5 Ch4: the dataset part", eco4.text, "═══ THE PROJECT'S SECONDARY DATA ═══");
  has("D5 Ch4: the intro with the period and date", eco4.text, LOADER_TEXT.secondaryDataIntro(2000, 2023, "27 Sept 2026"));
  has("D5 Ch4: the model", eco4.text, LOADER_TEXT.secondaryDataModel("GDP = β0 + β1INF + β2EXR + μ", "ARDL"));
  has("D5 Ch4: the CSV", eco4.text, "Year,GDP,INF,EXR\n2000,69.45,6.93,101.70");
  lacks("D5 Ch4: braces in the data never become a placeholder", eco4.text, "{HOD}");
  has("D5 Ch4: the computed statistics, used exactly", eco4.text, LOADER_TEXT.secondaryDataComputed);
  has("D5 Ch4: the statistics table", eco4.text, "Mean | 1.0000 | 2.0000 | 3.0000");
  has("D5 Ch4: estimation tables carry the placeholder", eco4.text, LOADER_TEXT.secondaryDataPlaceholder);
  has("D5 Ch4: the placeholder wording is the founder's", eco4.text, "[DATA NOT PROVIDED — COO TO REVIEW]");
  has("D5 Ch4: what is missing", eco4.text, "NSE (All-share index): Not available");
  has("D5 Ch4: datasets are cited by name, not listed as references", eco4.text, LOADER_TEXT.secondaryDataCitation);
  expect("D5 Ch4: recorded in blocksUsed", eco4.blocksUsed.includes("d5:dataset 2000-2023"), true);
  const eco5 = await loadChapterPrompt(input({ chapter: 5, department: "Economics", mode: 5, secondaryData: { ...DATASET, missing: [] } }));
  has("D5 Ch5: no estimation result may be stated", eco5.text, LOADER_TEXT.secondaryDataChapterFive);
  lacks("D5 Ch5: not the Chapter 4 table rule", eco5.text, LOADER_TEXT.secondaryDataPlaceholder);
  lacks("D5: no missing line when nothing is missing", eco5.text, "These variables or years are not in the dataset");
  lacks("D5: a Mode 5 chapter without a dataset has no data part", (await loadChapterPrompt(input({ chapter: 4, department: "Economics", mode: 5 }))).text, "THE PROJECT'S SECONDARY DATA");
  await refuses("D5: a dataset outside Mode 5 is refused", () => loadChapterPrompt(input({ chapter: 4, department: "Marketing", mode: 2, secondaryData: DATASET })), /Chapters 4 and 5 of Mode 5 projects only/);
  await refuses("D5: a dataset in Chapter 3 is refused", () => loadChapterPrompt(input({ chapter: 3, department: "Economics", mode: 5, secondaryData: DATASET })), /Chapters 4 and 5 of Mode 5 projects only/);

  // ── D9: the references at the top, in a block every chapter of the project shares ──
  {
    const at = (text: string, needle: string) => text.indexOf(needle);
    const order = ["═══ EDUCRAFT VOICE RULES ═══", "═══ REFERENCING RULES ═══", "═══ REFERENCING STYLE FOR THIS PROJECT ═══", "═══ VERIFIED REFERENCES ═══", "═══ MODE INSTRUCTIONS", "═══ SHARED INSTRUCTIONS ═══", "═══ DEPARTMENT INSTRUCTIONS"];
    const places = order.map((o) => at(eee.text, o));
    expect("D9: every part of the new order is there", places.every((n) => n >= 0), true);
    expect("D9: shared rules, then the references, then the chapter's instructions and its department section", [...places].sort((a, b) => a - b), places);
    expect("D9: the prompt opens with the project block", eee.text.startsWith(eee.projectBlock), true);
    has("D9: the references are in the project block", eee.projectBlock, "═══ VERIFIED REFERENCES ═══");
    lacks("D9: no chapter instruction is in the project block", eee.projectBlock, "═══ MODE INSTRUCTIONS");
    lacks("D9: no reference is in the chapter block", eee.chapterBlock, "═══ VERIFIED REFERENCES ═══");
    lacks("D9: the project block carries no placeholder", eee.projectBlock, TOKEN);
    has("D9: the prompt files' pointer to the list reads 'near the start'", LOADER_TEXT.referencesPointer, "near the start of this prompt");
    lacks("D9: nothing says the list is at the end", eee.text, "at the end of this prompt");
    expect("D9: a stored prompt splits into its two blocks", splitPromptBlocks(eee.text, eee.projectBlock.length), [eee.projectBlock, eee.chapterBlock]);
    expect("D9: a prompt stored before D9 goes out as one block", splitPromptBlocks(eee.text, undefined), [eee.text]);
    expect("D9: a wrong split point is never used", splitPromptBlocks(eee.text, eee.projectBlock.length - 5), [eee.text]);
    has("D9 Law: the approved cases are in the project block, after the references", lawCases.projectBlock.slice(lawCases.projectBlock.indexOf("═══ VERIFIED REFERENCES ═══")), "═══ APPROVED CASES ═══");
    has("D9 History: so are the approved archival sources", histArchives.projectBlock.slice(histArchives.projectBlock.indexOf("═══ VERIFIED REFERENCES ═══")), "═══ APPROVED ARCHIVAL SOURCES ═══");
    const lawCases5 = await loadChapterPrompt(input({ chapter: 5, department: "Law", mode: 1, project: { referencingStyle: "NALT" }, primarySources: CASES }));
    expect("D9 Law: Chapters 2 and 5 share one project block, cases included", lawCases5.projectBlock === lawCases.projectBlock, true);
    const otherRefs = await loadChapterPrompt(input({ references: REFERENCES.slice(0, 2) }));
    expect("D9: another project's references make another project block", otherRefs.projectBlock === eee.projectBlock, false);

    // A project with no verified references still assembles (this reverses B7, "no references, no prompt").
    const none = await loadChapterPrompt(input({ references: [] }));
    expect("D9 no research: the prompt assembles with one warning", none.warnings, [LOADER_TEXT.noReferencesWarning]);
    lacks("D9 no research: no references list", none.text, "═══ VERIFIED REFERENCES ═══");
    has("D9 no research: the rule that stands in its place", none.text, LOADER_TEXT.noReferences());
    has("D9 no research: a source is never invented", none.text, "[REFERENCE TO BE SUPPLIED]");
    has("D9 no research: recorded in blocksUsed", none.blocksUsed.join("|"), "research:no verified references");
    sharedFilesPresent("D9 no research", none.text);
    lacks("D9 no research: no unfilled placeholder", none.text, TOKEN);
    const none4 = await loadChapterPrompt(input({ chapter: 4, references: [] }));
    has("D9 no research: a later chapter's pointer says there are none", none4.text, LOADER_TEXT.noReferencesPointer);
    lacks("D9 no research: …and never points at a list that is not there", none4.text, LOADER_TEXT.referencesPointer);
    const lawNone = await loadChapterPrompt(input({ chapter: 2, department: "Law", mode: 1, project: { referencingStyle: "NALT" }, primarySources: CASES, references: [] }));
    has("D9 no research, Law: the approved cases are still listed", lawNone.text, "═══ APPROVED CASES ═══");
    has("D9 no research, Law: and may still be cited", lawNone.text, LOADER_TEXT.noReferences("case"));
    const lawNoneNoCases = await loadChapterPrompt(input({ chapter: 2, department: "Law", mode: 1, project: { referencingStyle: "NALT" }, references: [] }));
    has("D9 no research, Law with no source stage: the case placeholder rule stays", lawNoneNoCases.text, LOADER_TEXT.primarySourcesRule("case"));
  }

  if (process.argv.includes("--print")) {
    console.log("\n" + "━".repeat(100) + "\nCHAPTER 1 — ELECTRICAL ENGINEERING — MODE 3 (full assembled prompt)\n" + "━".repeat(100) + "\n");
    console.log(eee.text);
  }
  console.log(`\nSample prompts written to ${path.relative(process.cwd(), SAMPLES_DIR)}/`);
  console.log(`${passes} checks passed, ${failures} failed.`);
  if (failures > 0) process.exit(1);
  console.log("The prompt loader matches the approved Phase D1 rules and the D9 reference wiring.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
