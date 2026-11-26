/**
 * The NALT law rules (no database, no Claude, no Word): src/lib/law/nalt.ts and
 * the two assembly modules that serve it, held to the NALT Uniform Format and
 * Citation Guide and to a professor-corrected benchmark long essay.
 *
 * The benchmark's own 446 footnotes are the regression fixture: a report a law
 * professor passed must pass EduCraft's own checks.
 *
 * Run: npm run check:nalt
 */

import {
  ABOLISHED_SIGNALS,
  checkCitationSignals,
  checkFootnoteDensity,
  checkQuestionsAgainstObjectives,
  FOOTNOTE_DENSITY,
  followsNalt,
  footnotesExpected,
  headingProfileFor,
  HOUSE_HEADINGS,
  isLawSection,
  NALT_ABSTRACT,
  NALT_BIBLIOGRAPHY_PARTS,
  NALT_BIBLIOGRAPHY_TITLE,
  NALT_CHAPTERS,
  NALT_CHAPTER_TITLES,
  NALT_HEADINGS,
  NALT_OBJECTIVES,
  NALT_PRELIMINARIES,
  NALT_RESEARCH_QUESTIONS_MAX,
  NALT_SECTIONS,
  NALT_TEXT,
} from "../src/lib/law/nalt";
import { collectFootnotes, distinctFootnoteCount } from "../src/lib/assembly/footnotes";
import { isShortForm, primaryGroupOf, primarySourcesFrom, withoutPinpoint, PRIMARY_GROUPS } from "../src/lib/assembly/bibliography";
import { abstractBand, ABSTRACT_MAX_WORDS, ABSTRACT_MIN_WORDS } from "../src/lib/generation/preliminary-pages-rules";
import { LOADER_TEXT } from "../src/lib/generation/prompt-loader";
import { requiredSections } from "../src/lib/quality/required-sections";
import { citationPlacementFor, effectivePlacement } from "../src/lib/generation/referencing";
import { BENCHMARK_FOOTNOTE_LINES } from "./fixtures/nalt-benchmark-footnotes";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ─── Who follows NALT ────────────────────────────────────────────────────────

check("a doctrinal law report follows NALT", followsNalt({ section: "LAW_DOCTRINAL" }));
check("a non-doctrinal law report follows NALT", followsNalt({ section: "LAW_NON_DOCTRINAL" }));
check("a Business report does not", !followsNalt({ section: "BUSINESS" }));
check("…unless its supervisor asked for NALT", followsNalt({ section: "BUSINESS", referencingStyle: "NALT" }));
check("an APA law report still follows NALT's structure", followsNalt({ section: "LAW_DOCTRINAL", referencingStyle: "APA_7TH" }));
check("no section and no style is not NALT", !followsNalt({}));
check("isLawSection names the two law sections", isLawSection("LAW_DOCTRINAL") && isLawSection("LAW_NON_DOCTRINAL"));
check("…and nothing else", !isLawSection("HUMANITIES") && !isLawSection(null) && !isLawSection(undefined));

// ─── Headings ────────────────────────────────────────────────────────────────

eq("NALT headings: H1 capitals, H2 capitals, H3 Title Case", NALT_HEADINGS, { h1: "upper", h2: "upper", h3: "title" });
eq("the house profile is unchanged", HOUSE_HEADINGS, { h1: "upper", h2: "title", h3: "sentence" });
eq("a law report gets NALT's headings", headingProfileFor({ section: "LAW_DOCTRINAL" }), NALT_HEADINGS);
eq("a Business report keeps the house headings", headingProfileFor({ section: "BUSINESS" }), HOUSE_HEADINGS);
eq("a NALT Business report gets NALT's headings", headingProfileFor({ section: "BUSINESS", referencingStyle: "NALT" }), NALT_HEADINGS);

// ─── The five chapters ───────────────────────────────────────────────────────

check("five chapters, never six (six is PhD only)", NALT_CHAPTERS === 5);
eq(
  "NALT Chapter One, doctrinal: seven sections in NALT's order",
  NALT_SECTIONS.LAW_DOCTRINAL[1],
  ["BACKGROUND TO THE STUDY", "STATEMENT OF THE PROBLEM", "AIM AND OBJECTIVES OF THE STUDY", "SCOPE AND LIMITATIONS OF THE STUDY", "SIGNIFICANCE OF THE STUDY", "RESEARCH METHODOLOGY", "SYNOPSIS OF THE CHAPTERS"],
);
eq("NALT Chapter Two: three sections", NALT_SECTIONS.LAW_DOCTRINAL[2], ["CONCEPTUAL CLARIFICATIONS", "THEORETICAL AND HISTORICAL FOUNDATION", "LITERATURE REVIEW"]);
eq(
  "NALT Chapter Five: five sections, the conclusion last",
  NALT_SECTIONS.LAW_DOCTRINAL[5],
  ["SUMMARY OF FINDINGS", "RECOMMENDATIONS", "CONTRIBUTIONS TO KNOWLEDGE", "AREAS FOR FURTHER STUDIES", "CONCLUSION"],
);
check("the conclusion is the last section, not the middle one", NALT_SECTIONS.LAW_DOCTRINAL[5][4] === "CONCLUSION");
check("Contributions to Knowledge is a section of its own", NALT_SECTIONS.LAW_DOCTRINAL[5].includes("CONTRIBUTIONS TO KNOWLEDGE"));
check("no chapter list carries an Introduction section", !([1, 2, 5] as const).some((n) => NALT_SECTIONS.LAW_DOCTRINAL[n].some((s) => /^INTRODUCTION$/.test(s))));
check("the final chapter is the same under both approaches", JSON.stringify(NALT_SECTIONS.LAW_DOCTRINAL[5]) === JSON.stringify(NALT_SECTIONS.LAW_NON_DOCTRINAL[5]));
check("non-doctrinal Chapter One carries the hypotheses", NALT_SECTIONS.LAW_NON_DOCTRINAL[1].some((s) => /HYPOTHES/.test(s)));
check("both approaches carry the synopsis", ([1] as const).every((n) => NALT_SECTIONS.LAW_DOCTRINAL[n].includes("SYNOPSIS OF THE CHAPTERS") && NALT_SECTIONS.LAW_NON_DOCTRINAL[n].includes("SYNOPSIS OF THE CHAPTERS")));
check("Chapter One's scope section covers the limitations", NALT_SECTIONS.LAW_DOCTRINAL[1][3] === "SCOPE AND LIMITATIONS OF THE STUDY");
eq("Chapter Two's title, doctrinal", NALT_CHAPTER_TITLES[2].LAW_DOCTRINAL, "CONCEPTUAL, THEORETICAL FRAMEWORKS AND LITERATURE REVIEW");
eq("Chapter Five's title", NALT_CHAPTER_TITLES[5].LAW_DOCTRINAL, "CONCLUSION");

// The gate requires exactly these, matched on the headings.
for (const section of ["LAW_DOCTRINAL", "LAW_NON_DOCTRINAL"] as const) {
  for (const n of [1, 2, 5] as const) {
    const req = requiredSections(section, n, { mode: section === "LAW_DOCTRINAL" ? 1 : 2, pureScience: false, hasHypotheses: true });
    check(`${section} ch${n}: the gate requires sections`, Array.isArray(req) && req.length > 0);
    if (!Array.isArray(req)) continue;
    for (const wanted of NALT_SECTIONS[section][n]) {
      check(`${section} ch${n}: the gate requires "${wanted}"`, req.some((r) => r.match.test(wanted)));
    }
  }
}
check("chapters three and four are the student's own (thematic)", requiredSections("LAW_DOCTRINAL", 3, { mode: 1, pureScience: false, hasHypotheses: false }) === "THEMATIC");
check("…and chapter four too", requiredSections("LAW_DOCTRINAL", 4, { mode: 1, pureScience: false, hasHypotheses: false }) === "THEMATIC");
check("non-doctrinal chapter three is the methodology, not a thematic chapter", Array.isArray(requiredSections("LAW_NON_DOCTRINAL", 3, { mode: 2, pureScience: false, hasHypotheses: true })));

// ─── Citations go in footnotes ───────────────────────────────────────────────

{
  const nalt = citationPlacementFor("NALT", "B", "LAW_DOCTRINAL");
  eq("NALT cites in page footnotes (MODE C)", nalt, { placement: "MODE_C" });
  const doctrinal = citationPlacementFor("APA_7TH", "B", "LAW_DOCTRINAL");
  eq("doctrinal law cites in page footnotes whatever the style", doctrinal, { placement: "MODE_C" });
  check("the COO cannot move NALT's citations out of the footnotes", "refused" in citationPlacementFor("NALT", "B", "LAW_DOCTRINAL", "MODE_B"));
}

// ─── Aim, objectives and research questions ──────────────────────────────────

check("NALT allows up to six objectives (the house rule allowed five)", NALT_OBJECTIVES.max === 6 && NALT_OBJECTIVES.min === 4);
check("no more than six research questions", NALT_RESEARCH_QUESTIONS_MAX === 6);
eq("five questions against five objectives passes", checkQuestionsAgainstObjectives(5, 5).level, "pass");
eq("the benchmark's six questions against five objectives is a warning, not a refusal", checkQuestionsAgainstObjectives(6, 5).level, "warn");
eq("fewer questions than objectives fails", checkQuestionsAgainstObjectives(4, 5).level, "fail");
eq("seven questions fails", checkQuestionsAgainstObjectives(7, 7).level, "fail");

// ─── The abstract ────────────────────────────────────────────────────────────

eq("a law report's abstract band is 250-350 (founder, 26 Nov 2026)", [NALT_ABSTRACT.min, NALT_ABSTRACT.max], [250, 350]);
eq("a law report is written to that band", [abstractBand({ section: "LAW_DOCTRINAL" }).min, abstractBand({ section: "LAW_DOCTRINAL" }).max], [250, 350]);
eq("every other report keeps the house band", [abstractBand({ section: "BUSINESS" }).min, abstractBand({ section: "BUSINESS" }).max], [ABSTRACT_MIN_WORDS, ABSTRACT_MAX_WORDS]);
check("the benchmark's 283-word abstract is inside the law band", 283 >= NALT_ABSTRACT.min && 283 <= NALT_ABSTRACT.max);
check("the law band's target sits inside it", abstractBand({ section: "LAW_DOCTRINAL" }).targetLo >= 250 && abstractBand({ section: "LAW_DOCTRINAL" }).targetHi <= 350);

// ─── The preliminaries ───────────────────────────────────────────────────────

check("the abstract is the LAST preliminary page", NALT_PRELIMINARIES[NALT_PRELIMINARIES.length - 1] === "ABSTRACT");
check("the table of contents comes before the lists", NALT_PRELIMINARIES.indexOf("TABLE OF CONTENTS") < NALT_PRELIMINARIES.indexOf("LIST OF CASES"));
check("a law report carries a list of cases", NALT_PRELIMINARIES.includes("LIST OF CASES"));
check("…and a list of statutes, treaties and international instruments", NALT_PRELIMINARIES.includes("LIST OF STATUTES, TREATIES AND INTERNATIONAL INSTRUMENTS"));
check("no list of tables or figures is required of a law report", !NALT_PRELIMINARIES.some((p) => /LIST OF (TABLES|FIGURES)/.test(p)));
check("every preliminary title is in capitals", NALT_PRELIMINARIES.every((p) => p === p.toUpperCase()));

// ─── The bibliography ────────────────────────────────────────────────────────

check("it is titled BIBLIOGRAPHY, not References", NALT_BIBLIOGRAPHY_TITLE === "BIBLIOGRAPHY");
eq("it is split primary then secondary", NALT_BIBLIOGRAPHY_PARTS.map((p) => p.title), ["PRIMARY SOURCES", "SECONDARY SOURCES"]);

eq("a treaty is a primary source", primaryGroupOf("Convention on the Rights of the Child (adopted 20 November 1989, entered into force 2 September 1990) 1577 UNTS 3, arts 1 and 38(2)."), "Treaties and International Instruments");
eq("a statute is a primary source", primaryGroupOf("Child's Rights Act 2003 (Nigeria), s 34."), "Statutes and Subsidiary Legislation");
eq("the Constitution is a primary source", primaryGroupOf("Constitution of the Federal Republic of Nigeria 1999 (as amended), s 12(1)."), "Statutes and Subsidiary Legislation");
eq("a case is a primary source", primaryGroupOf("*Prosecutor v Thomas Lubanga Dyilo* (Judgment) ICC-01/04-01/06-2842 (14 March 2012)."), "Cases");
eq("an Re application is a case", primaryGroupOf("*Re Estate of Agboruja* (1949) 19 NLR 38."), "Cases");
eq("a resolution is a primary source", primaryGroupOf("UNSC Res 1612 (26 July 2005) UN Doc S/RES/1612, paras 2-3."), "Resolutions and Official Documents");
eq("a book is not a primary source", primaryGroupOf("David M Rosen, *Armies of the Young* (Rutgers University Press 2005) 8-14."), null);
eq("a journal article is not a primary source", primaryGroupOf("EI Alemika, 'Criminal Justice System and Respect for Human Rights' *Human Rights Review* [2011] (12) (2) 25."), null);
eq("every group is one the bibliography lists", PRIMARY_GROUPS.length, 4);

eq("a statute's pinpoint comes off", withoutPinpoint("Child's Rights Act 2003 (Nigeria), s 34.", "Statutes and Subsidiary Legislation"), "Child's Rights Act 2003 (Nigeria)");
eq("a treaty's article comes off", withoutPinpoint("Convention on the Rights of the Child (adopted 20 November 1989) 1577 UNTS 3, art 1.", "Treaties and International Instruments"), "Convention on the Rights of the Child (adopted 20 November 1989) 1577 UNTS 3");
eq("a case keeps its report page and loses its paragraph", withoutPinpoint("*Prosecutor v Lubanga* (Judgment) ICC-01/04-01/06-2842 (14 March 2012) paras 610-618.", "Cases"), "*Prosecutor v Lubanga* (Judgment) ICC-01/04-01/06-2842 (14 March 2012)");
eq("a reported case keeps its page", withoutPinpoint("*Abacha v Fawehinmi* [2000] FWLR (Pt 4) 533.", "Cases"), "*Abacha v Fawehinmi* [2000] FWLR (Pt 4) 533");

check("ibid is a short form", isShortForm("ibid, art 1."));
check("a cross-reference is a short form", isShortForm("Drumbl (n 24) 96-102."));
check("a full citation is not", !isShortForm("David M Rosen, *Armies of the Young* (Rutgers University Press 2005) 8-14."));

{
  const notes = [
    { text: "Child's Rights Act 2003 (Nigeria), s 34." },
    { text: "Child's Rights Act 2003 (Nigeria), s 277." },
    { text: "ibid, s 34(3)." },
    { text: "*Abacha v Fawehinmi* [2000] FWLR (Pt 4) 533." },
    { text: "UNSC Res 1612 (26 July 2005) UN Doc S/RES/1612, paras 2-3." },
    { text: "David M Rosen, *Armies of the Young* (Rutgers University Press 2005) 8-14." },
  ];
  const primary = primarySourcesFrom(notes);
  eq("the same statute cited twice is listed once", primary.groups.find((g) => g.group === "Statutes and Subsidiary Legislation")?.entries, ["Child's Rights Act 2003 (Nigeria)"]);
  check("a case and a resolution each get their group", primary.groups.length === 3);
  eq("the groups come in NALT's order", primary.groups.map((g) => g.group), ["Statutes and Subsidiary Legislation", "Cases", "Resolutions and Official Documents"]);
  check("the short form is counted, not listed", primary.shortForms === 1);
  check("a secondary work is kept apart for the specialist", primary.secondary.length === 1 && primary.secondary[0].includes("Rosen"));
  check("a report that cites no statute gets no statute heading", primarySourcesFrom([{ text: "David M Rosen, *Armies of the Young* (Rutgers University Press 2005) 8." }]).groups.length === 0);
}

// ─── Footnotes: numbering, markers and the blocks ────────────────────────────

{
  const ch1 = "[H1] INTRODUCTION\n[H2] 1.1 BACKGROUND TO THE STUDY\nThe prohibition is old.^1 It is carried by treaties.^2\n\n[FOOTNOTES]\n1. First note.\n2. Second note.\n";
  const ch2 = "[H1] CONCLUSION\n[H2] 5.1 SUMMARY OF FINDINGS\nThe regime fails.^1\n\n[FOOTNOTES]\n1. Third note.\n";
  const found = collectFootnotes([
    { number: 1, text: ch1 },
    { number: 5, text: ch2 },
  ]);
  eq("footnotes are numbered continuously across the report", found.notes.map((n) => n.number), [1, 2, 3]);
  eq("…in the order their markers appear", found.notes.map((n) => n.text), ["First note.", "Second note.", "Third note."]);
  check("the second chapter's marker is renumbered", found.chapters[1].text.includes("The regime fails.^3"));
  check("the note blocks are taken out of the chapters", !found.chapters.some((c) => /\[FOOTNOTES\]/.test(c.text)));
  check("nothing is dangling or unused", found.dangling.length === 0 && found.unused.length === 0);
  eq("every marker is counted", found.markers, 3);

  const dangling = collectFootnotes([{ number: 1, text: "A claim.^1 Another.^2\n\n[FOOTNOTES]\n1. Only note.\n" }]);
  eq("a marker with no note is reported", dangling.dangling, ["Chapter 1, note 2"]);
  check("…and its marker is removed", !dangling.chapters[0].text.includes("^2"));
  const unused = collectFootnotes([{ number: 1, text: "A claim.^1\n\n[FOOTNOTES]\n1. Used.\n2. Never used.\n" }]);
  eq("a note no marker uses is reported", unused.unused, ["Chapter 1, note 2"]);

  // Unlike document endnotes, two markers on the same note each get their own footnote: Word
  // gives every reference its own, and NALT repeats a source with ibid or (n X) instead.
  const repeated = collectFootnotes([{ number: 1, text: "One.^1 Two.^1\n\n[FOOTNOTES]\n1. The same note.\n" }]);
  eq("two markers on one note become two footnotes", repeated.notes.length, 2);
  eq("…and it is reported", repeated.repeated, 1);
  eq("distinct works are counted once for the reference count", distinctFootnoteCount([{ number: 1, text: "One.^1 Two.^1\n\n[FOOTNOTES]\n1. The same note.\n" }]), 1);

  check("[ENDNOTES] is still accepted as the block name", collectFootnotes([{ number: 1, text: "A claim.^1\n\n[ENDNOTES]\n1. A note.\n" }]).notes.length === 1);
}

// ─── ST17: citation signals ──────────────────────────────────────────────────

for (const signal of ABOLISHED_SIGNALS) {
  if (signal === "id") continue; // checked on its own: a bare "id" is only abolished as "id."
  const problems = checkCitationSignals([{ number: 1, text: "Rosen, *Armies of the Young* (2005) 8." }, { number: 2, text: `Rosen, ${signal} 12.` }]);
  check(`"${signal}" is refused`, problems.some((p) => p.level === "fail" && p.number === 2), JSON.stringify(problems));
}
check('"id." is refused', checkCitationSignals([{ number: 1, text: "A note." }, { number: 2, text: "id. at 14." }]).some((p) => p.level === "fail"));
check("a word that merely contains an abolished signal is left alone", checkCitationSignals([{ number: 1, text: "Jean-Jacques Rousseau, *The Social Contract* (Penguin Books 1968) Book I, ch 4." }]).length === 0);
check("the first footnote cannot be ibid", checkCitationSignals([{ number: 1, text: "ibid, art 1." }]).some((p) => p.level === "fail"));
check("a later ibid is fine", checkCitationSignals([{ number: 1, text: "A note." }, { number: 2, text: "ibid, art 1." }]).length === 0);
check("Ibid with a capital is a warning", checkCitationSignals([{ number: 1, text: "A note." }, { number: 2, text: "Ibid, art 1." }]).some((p) => p.level === "warn"));
check("a forward cross-reference is refused", checkCitationSignals([{ number: 1, text: "Rosen (n 4) 12." }]).some((p) => p.level === "fail"));
check("a cross-reference to itself is refused", checkCitationSignals([{ number: 1, text: "A note." }, { number: 2, text: "Rosen (n 2) 12." }]).some((p) => p.level === "fail"));
check("a cross-reference to a footnote that does not exist is refused", checkCitationSignals([{ number: 5, text: "Rosen (n 3) 12." }]).some((p) => p.level === "fail"));
check("a backward cross-reference is fine", checkCitationSignals([{ number: 1, text: "Rosen, *Armies* (2005) 8." }, { number: 2, text: "Rosen (n 1) 12." }]).length === 0);
check('"et al." is refused — NALT writes "and others"', checkCitationSignals([{ number: 1, text: "Betancourt et al., *Study* (2010) 1088." }]).some((p) => p.level === "fail"));
check('"and others" is accepted', checkCitationSignals([{ number: 1, text: "Betancourt and others, *Study* (2010) 1088." }]).length === 0);

// The benchmark: a report a professor passed must pass ST17 with nothing to say.
{
  const problems = checkCitationSignals(BENCHMARK_FOOTNOTE_LINES);
  const fails = problems.filter((p) => p.level === "fail");
  check(`the benchmark's ${BENCHMARK_FOOTNOTE_LINES.length} footnotes raise no failure`, fails.length === 0, fails.slice(0, 4).map((f) => `#${f.number}: ${f.message}`).join(" | "));
  check("…and no warning either", problems.length === 0, problems.slice(0, 4).map((f) => `#${f.number}: ${f.message}`).join(" | "));
  const ibids = BENCHMARK_FOOTNOTE_LINES.filter((n) => /\bibid\b/i.test(n.text)).length;
  const crossRefs = BENCHMARK_FOOTNOTE_LINES.filter((n) => /\(n\s*\d+\)/.test(n.text)).length;
  check(`the benchmark uses ibid (${ibids}) and cross-references (${crossRefs})`, ibids > 50 && crossRefs > 200);
  check("the benchmark uses none of the abolished signals", !BENCHMARK_FOOTNOTE_LINES.some((n) => /\b(?:supra|infra|op\.?\s*cit|loc\.?\s*cit|passim|et\s*seq)\b/i.test(n.text)));
  check("the benchmark never writes et al.", !BENCHMARK_FOOTNOTE_LINES.some((n) => /\bet\.?\s*al\b/i.test(n.text)));
  const primary = primarySourcesFrom(BENCHMARK_FOOTNOTE_LINES);
  check(`the benchmark's footnotes yield a list of cases (${primary.groups.find((g) => g.group === "Cases")?.entries.length ?? 0})`, (primary.groups.find((g) => g.group === "Cases")?.entries.length ?? 0) >= 8);
  check(`…and a list of treaties (${primary.groups.find((g) => g.group === "Treaties and International Instruments")?.entries.length ?? 0})`, (primary.groups.find((g) => g.group === "Treaties and International Instruments")?.entries.length ?? 0) >= 8);
}

// ─── ST18: footnote density ──────────────────────────────────────────────────

eq("the target is one footnote per 70 words", FOOTNOTE_DENSITY.target, 70);
eq("a chapter at the benchmark's density passes", checkFootnoteDensity(6000, 90).level, "pass");
eq("a thinly sourced chapter warns", checkFootnoteDensity(6000, 40).level, "warn");
eq("a chapter with almost no footnotes fails", checkFootnoteDensity(6000, 20).level, "fail");
eq("a chapter with none fails", checkFootnoteDensity(6000, 0).level, "fail");
eq("a passage too short to judge passes", checkFootnoteDensity(120, 0).level, "pass");
check("the benchmark's own density passes", checkFootnoteDensity(27050, 446).level === "pass");
check("HQ's old law-shaped run would have failed", checkFootnoteDensity(22000, 71).level === "fail");
eq("the expected count for a 5,400-word chapter", footnotesExpected(5400), 77);

// ─── The wording the model and the staff read ────────────────────────────────

check("MODE C tells the model to write a [FOOTNOTES] block", /\[FOOTNOTES\]/.test(LOADER_TEXT.footnotesPage));
check("…and that the assembly numbers them across the report", /continuously across the whole report/.test(LOADER_TEXT.footnotesPage));
check("…and to write no list of its own", /write no footnote list/.test(LOADER_TEXT.footnotesPage));
check("the citation forms give a book an italic title, not quotation marks", /Book: Author Name, \*Title of the Book/.test(LOADER_TEXT.naltCitationForms));
check("…and the author's name as printed in the source", /forename first/.test(LOADER_TEXT.naltCitationForms));
check("…and surname-first only for the bibliography", /surname-first is the bibliography form/.test(LOADER_TEXT.naltCitationForms));
check("…and a case in italics with an unpunctuated v", /case name in italics and an unpunctuated v/.test(LOADER_TEXT.naltCitationForms));
check("…and a statute by its short title", /Statute: its short title/.test(LOADER_TEXT.naltCitationForms));
check("…and the Constitution in full the first time", /CFRN 1999 \(as amended\)/.test(LOADER_TEXT.naltCitationForms));
check("the signals note names every abolished Latin term", ["supra", "infra", "ante", "contra", "id", "op cit", "loc cit", "passim", "et seq"].every((s) => LOADER_TEXT.naltSignals.includes(s)));
check('…and asks for "and others"', /and others/.test(LOADER_TEXT.naltSignals) && /never "et al\."/.test(LOADER_TEXT.naltSignals));
check("…and keeps ibid lower case", /lower case, never italicised/.test(LOADER_TEXT.naltSignals));
check("the headings note asks for UPPER CASE H2", /UPPER CASE/.test(LOADER_TEXT.naltHeadings));
check("…and Title Case H3", /Title Case/.test(LOADER_TEXT.naltHeadings));
check("…and says it replaces the house rule", /replaces the Title Case and sentence case heading rules/.test(LOADER_TEXT.naltHeadings));
check("the density note carries the target", LOADER_TEXT.naltDensity(FOOTNOTE_DENSITY.target).includes(String(FOOTNOTE_DENSITY.target)));
check("the Chapter One note puts the research questions under the problem", /1\.2\.1 Research Questions/.test(LOADER_TEXT.naltChapterOne(NALT_SECTIONS.LAW_DOCTRINAL[1])));
check("…and asks for no literature review in Chapter One", /Do not write a literature review in Chapter One/.test(LOADER_TEXT.naltChapterOne(NALT_SECTIONS.LAW_DOCTRINAL[1])));
check("…and names the synopsis", /SYNOPSIS OF THE CHAPTERS/.test(LOADER_TEXT.naltChapterOne(NALT_SECTIONS.LAW_DOCTRINAL[1])));
check("the Chapter Two note asks for the historical foundation", /historical development/.test(LOADER_TEXT.naltChapterTwo(NALT_CHAPTER_TITLES[2].LAW_DOCTRINAL, NALT_SECTIONS.LAW_DOCTRINAL[2])));
check("…and for no introduction section", /no introduction section/.test(LOADER_TEXT.naltChapterTwo(NALT_CHAPTER_TITLES[2].LAW_DOCTRINAL, NALT_SECTIONS.LAW_DOCTRINAL[2])));
check("the Chapter Five note puts the conclusion last", /The conclusion is the LAST section/.test(LOADER_TEXT.naltChapterFive(NALT_SECTIONS.LAW_DOCTRINAL[5])));
check("…and names the contributions section", /CONTRIBUTIONS TO KNOWLEDGE/.test(LOADER_TEXT.naltChapterFive(NALT_SECTIONS.LAW_DOCTRINAL[5])));
check("…and replaces the unnumbered Template B conclusion", /unnumbered Template B conclusion/.test(LOADER_TEXT.naltChapterFive(NALT_SECTIONS.LAW_DOCTRINAL[5])));
check("the bibliography note asks for none in the chapter", /write no bibliography/.test(LOADER_TEXT.naltBibliography));

// Every sentence the system writes about NALT is in NALT_TEXT, for the founder to read in one place.
for (const [key, value] of Object.entries(NALT_TEXT)) {
  const text = typeof value === "function" ? (value as (...a: never[]) => string)(...([1, 1, 1] as never[])) : value;
  check(`NALT_TEXT.${key} reads as a sentence`, typeof text === "string" && text.trim().length > 10, String(text).slice(0, 40));
}

// ─── Result ──────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`check:nalt — ${failures.length} failed, ${passed} passed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
// ── The placement survives a NULL column ───────────────────────────────────
// ResearchMode.citationPlacement is nullable and nothing on the approval path
// fills it, so every production row is null. A reader that trusts the column
// built a NALT chapter as endnotes while the prompt told the model to write
// page footnotes — H2/AL3 then failed on an "ENDNOTES" heading the report
// should never have had, and the gate marked it unrewritable. 26 Nov 2026.
check("NALT with no stored placement still derives MODE_C", effectivePlacement("NALT", 1, "LAW_DOCTRINAL", null) === "MODE_C", String(effectivePlacement("NALT", 1, "LAW_DOCTRINAL", null)));
check("NALT non-doctrinal with no stored placement is MODE_C", effectivePlacement("NALT", 2, "LAW_NON_DOCTRINAL", null) === "MODE_C", String(effectivePlacement("NALT", 2, "LAW_NON_DOCTRINAL", null)));
check("a stored placement still wins", effectivePlacement("NALT", 1, "LAW_DOCTRINAL", "MODE_C") === "MODE_C");
check("an author-date style derives no note placement", effectivePlacement("APA_7TH", 2, "BUSINESS", null) !== "MODE_C");
check("an unknown style derives nothing", effectivePlacement("NOT_A_STYLE", 1, "LAW_DOCTRINAL", null) === null);
check("no section derives nothing", effectivePlacement("NALT", 1, null, null) === null);

console.log(`check:nalt — all ${passed} checks passed`);
console.log("The law rules match the NALT guide and the professor-corrected benchmark.");
