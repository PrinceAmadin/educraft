/**
 * Postgraduate rules (no database, no Word, no Claude): the three levels, the chapter ceilings, the
 * award each level confers in each department, the word the document calls itself, the reference
 * floors, the abstract bands and which service sells which level.
 *
 * The load-bearing assertion is the last group: an undergraduate report must come out EXACTLY as it
 * did before postgraduate work existed. `check:assembly`'s golden hashes prove that for the whole
 * document; these prove it for each rule on its own.
 *
 *   npm run check:degree-level
 */

import { DegreeLevel as PrismaDegreeLevel } from "@prisma/client";
import {
  DEGREE_LEVELS,
  DEGREE_LEVEL_TEXT,
  POSTGRADUATE_SERVICE_CODES,
  abstractBandFor,
  defaultChaptersFor,
  degreeLevelForService,
  degreeLevelLabel,
  isDegreeLevel,
  isPostgraduate,
  maxChaptersFor,
  MAX_CHAPTER_WORDS,
  WORDS_PER_PAGE,
  chapterWordTarget,
  hasOwnLengthTarget,
  pageTargetFor,
  parsePageRequirement,
  referenceCeiling,
  referenceFloorFor,
  researchTargetFor,
  wholeReportChapters,
  wordTargetFor,
  requiresGreenReviewer,
  workNoun,
  workNounUpper,
  type DegreeLevel,
} from "../src/lib/degree-level";
import { DEGREE_NAMES, degreeName, getDegreeFromDepartment, postgraduateAward } from "../src/lib/generation/department-map";
import { PRELIM_TEXT } from "../src/lib/assembly/assemble";
import { SERVICE_CATALOGUE, RETIRED_SERVICE_CODES } from "../prisma/catalogue";
import { MAX_REPORT_CHAPTERS, isPartialChapterOrder } from "../src/lib/deliverables";
import { GENERATION_TEXT } from "../src/lib/generation/chapter-plan";
import { MAX_REFERENCES, TARGET_REFERENCES } from "../src/lib/services/research";
import { REFERENCE_MINIMUM } from "../src/lib/quality/structural-checks";
import { abstractBand } from "../src/lib/generation/preliminary-pages-rules";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail: unknown = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail !== "" ? ` — ${JSON.stringify(detail)}` : ""}`);
}

// ─── The levels line up with the database ────────────────────────────────────

check(
  "the TS levels are exactly the Prisma enum",
  JSON.stringify([...DEGREE_LEVELS].sort()) === JSON.stringify(Object.values(PrismaDegreeLevel).sort()),
  { ts: DEGREE_LEVELS, prisma: Object.values(PrismaDegreeLevel) },
);
check("UNDERGRADUATE is the first option, so a form defaults to it", DEGREE_LEVELS[0] === "UNDERGRADUATE");
check("isDegreeLevel accepts each level and nothing else", DEGREE_LEVELS.every(isDegreeLevel) && !isDegreeLevel("MASTER") && !isDegreeLevel("") && !isDegreeLevel(null));
check("only the two postgraduate levels are postgraduate", DEGREE_LEVELS.filter(isPostgraduate).join() === "MASTERS,PHD");
check("every level has a label and an intake sentence", DEGREE_LEVELS.every((l) => degreeLevelLabel(l).length > 0 && DEGREE_LEVEL_TEXT.option[l].length > 20));

// ─── Chapters: six is PhD only ───────────────────────────────────────────────

check("an undergraduate report has five chapters at most", maxChaptersFor("UNDERGRADUATE") === 5);
check("a master's dissertation has five chapters at most", maxChaptersFor("MASTERS") === 5);
check("a PhD thesis has six", maxChaptersFor("PHD") === 6);
check("the default chapter count is the ceiling at every level", DEGREE_LEVELS.every((l) => defaultChaptersFor(l) === maxChaptersFor(l)));
check(
  "the chapter sentence names the right count and noun",
  DEGREE_LEVEL_TEXT.chapterLimit("MASTERS") === "A master's dissertation has 5 chapters at most." &&
    DEGREE_LEVEL_TEXT.chapterLimit("PHD") === "A phd thesis has 6 chapters at most.",
  [DEGREE_LEVEL_TEXT.chapterLimit("MASTERS"), DEGREE_LEVEL_TEXT.chapterLimit("PHD")],
);

// ─── The word the document calls itself ──────────────────────────────────────

check("the nouns are project, dissertation, thesis", [workNoun("UNDERGRADUATE"), workNoun("MASTERS"), workNoun("PHD")].join() === "project,dissertation,thesis");
check("the upper-case form is the same word", DEGREE_LEVELS.every((l) => workNounUpper(l) === workNoun(l).toUpperCase()));

// ─── The award each level confers ────────────────────────────────────────────

const AWARDS: [string, DegreeLevel, string][] = [
  ["Computer Science", "UNDERGRADUATE", "B.Sc"],
  ["Computer Science", "MASTERS", "M.Sc"],
  ["Computer Science", "PHD", "Ph.D"],
  ["Electrical and Electronic Engineering", "MASTERS", "M.Eng"],
  ["Law", "UNDERGRADUATE", "LL.B"],
  ["Law", "MASTERS", "LL.M"],
  ["Law", "PHD", "Ph.D"],
  ["History", "MASTERS", "M.A"],
  ["Nursing", "UNDERGRADUATE", "B.NSc"],
  ["Nursing", "MASTERS", "M.Sc"],
];
for (const [dept, level, want] of AWARDS) {
  check(`award: ${dept} at ${level} is ${want}`, getDegreeFromDepartment(dept, { level }) === want, getDegreeFromDepartment(dept, { level }));
}
check("every award the map produces has a full name", Object.values({ ...DEGREE_NAMES }).every((n) => n.length > 3) && degreeName("M.Sc") === "Master of Science" && degreeName("LL.M") === "Master of Laws" && degreeName("Ph.D") === "Doctor of Philosophy");
check("a PhD is Ph.D whatever the first degree", ["B.Sc", "LL.B", "B.Eng", "MBBS", "RN"].every((d) => postgraduateAward(d, "PHD") === "Ph.D"));
check("a school-of-nursing certificate cannot be built on, so a master's there is M.Sc", postgraduateAward("RN", "MASTERS") === "M.Sc" && postgraduateAward("RM", "MASTERS") === "M.Sc");
check("an unknown first degree takes M.Sc for a master's", postgraduateAward("B.Whatever", "MASTERS") === "M.Sc");

// ─── Length, references, abstract ────────────────────────────────────────────

check("page targets rise with the level", pageTargetFor("UNDERGRADUATE").max < pageTargetFor("MASTERS").min && pageTargetFor("MASTERS").max < pageTargetFor("PHD").min);
check("the founder's figures: master's 150-200, PhD 250-400", JSON.stringify([pageTargetFor("MASTERS"), pageTargetFor("PHD")]) === JSON.stringify([{ min: 150, max: 200 }, { min: 250, max: 400 }]));
check("the page sentence defers to the department", DEGREE_LEVEL_TEXT.pageTarget("MASTERS").includes("150-200") && /department/i.test(DEGREE_LEVEL_TEXT.pageTarget("MASTERS")));
check("reference floors rise with the level", referenceFloorFor("UNDERGRADUATE") < referenceFloorFor("MASTERS") && referenceFloorFor("MASTERS") < referenceFloorFor("PHD"));
check("a chapter-based order keeps its floor of 15 at every level", DEGREE_LEVELS.every((l) => referenceFloorFor(l, true) === 15));
check("an undergraduate full report keeps ST12's floor of 35", referenceFloorFor("UNDERGRADUATE") === 35);
check("only postgraduate work gets its own abstract band", abstractBandFor("UNDERGRADUATE") === null && abstractBandFor("MASTERS") !== null && abstractBandFor("PHD") !== null);
check(
  "each postgraduate band is ordered and wider than the house 240-320",
  (["MASTERS", "PHD"] as const).every((l) => {
    const b = abstractBandFor(l)!;
    return b.min < b.targetLo && b.targetLo < b.targetHi && b.targetHi < b.max && b.min >= 300;
  }),
);

// ─── Review ──────────────────────────────────────────────────────────────────

check("only postgraduate chapters need a Green reviewer", !requiresGreenReviewer("UNDERGRADUATE") && requiresGreenReviewer("MASTERS") && requiresGreenReviewer("PHD"));

// ─── Which service sells which level ─────────────────────────────────────────

check("the master's dissertation is THESIS", degreeLevelForService("THESIS") === "MASTERS");
check("the doctoral thesis is PHD-THESIS", degreeLevelForService("PHD-THESIS") === "PHD");
check("the service code is read case- and space-insensitively", degreeLevelForService(" thesis ") === "MASTERS");
check("every other service is undergraduate", ["FYP-FULL", "FYP-CHAPTERS", "SEM", "ENT-PROJ", "PUB", "", null, undefined].every((c) => degreeLevelForService(c) === "UNDERGRADUATE"));
for (const code of POSTGRADUATE_SERVICE_CODES) {
  const row = SERVICE_CATALOGUE.find((s) => s.serviceCode === code);
  check(`catalogue: ${code} exists`, Boolean(row), code);
  check(`catalogue: ${code} is not retired`, !(RETIRED_SERVICE_CODES as readonly string[]).includes(code));
}
const masters = SERVICE_CATALOGUE.find((s) => s.serviceCode === "THESIS");
check("catalogue: the master's dissertation is the founder's flat 120,000", masters?.basePrice === 120000, masters?.basePrice);
check("catalogue: it offers data analysis as one option, not a band of three", masters?.variants?.length === 1 && /data analysis/i.test(masters?.variants?.[0]?.name ?? ""), masters?.variants);
check("catalogue: its option is priced", (masters?.variants?.[0]?.priceAddon ?? 0) > 0, masters?.variants?.[0]?.priceAddon);
const phd = SERVICE_CATALOGUE.find((s) => s.serviceCode === "PHD-THESIS");
check("catalogue: the PhD is quote-only, so it carries no list price", phd?.basePrice === 0 && phd?.pricingModel === "VARIABLE", { price: phd?.basePrice, model: phd?.pricingModel });
check("catalogue: the PhD has no data-analysis option to self-serve", !phd?.variants?.length);

// ─── The length target the planner writes to ─────────────────────────────────

const FIVE = [1, 2, 3, 4, 5];

check("a page requirement is read only when it is a plain number", parsePageRequirement("180") === 180 && parsePageRequirement("180 pages") === 180 && parsePageRequirement("  90  ") === 90);
check("...and anything a client might type instead is ignored, never guessed at", ["Above 90", "Not Specified", "", "as my supervisor says", "1", "99999", null, undefined].every((v) => parsePageRequirement(v) === null));

check("an undergraduate report with no page requirement keeps taking its length from the prompt files", hasOwnLengthTarget("UNDERGRADUATE", null) === false && hasOwnLengthTarget("UNDERGRADUATE", "Not Specified") === false);
check("...but one that asked for a page count gets a real target", hasOwnLengthTarget("UNDERGRADUATE", "180") === true);
check("postgraduate work always has a target, whatever the order says", hasOwnLengthTarget("MASTERS", null) && hasOwnLengthTarget("PHD", "Not Specified"));

for (const level of DEGREE_LEVELS) {
  const band = pageTargetFor(level);
  const mid = Math.round((band.min + band.max) / 2);
  check(`${level}: the whole-report target is the middle of its own page band`, wordTargetFor(level) === mid * WORDS_PER_PAGE, { target: wordTargetFor(level), mid });
  const per = FIVE.map((c) => chapterWordTarget(level, c, FIVE));
  check(`${level}: every chapter gets a workable target`, per.every((w) => w >= 1500 && w <= MAX_CHAPTER_WORDS), per);
  check(`${level}: chapters 2, 3 and 4 are the deep ones (founder, 26 Nov 2026)`, per[1] > per[0] && per[1] > per[4] && per[2] > per[0] && per[3] > per[0], per);
  check(`${level}: no chapter is asked for more than the plan validator allows`, per.every((w) => w <= MAX_CHAPTER_WORDS));
}
check("the client's own page requirement beats the level's band", chapterWordTarget("UNDERGRADUATE", 2, FIVE, 180) > chapterWordTarget("UNDERGRADUATE", 2, FIVE), [chapterWordTarget("UNDERGRADUATE", 2, FIVE, 180), chapterWordTarget("UNDERGRADUATE", 2, FIVE)]);
check("a master's chapter is longer than the same undergraduate chapter", chapterWordTarget("MASTERS", 2, FIVE) > chapterWordTarget("UNDERGRADUATE", 2, FIVE));
check("...and a PhD's longer again", chapterWordTarget("PHD", 2, FIVE) >= chapterWordTarget("MASTERS", 2, FIVE));

check(
  "a whole report written in four chapters still comes out at its full length",
  [1, 2, 3, 4].reduce((n, c) => n + chapterWordTarget("MASTERS", c, [1, 2, 3, 4]), 0) >= wordTargetFor("MASTERS") - 500,
  [1, 2, 3, 4].map((c) => chapterWordTarget("MASTERS", c, [1, 2, 3, 4])),
);
check(
  "a PARTIAL order's chapters are the length they would be in a complete report, so it is shorter, not denser",
  chapterWordTarget("MASTERS", 1, [1, 2], null, { partial: true }) === chapterWordTarget("MASTERS", 1, FIVE) &&
    chapterWordTarget("MASTERS", 2, [1, 2], null, { partial: true }) === chapterWordTarget("MASTERS", 2, FIVE),
  [chapterWordTarget("MASTERS", 2, [1, 2], null, { partial: true }), chapterWordTarget("MASTERS", 2, FIVE)],
);
check("a chapter-based order is what counts as partial", isPartialChapterOrder("FYP-CHAPTERS") && isPartialChapterOrder("FYP-CH4") && isPartialChapterOrder("fyp-ch4"));
check("...and a whole report is not", !isPartialChapterOrder("FYP-FULL") && !isPartialChapterOrder("THESIS") && !isPartialChapterOrder("PHD-THESIS") && !isPartialChapterOrder(null));
check("the partial denominator is the whole report at that level", wholeReportChapters("UNDERGRADUATE").length === 5 && wholeReportChapters("MASTERS").length === 5 && wholeReportChapters("PHD").length === 6);
check("...which is the level's own chapter ceiling", DEGREE_LEVELS.every((l) => wholeReportChapters(l).length === maxChaptersFor(l)));
check("the undergraduate ceiling is still the one the rest of HQ enforces", MAX_REPORT_CHAPTERS === maxChaptersFor("UNDERGRADUATE"));

const sentence = GENERATION_TEXT.chapterLength(9750);
check("the planner is told the target in words and in pages", /9,750 words/.test(sentence) && /39 double-spaced pages/.test(sentence), sentence);
check("...and told to plan to it rather than to the prompt files' page count", /plan to it rather than/i.test(sentence), sentence);

// ─── The gate's floor and the search's target are ONE decision ───────────────
//
// The gate may only ask for a number of citations the research step was told to go and find. These
// are the assertions that make raising one without the other fail the build rather than the report.

for (const level of DEGREE_LEVELS) {
  const floor = referenceFloorFor(level);
  const target = researchTargetFor(level);
  const ceiling = referenceCeiling(target);
  check(`${level}: the search looks for more than the gate demands`, target > floor, { floor, target });
  check(`${level}: with real headroom for the works that are kept but never cited`, target - floor >= 15, { floor, target });
  check(`${level}: the ceiling leaves room above the target`, ceiling > target, { target, ceiling });
  // 40 queries x 12 works a query, of which about 45% pass the relevance check.
  check(`${level}: the OpenAlex query budget can actually supply the target`, target <= Math.round(40 * 12 * 0.45), { target });
}
check("postgraduate work searches for more than undergraduate work", researchTargetFor("MASTERS") > researchTargetFor("UNDERGRADUATE") && researchTargetFor("PHD") > researchTargetFor("MASTERS"));
check("a chapter-based order keeps its own low floor", referenceFloorFor("UNDERGRADUATE", true) < referenceFloorFor("UNDERGRADUATE") && referenceFloorFor("MASTERS", true) === referenceFloorFor("UNDERGRADUATE", true));

check("the research step's own constants are still the undergraduate figures", TARGET_REFERENCES === researchTargetFor("UNDERGRADUATE") && MAX_REFERENCES === referenceCeiling(researchTargetFor("UNDERGRADUATE")));
check("...which are the 50 and 70 it capped at before postgraduate work existed", TARGET_REFERENCES === 50 && MAX_REFERENCES === 70, { TARGET_REFERENCES, MAX_REFERENCES });
check("the gate's exported minimum is still the undergraduate floor", REFERENCE_MINIMUM.full === referenceFloorFor("UNDERGRADUATE") && REFERENCE_MINIMUM.chapterBased === referenceFloorFor("UNDERGRADUATE", true));
check("a ceiling is never below 1, whatever is asked for", referenceCeiling(0) >= 1 && referenceCeiling(-5) >= 1);

// ─── The abstract band ───────────────────────────────────────────────────────

const plain = abstractBand({});
const nalt = abstractBand({ referencingStyle: "NALT" });
check("an undergraduate abstract band is unchanged", plain.min === 240 && plain.max === 320, plain);
check("...and a NALT law report keeps its own", nalt.min === 250 && nalt.max === 350, nalt);
check("a master's abstract is longer than either", (() => {
  const m = abstractBand({ degreeLevel: "MASTERS" });
  return m.min > plain.min && m.min >= nalt.max - 50 && m.max > nalt.max;
})(), abstractBand({ degreeLevel: "MASTERS" }));
check("the level beats NALT, because a dissertation is a bigger document than a long essay", (() => {
  const a = abstractBand({ referencingStyle: "NALT", degreeLevel: "MASTERS" });
  return a.min === abstractBandFor("MASTERS")!.min && a.max === abstractBandFor("MASTERS")!.max;
})());
check("an explicit UNDERGRADUATE level changes nothing", (() => {
  const u = abstractBand({ degreeLevel: "UNDERGRADUATE" });
  const n = abstractBand({ referencingStyle: "NALT", degreeLevel: "UNDERGRADUATE" });
  return u.min === plain.min && u.max === plain.max && n.min === nalt.min && n.max === nalt.max;
})());
for (const level of DEGREE_LEVELS) {
  const b = abstractBand({ degreeLevel: level });
  check(`${level}: the band the page writer is given is the band the gate judges`, b.targetLo >= b.min && b.targetHi <= b.max && b.targetLo < b.targetHi, b);
}

// ─── The undergraduate path is unchanged ─────────────────────────────────────

check(
  "no level given means undergraduate, in every department",
  ["Computer Science", "Law", "Nursing", "History", "Accounting", "Midwifery", "dsafdsgfdg"].every(
    (d) => getDegreeFromDepartment(d) === getDegreeFromDepartment(d, { level: "UNDERGRADUATE" }),
  ),
);
check("a school of nursing still awards the RN when no level is given", getDegreeFromDepartment("Nursing", { institution: "School of Nursing, LUTH" }) === "RN");
check("...and the RM for midwifery", getDegreeFromDepartment("Midwifery", { faculty: "School of Midwifery" }) === "RM");
check(
  "the title page, declaration, certification and dedication are unchanged without a level",
  PRELIM_TEXT.submission("Computer Science", "Science", "UNILAG", "B.Sc") === PRELIM_TEXT.submission("Computer Science", "Science", "UNILAG", "B.Sc", "UNDERGRADUATE") &&
    PRELIM_TEXT.declaration("T", "D", "F", "U", "S") === PRELIM_TEXT.declaration("T", "D", "F", "U", "S", "UNDERGRADUATE") &&
    PRELIM_TEXT.certification("T", "S", "M", "D", "F", "U", "B.Sc") === PRELIM_TEXT.certification("T", "S", "M", "D", "F", "U", "B.Sc", "UNDERGRADUATE") &&
    PRELIM_TEXT.dedication().God === PRELIM_TEXT.dedication("UNDERGRADUATE").God,
);
check("an undergraduate title page still says A PROJECT SUBMITTED", PRELIM_TEXT.submission("Computer Science", "Science", "UNILAG", "B.Sc").startsWith("A PROJECT SUBMITTED TO THE DEPARTMENT OF"));

// ─── And the postgraduate wording is right ───────────────────────────────────

check("a master's title page says A DISSERTATION SUBMITTED", PRELIM_TEXT.submission("Computer Science", "Science", "UNILAG", "M.Sc", "MASTERS").startsWith("A DISSERTATION SUBMITTED TO THE DEPARTMENT OF"));
check("...and names the master's award in full", PRELIM_TEXT.submission("Computer Science", "Science", "UNILAG", "M.Sc", "MASTERS").includes("THE DEGREE OF MASTER OF SCIENCE (M.Sc)"));
check("a PhD title page says A THESIS SUBMITTED and names the doctorate", PRELIM_TEXT.submission("Computer Science", "Science", "UNILAG", "Ph.D", "PHD").startsWith("A THESIS SUBMITTED") && PRELIM_TEXT.submission("Computer Science", "Science", "UNILAG", "Ph.D", "PHD").includes("DOCTOR OF PHILOSOPHY (Ph.D)"));
check("the certification and dedication follow the same noun", PRELIM_TEXT.certification("T", "S", "M", "D", "F", "U", "M.Sc", "MASTERS").includes("this dissertation titled") && PRELIM_TEXT.dedication("PHD").God.startsWith("This thesis is dedicated"));
check("the benchmarking rule names a citation, not just a comparison", /cite/i.test(DEGREE_LEVEL_TEXT.benchmarking) && /standard values or percentages/i.test(DEGREE_LEVEL_TEXT.benchmarking));

if (failures.length) {
  console.error(`check:degree-level — ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:degree-level — all ${passed} checks passed`);
