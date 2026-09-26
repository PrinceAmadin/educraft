/**
 * Phase D3 checks — the mode classifier's rules, with no database: department
 * defaults (Table A), the keyword scan (with the founder's fixes), the client's
 * answer and the older intake fields, the recommendation, conflicts and
 * confidence, the section the COO must pick, and the checks on a COO decision.
 *
 *   npm run check:modes
 */
import {
  MODE_KEYWORDS,
  allowedModes,
  classifyMode,
  getDepartmentModeDefault,
  intakeAnswerToMode,
  keywordSignal,
  legacyIntakeMode,
  modeName,
  scanTopicForModeKeywords,
  sectionOptionsFor,
  validateModeDecision,
  type ModeDecision,
} from "../src/lib/mode-classifier";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
const triggers = (topic: string, dept?: string) => scanTopicForModeKeywords(topic, dept).map((t) => `${t.trigger}>${t.mode}`).join(", ");
const problemsOf = (d: ModeDecision) => {
  const r = validateModeDecision(d);
  return r.ok ? [] : r.problems;
};

// ─── Names ──────────────────────────────────────────────────────────────────
check("names: 1–5", [1, 2, 3, 4, 5].map((n) => modeName(n as 1)).join() === "THEMATIC,SURVEY,BUILD,LAB,API_DATA");

// ─── Department defaults (from Table A, never duplicated) ───────────────────
const ba = getDepartmentModeDefault("Business Administration");
check("dept: Business Administration = Mode 2, BUSINESS", ba.mode === 2 && ba.section === "BUSINESS" && ba.issue === null, ba);
const mc = getDepartmentModeDefault("Dept. of Mass Comm");
check("dept: an alias with 'Dept. of' finds Mass Communication", mc.matched === "Mass Communication" && mc.mode === 2, mc.matched);
const acc = getDepartmentModeDefault("Accounting");
check("dept: Accounting is locked to Mode 5", acc.mode === 5 && acc.lockedMode, acc);
check("dept: Physics has no default (the COO picks)", getDepartmentModeDefault("Physics").mode === null && getDepartmentModeDefault("Physics").issue === "NO_DEFAULT");
check("dept: 'Engineering' is a group label", getDepartmentModeDefault("Engineering").issue === "GROUP");
check("dept: an unknown name is flagged", getDepartmentModeDefault("Underwater Basket Weaving").issue === "UNKNOWN");
check("dept: empty is unknown", getDepartmentModeDefault("  ").issue === "UNKNOWN" && getDepartmentModeDefault(null).entered === null);
check("dept: Law is Mode 1 by default, section decided by the mode", getDepartmentModeDefault("LLB").mode === 1 && getDepartmentModeDefault("LLB").section === "LAW");
check("allowed: Accounting only 5, Law 1 and 2, groups none", allowedModes(acc.entry).join() === "5" && allowedModes(getDepartmentModeDefault("Law").entry).join() === "1,2" && allowedModes(getDepartmentModeDefault("Engineering").entry).length === 0);
check("sections: Mode 3 offers Engineering or Computer Science", sectionOptionsFor(mc.entry, 3).join() === "COMPUTER_SCIENCE,ENGINEERING", sectionOptionsFor(mc.entry, 3));
check("sections: Mode 2 offers the four survey sections, never Law", sectionOptionsFor(ba.entry, 2).join() === "BUSINESS,EDUCATION,MEDICAL_SCIENCE,NURSING", sectionOptionsFor(ba.entry, 2));
check("sections: Law's follows its mode (no choice)", sectionOptionsFor(getDepartmentModeDefault("Law").entry, 1).length === 0);

// ─── Keywords ───────────────────────────────────────────────────────────────
check("keywords: 'assessment of' is gone from Mode 2", !MODE_KEYWORDS[2].includes("assessment of") && triggers("Assessment of teaching methods in secondary schools") === "");
check("keywords: 'effect of [substance]' is gone", !MODE_KEYWORDS[4].some((k) => typeof k === "string" && k.includes("[")));
check("keywords: the economics additions are in Mode 5 only", ["economic analysis", "financial analysis", "regression analysis", "inflation rate"].every((k) => MODE_KEYWORDS[5].includes(k) && !MODE_KEYWORDS[2].includes(k)));
check("keywords: a survey topic", triggers("Perception of nurses towards patient safety") === "perception of>2");
check("keywords: a secondary-data topic, year range included", triggers("Effect of exchange rate on GDP in Nigeria (1990–2022)") === "(1990–2022)>5, exchange rate>5, gdp>5", triggers("Effect of exchange rate on GDP in Nigeria (1990–2022)"));
check("keywords: 'inflation rate' counts once, not also as 'inflation'", triggers("Impact of inflation rate on the stock market") === "impact of>2, inflation rate>5, stock market>5", triggers("Impact of inflation rate on the stock market"));
check("keywords: whole words only ('GDPR' is not 'gdp')", triggers("Compliance with the GDPR by Nigerian banks") === "");
check("keywords: plurals count", triggers("Prototypes of low-cost incubators") === "prototype>3");
check("keywords: -ization spelling and hyphens", triggers("Isolation and characterization of soil bacteria") === "isolation and characterisation>4" && triggers("An IoT based smart system for farms") === "iot-based>3, smart system>3", [triggers("Isolation and characterization of soil bacteria"), triggers("An IoT based smart system for farms")]);
check("keywords: a thematic topic", triggers("A postcolonial reading of Achebe") === "postcolonial>1");
check("keywords: A7 lab words count only in Civil/Materials Engineering", triggers("Compressive strength of concrete with rice husk ash", "Civil Engineering") === "compressive strength>4, concrete>4" && triggers("Compressive strength of concrete with rice husk ash", "Business Administration") === "", triggers("Compressive strength of concrete with rice husk ash", "Civil Engineering"));
const imp = keywordSignal(scanTopicForModeKeywords("Impact of inflation rate on the stock market"));
check("signal: the mode with most triggers wins (5 over 2)", imp.mode === 5 && imp.tied.length === 0, imp);
const tie = keywordSignal(scanTopicForModeKeywords("Impact of automated attendance"));
check("signal: a tie gives no keyword mode", tie.mode === null && tie.tied.join() === "2,3", tie);

// ─── The client's answer ────────────────────────────────────────────────────
check("answer: A–E map to 1–5", ["A", "B", "C", "D", "E"].map((a) => intakeAnswerToMode(a as "A")).join() === "1,2,3,4,5" && intakeAnswerToMode(null) === null);
check("older fields: survey 2, design 3, theoretical 1, secondary data 5", legacyIntakeMode("SURVEY_BASED", null)?.mode === 2 && legacyIntakeMode("DESIGN_BASED", null)?.mode === 3 && legacyIntakeMode("THEORETICAL", null)?.mode === 1 && legacyIntakeMode(null, "SECONDARY")?.mode === 5);
check("older fields: 'Practical' is ambiguous (build or lab)", legacyIntakeMode("PRACTICAL", null) === null && legacyIntakeMode("NOT_APPLICABLE", "PRIMARY") === null);
check("older fields: the project type wins over the data field", legacyIntakeMode("SURVEY_BASED", "SECONDARY")?.mode === 2);

// ─── Classification ─────────────────────────────────────────────────────────
// The spec's first example card: all three signals agree.
const c1 = classifyMode({ department: "Business Administration", topic: "Perception of customers towards mobile banking in Lagos", answer: "B" });
check("card 1: Mode 2, by the client's answer, HIGH, no conflict", c1.recommendedMode === 2 && c1.recommendedBy === "CLIENT_ANSWER" && c1.confidence === "HIGH" && !c1.conflictDetected, c1);
check("card 1: section BUSINESS, nothing to pick, APA suggested", c1.section === "BUSINESS" && !c1.needsSectionPick && !c1.needsModePick && c1.suggestedReferencingStyle === "APA_7TH");
// The spec's conflict card, as corrected: Accounting is always Mode 5.
const c2 = classifyMode({ department: "Accounting", topic: "Determinants of inflation in Nigeria", answer: "B" });
check("conflict: Accounting stays Mode 5 whatever the client answered", c2.recommendedMode === 5 && c2.recommendedBy === "LOCKED_DEPARTMENT" && c2.conflictDetected && c2.confidence === "LOW", c2);
check("conflict: the reasons say why", c2.conflicts.some((c) => c.includes("client answered B")) && c2.conflicts.some((c) => c.includes("always Mode 5")), c2.conflicts);
const c3 = classifyMode({ department: "Economics", topic: "Attitude of traders towards cashless policy", answer: "B" });
check("conflict: Economics with a survey answer recommends 2 and flags the default 5", c3.recommendedMode === 2 && c3.conflicts.some((c) => c.includes("Economics defaults to Mode 5")) && c3.section === "BUSINESS", c3);
const c4 = classifyMode({ department: "Computer Science", topic: "Design and implementation of a hospital management system", answer: "C" });
check("build: Computer Science, three signals agree, section set", c4.recommendedMode === 3 && c4.confidence === "HIGH" && c4.section === "COMPUTER_SCIENCE" && !c4.needsSectionPick, c4);
const c5 = classifyMode({ department: "Mass Communication", topic: "A mobile news app for campus radio", answer: "C" });
check("Mode 3 outside Engineering/Computing: the COO must pick, never guessed", c5.recommendedMode === 3 && c5.section === null && c5.needsSectionPick && c5.sectionOptions.join() === "COMPUTER_SCIENCE,ENGINEERING", c5);
const c6 = classifyMode({ department: "Civil Engineering", topic: "Compressive strength of concrete with rice husk ash" });
check("A7: Civil Engineering lab topic recommends Mode 4, flags default 3, adds the note", c6.recommendedMode === 4 && c6.recommendedBy === "KEYWORDS" && c6.conflictDetected && c6.notes.length === 1 && c6.section === "ENGINEERING", c6);
const c7 = classifyMode({ department: "History", topic: "A critical analysis of colonial taxation in Benin" });
check("thematic: History Mode 1, HIGH, Chicago notes-bibliography suggested", c7.recommendedMode === 1 && c7.confidence === "HIGH" && c7.section === "HUMANITIES" && c7.suggestedReferencingStyle === "CHICAGO_NOTES_BIBLIOGRAPHY", c7);
const c8 = classifyMode({ department: "Physics", topic: "Solar radiation measurements in Ibadan" });
check("A9: Physics with no signal = the COO picks the mode", c8.recommendedMode === null && c8.needsModePick && c8.confidence === "LOW", c8);
const c9 = classifyMode({ department: "Physics", topic: "Solar radiation measurements in Ibadan", answer: "D" });
check("wording: three sections read as a list", problemsOf({ department: "Physics", modeNumber: 4, referencingStyle: "APA_7TH" }).some((p) => p.includes("Agriculture, Engineering or Medical Science")), problemsOf({ department: "Physics", modeNumber: 4, referencingStyle: "APA_7TH" }));
check("A9: Physics with a lab answer still needs the section picked", c9.recommendedMode === 4 && c9.needsSectionPick && c9.sectionOptions.join() === "AGRICULTURE,ENGINEERING,MEDICAL_SCIENCE", c9);
const c10 = classifyMode({ department: "Law", topic: "Legal framework for data protection", answer: "C" });
check("Law with a build answer: never recommends Mode 3; the keywords give Mode 1 and the answer is a conflict", c10.recommendedMode === 1 && c10.recommendedBy === "KEYWORDS" && c10.section === "LAW_DOCTRINAL" && c10.conflicts.some((c) => c.includes("client answered C") && c.includes("Law cannot take Mode 3")), c10);
check("Accounting: one plain message for a disallowed answer", c2.conflicts.filter((c) => c.includes("always Mode 5")).length === 1 && c2.conflicts[0] === "The client answered B (survey, Mode 2), but Accounting is always Mode 5.", c2.conflicts);
const c11 = classifyMode({ department: "Agricultural Economics", topic: "Adoption of improved cassava varieties", answer: "B" });
check("A8: Agricultural Economics collecting its own data is flagged", c11.recommendedMode === 2 && c11.conflicts.some((c) => c.includes("defaults to Mode 5")), c11);
const c12 = classifyMode({ department: "Business Administration", topic: "Perception of staff towards appraisal", projectType: "THEORETICAL" });
check("older fields rank below keywords", c12.recommendedMode === 2 && c12.recommendedBy === "KEYWORDS" && c12.intakeFields?.mode === 1 && c12.conflictDetected, c12);
const c13 = classifyMode({ department: "Nursing", topic: "Wound care practices" });
check("department default only = MEDIUM", c13.recommendedMode === 2 && c13.recommendedBy === "DEPARTMENT_DEFAULT" && c13.confidence === "MEDIUM" && c13.suggestedReferencingStyle === "NMCN", c13);
const c14 = classifyMode({ department: "Engineering", topic: "Design and development of a solar dryer" });
check("a group label: keywords still recommend, but no section", c14.recommendedMode === 3 && c14.section === null && c14.allowedModes.length === 0, c14);
const c15 = classifyMode({ department: "Business Administration", topic: "Impact of automated attendance" });
check("a keyword tie is a conflict", c15.conflictDetected && c15.conflicts.some((c) => c.includes("equally")), c15.conflicts);

// ─── The COO's decision ─────────────────────────────────────────────────────
const base: ModeDecision = { department: "Business Administration", modeNumber: 2, referencingStyle: "APA_7TH" };
const ok = validateModeDecision(base);
check("decision: a plain survey is valid", ok.ok && ok.section === "BUSINESS" && ok.template === "A", ok);
check("decision: Accounting cannot be Mode 2", problemsOf({ ...base, department: "Accounting" }).some((p) => p.includes("always Mode 5")));
check("decision: Mode 3 in Mass Communication needs a section", problemsOf({ ...base, department: "Mass Communication", modeNumber: 3 }).some((p) => p.includes("Pick the section") && p.includes("Engineering or Computer Science") === false && p.includes("Computer Science")));
const mcOk = validateModeDecision({ ...base, department: "Mass Communication", modeNumber: 3, section: "COMPUTER_SCIENCE" });
check("decision: ...and is valid with Computer Science", mcOk.ok && mcOk.section === "COMPUTER_SCIENCE");
check("decision: a section not written for the mode is refused", problemsOf({ ...base, department: "Mass Communication", modeNumber: 3, section: "NURSING" }).some((p) => p.includes("NURSING")));
check("A5: Public Health may switch to Nursing", validateModeDecision({ ...base, department: "Public Health", section: "NURSING" }).ok);
check("A6: Computer Engineering may switch to Computer Science", validateModeDecision({ ...base, department: "Computer Engineering", modeNumber: 3, section: "COMPUTER_SCIENCE" }).ok);
check("A4: Banking and Finance may switch to Mode 2", validateModeDecision({ ...base, department: "Banking and Finance", modeNumber: 2 }).ok);
check("B5: Mode 1 needs both thematic titles", problemsOf({ department: "History", modeNumber: 1, referencingStyle: "CHICAGO_NOTES_BIBLIOGRAPHY", thematicTitles: { chapter3: "Trade", chapter4: " " } }).some((p) => p.includes("Chapter 3 and Chapter 4")));
const hist = validateModeDecision({ department: "History", modeNumber: 1, referencingStyle: "CHICAGO_NOTES_BIBLIOGRAPHY", thematicTitles: { chapter3: "Trade", chapter4: "Taxation" } });
check("B5: ...and is valid with them, Template B", hist.ok && hist.template === "B" && hist.section === "HUMANITIES", hist);
check("decision: an over-long title is refused", problemsOf({ department: "History", modeNumber: 1, referencingStyle: "APA_7TH", thematicTitles: { chapter3: "x".repeat(201), chapter4: "y" } }).some((p) => p.includes("longer than")));
check("style: Custom needs the supervisor's format", problemsOf({ ...base, referencingStyle: "CUSTOM" }).some((p) => p.includes("supervisor's referencing format")) && validateModeDecision({ ...base, referencingStyle: "CUSTOM", customStyleText: "Author, year, title" }).ok);
check("style: legacy Chicago needs a variant", problemsOf({ ...base, referencingStyle: "CHICAGO" }).some((p) => p.includes("author-date")));
check("style: unknown styles are refused", problemsOf({ ...base, referencingStyle: "VANCOUVER" }).some((p) => p.includes("referencing style")));
check("placement: NALT cannot be moved off footnotes", problemsOf({ department: "Law", modeNumber: 1, referencingStyle: "NALT", citationPlacement: "MODE_A", thematicTitles: { chapter3: "a", chapter4: "b" } }).some((p) => p.includes("NALT always")));
check("placement: a standard report may choose", validateModeDecision({ ...base, citationPlacement: "MODE_B" }).ok);
check("decision: an unknown department is refused", problemsOf({ ...base, department: "Underwater Basket Weaving" }).some((p) => p.includes("not in the department list")));
check("decision: a group label is refused", problemsOf({ ...base, department: "Engineering" }).some((p) => p.includes("not a department")));
check("decision: the mode must be 1–5", problemsOf({ ...base, modeNumber: 7 }).some((p) => p.includes("1 to 5")));
const law = validateModeDecision({ department: "Law", modeNumber: 2, referencingStyle: "NALT" });
check("Law Mode 2 = non-doctrinal", law.ok && law.section === "LAW_NON_DOCTRINAL", law);

if (failures.length) {
  console.error(`check:modes — ${failures.length} failed, ${passed} passed`);
  for (const f of failures) console.error("  FAIL", f);
  process.exit(1);
}
console.log(`check:modes — all ${passed} checks passed`);
